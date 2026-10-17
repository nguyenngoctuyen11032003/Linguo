// Resolves listening audio ids to URLs and downloads clips for the players (docs/AUDIO.md).
import { audioAssetLang, audioAssetUrl, isAudioAssetId } from '@linguo/shared';
import { audioUrl } from '@/components/exercise/exercise-utils';
import { detectScriptLang } from '@/components/exercise/machine-speech';
import type { TtsLanguage } from '@/features/exam/tts';
import { OFFLINE_MEDIA_CACHE } from '@/features/offline-media/constants';
import { env } from '@/lib/env';

/** Playback speeds offered by the player: normal and slow. */
export type ContentAudioRate = 1 | 0.75;
export const NORMAL_AUDIO_RATE: ContentAudioRate = 1;
export const SLOW_AUDIO_RATE: ContentAudioRate = 0.75;

/**
 * URL of a listening clip, or null when there is nothing to play (the caller then uses machine speech).
 * A generated id (`ko-<hex>`) resolves to the public `content-audio` bucket; any other non-empty value is a legacy
 * path/URL and keeps its old resolution (app assets folder or absolute URL).
 */
export function contentAudioSrc(id: string | null | undefined, supabaseUrl: string = env.supabaseUrl): string | null {
  if (!id?.trim()) return null;
  if (audioAssetLang(id) !== null) return audioAssetUrl(id, supabaseUrl);
  return audioUrl(id.trim());
}

/** Language of the machine-speech fallback: the one in a generated id, else guessed from the text's script. */
export function fallbackSpeechLang(id: string | null | undefined, text: string): TtsLanguage {
  const lang = audioAssetLang(id);
  return lang === 'en' || lang === 'ko' || lang === 'ja' || lang === 'de' ? lang : detectScriptLang(text);
}

/** Why a clip could not be loaded: not stored for offline use, an HTTP error, an empty file, or the network failed. */
export type AudioLoadReason = 'offline_uncached' | 'http' | 'empty' | 'network';

/** Rejection of loadAudioObjectUrl (abort errors are passed through untouched). `message` keeps the legacy codes. */
export class AudioLoadError extends Error {
  readonly reason: AudioLoadReason;
  readonly status: number | null;
  constructor(reason: AudioLoadReason, options: { status?: number; cause?: unknown } = {}) {
    super(
      reason === 'http'
        ? `audio_http_${options.status ?? 0}`
        : reason === 'empty'
          ? 'audio_empty'
          : reason === 'offline_uncached'
            ? 'audio_offline_uncached'
            : 'audio_network',
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = 'AudioLoadError';
    this.reason = reason;
    this.status = options.status ?? null;
  }
}

/** The reason of a failed load; anything that is not an AudioLoadError counts as a network failure. */
export function audioLoadReason(error: unknown): AudioLoadReason {
  return error instanceof AudioLoadError ? error.reason : 'network';
}

/** A stored copy of the clip (downloaded lesson or earlier listen), looked up without touching the network. */
async function cachedClip(src: string): Promise<Response | null> {
  try {
    if (typeof caches === 'undefined') return null;
    // Same keys the service worker uses: the downloaded-media cache first, then any runtime cache.
    const hit = (await caches.match(src, { cacheName: OFFLINE_MEDIA_CACHE })) ?? (await caches.match(src));
    return hit?.ok ? hit : null;
  } catch {
    return null;
  }
}

/**
 * Downloads a clip and returns an object URL for it (the caller revokes it). fetch() rather than <audio src> so the
 * service worker can cache the whole file (offline replay) and an HTTP error is detected before playing. A copy that
 * was downloaded for offline use (or heard before) is used without a request; with no network and no copy it fails
 * at once as `offline_uncached` instead of hanging.
 * Rejects with an AudioLoadError (`audio_http_<status>`, `audio_empty`, `audio_offline_uncached`, `audio_network`);
 * an abort rejects with the abort error.
 */
export async function loadAudioObjectUrl(src: string, signal?: AbortSignal): Promise<string> {
  let res = await cachedClip(src);
  if (!res) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new AudioLoadError('offline_uncached');
    try {
      res = await fetch(src, { credentials: 'omit', signal });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new AudioLoadError(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline_uncached' : 'network', { cause: error });
    }
    if (!res.ok) throw new AudioLoadError('http', { status: res.status });
  }
  const blob = await res.blob();
  if (blob.size === 0) throw new AudioLoadError('empty');
  return URL.createObjectURL(blob);
}

/** Generated recordings are downloaded first (cacheable, errors detected); legacy paths play straight from src. */
export function shouldDownload(id: string): boolean {
  return isAudioAssetId(id);
}

/**
 * Plays a clip once from the start (exam listening, which counts plays). `onStarted` fires once playback really
 * began; resolves `true` when it ends, `false` when it could not play (unknown id, network error, autoplay block).
 */
export function playContentAudioOnce(id: string, onStarted: () => void): Promise<boolean> {
  const src = contentAudioSrc(id);
  if (!src) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    let objectUrl: string | null = null;
    const done = (ok: boolean) => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = null;
      resolve(ok);
    };
    const start = (url: string) => {
      try {
        const audio = new Audio(url);
        audio.onended = () => done(true);
        audio.onerror = () => done(false);
        const played = audio.play() as Promise<void> | undefined;
        if (played && typeof played.then === 'function') played.then(onStarted, () => done(false));
        else onStarted();
      } catch {
        done(false);
      }
    };
    if (!shouldDownload(id)) {
      start(src);
      return;
    }
    loadAudioObjectUrl(src).then(
      (url) => {
        objectUrl = url;
        start(url);
      },
      () => done(false),
    );
  });
}
