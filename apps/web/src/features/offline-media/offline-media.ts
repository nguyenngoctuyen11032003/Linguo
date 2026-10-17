// Offline copies of lesson media (recorded listening clips, legacy audio files). Downloaded on purpose by the lesson
// downloader and served by the service worker (and by content-audio.ts) from OFFLINE_MEDIA_CACHE.
//
// Today every `audio_asset_id` is null (listen exercises use machine speech) so this is usually a no-op, but the
// moment recordings land, "Tải về học offline" also makes them play with no network. See docs/AUDIO.md.
import { useEffect, useState } from 'react';
import { contentAudioSrc } from '@/features/audio/content-audio';
import { OFFLINE_MEDIA_CACHE } from './constants';
import { isQuotaExceededError } from './storage';

export { OFFLINE_MEDIA_CACHE };

export interface PrecacheOptions {
  /** Called after every URL is settled (cached, skipped or failed). */
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
  /** Parallel downloads. Default 3. */
  concurrency?: number;
}

export interface PrecacheResult {
  /** Newly stored. */
  cached: number;
  /** Already in the cache. */
  skipped: number;
  failed: number;
  /** Bytes newly stored. */
  bytes: number;
  /** Storage ran out: the remaining URLs were not attempted (they count as failed). */
  quotaExceeded?: boolean;
  /** The signal aborted before all URLs were handled. */
  aborted?: boolean;
}

function cacheStorage(): CacheStorage | null {
  try {
    return typeof caches !== 'undefined' ? caches : null;
  } catch {
    return null;
  }
}

/** Query strings never belong to a cached media key (the SW rule matches `search === ''`). */
function cacheKey(url: string): string {
  try {
    const u = new URL(url, typeof location !== 'undefined' ? location.href : undefined);
    u.search = '';
    u.hash = '';
    return u.href;
  } catch {
    return url;
  }
}

/**
 * Downloads `urls` into the offline media cache. CORS fetch (never opaque: an opaque response hides its size and
 * cannot be verified), skips what is already stored, stores only `ok` non-opaque responses and stops at the first
 * QuotaExceededError. Never throws.
 */
export async function precacheLessonAssets(urls: readonly string[], options: PrecacheOptions = {}): Promise<PrecacheResult> {
  const { onProgress, signal } = options;
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? 3));
  const unique = [...new Set(urls.filter((u) => typeof u === 'string' && u.trim() !== '').map(cacheKey))];
  const result: PrecacheResult = { cached: 0, skipped: 0, failed: 0, bytes: 0 };
  const store = cacheStorage();
  if (unique.length === 0) return result;
  if (!store) {
    result.failed = unique.length;
    return result;
  }
  let cache: Cache;
  try {
    cache = await store.open(OFFLINE_MEDIA_CACHE);
  } catch {
    result.failed = unique.length;
    return result;
  }

  let next = 0;
  let done = 0;
  let stop = false;
  const settle = () => {
    done += 1;
    onProgress?.(done, unique.length);
  };

  async function worker(): Promise<void> {
    while (!stop) {
      if (signal?.aborted) {
        result.aborted = true;
        return;
      }
      const index = next++;
      if (index >= unique.length) return;
      const url = unique[index]!;
      try {
        if (await cache.match(url)) {
          result.skipped += 1;
          settle();
          continue;
        }
        const res = await fetch(url, { mode: 'cors', credentials: 'omit', signal });
        if (!res.ok || res.type === 'opaque') {
          result.failed += 1;
          settle();
          continue;
        }
        // Buffer first (clips are small) so the size is known and a truncated download never reaches the cache.
        const blob = await res.blob();
        if (blob.size === 0) {
          result.failed += 1;
          settle();
          continue;
        }
        await cache.put(url, new Response(blob, { status: 200, headers: { 'content-type': res.headers.get('content-type') ?? 'audio/wav' } }));
        result.cached += 1;
        result.bytes += blob.size;
        settle();
      } catch (error) {
        if (signal?.aborted) {
          result.aborted = true;
          return;
        }
        result.failed += 1;
        if (isQuotaExceededError(error)) {
          result.quotaExceeded = true;
          stop = true;
        }
        settle();
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, () => worker()));
  // URLs never attempted after a quota stop count as failed.
  if (result.quotaExceeded) result.failed += unique.length - done;
  return result;
}

/** True when the clip is stored in the offline media cache. */
export async function hasAsset(url: string): Promise<boolean> {
  const store = cacheStorage();
  if (!store) return false;
  try {
    const cache = await store.open(OFFLINE_MEDIA_CACHE);
    return (await cache.match(cacheKey(url))) !== undefined;
  } catch {
    return false;
  }
}

/** Removes the given URLs from the offline media cache; resolves to how many were deleted. */
export async function uncacheAssets(urls: readonly string[]): Promise<number> {
  const store = cacheStorage();
  if (!store) return 0;
  try {
    const cache = await store.open(OFFLINE_MEDIA_CACHE);
    let removed = 0;
    for (const url of new Set(urls.map(cacheKey))) {
      if (await cache.delete(url)) removed += 1;
    }
    return removed;
  } catch {
    return 0;
  }
}

/** Total bytes of the offline media cache (0 when empty or unsupported). */
export async function offlineMediaSize(): Promise<number> {
  const store = cacheStorage();
  if (!store) return 0;
  try {
    if (!(await store.has(OFFLINE_MEDIA_CACHE))) return 0;
    const cache = await store.open(OFFLINE_MEDIA_CACHE);
    let total = 0;
    for (const request of await cache.keys()) {
      const res = await cache.match(request);
      if (!res) continue;
      const length = Number(res.headers.get('content-length'));
      total += Number.isFinite(length) && length > 0 ? length : (await res.blob()).size;
    }
    return total;
  } catch {
    return 0;
  }
}

/** Deletes every downloaded media file (the "Xoá dữ liệu ngoại tuyến" action). */
export async function clearOfflineMedia(): Promise<void> {
  const store = cacheStorage();
  if (!store) return;
  try {
    await store.delete(OFFLINE_MEDIA_CACHE);
  } catch {
    // nothing to clear
  }
}

/** Minimal structural view of a lesson pack (get_lesson / offline_lesson_packs `{ items, exercises }`). */
export interface LessonPackLike {
  items?: ReadonlyArray<{ audio_path?: string | null }> | null;
  exercises?: ReadonlyArray<{ type?: string; prompt?: unknown }> | null;
}

/**
 * Every media URL a lesson needs offline: item audio (flashcards) and listen-exercise recordings. Resolved with
 * contentAudioSrc (never hand-built), deduplicated, without query strings. Lessons without recordings give [].
 */
export function lessonAssetUrls(pack: LessonPackLike | null | undefined, supabaseUrl?: string): string[] {
  const urls = new Set<string>();
  const add = (id: unknown) => {
    if (typeof id !== 'string' || !id.trim()) return;
    const src = supabaseUrl === undefined ? contentAudioSrc(id) : contentAudioSrc(id, supabaseUrl);
    if (src) urls.add(cacheKey(src));
  };
  for (const item of pack?.items ?? []) add(item.audio_path);
  for (const exercise of pack?.exercises ?? []) {
    if (exercise.type !== 'listen') continue;
    const prompt = exercise.prompt;
    if (prompt && typeof prompt === 'object') add((prompt as { audio_asset_id?: unknown }).audio_asset_id);
  }
  return [...urls];
}

export interface AssetsCachedState {
  /** How many of `urls` are stored offline. */
  cached: number;
  total: number;
  /** The first lookup finished (before that `cached` is 0 and not meaningful). */
  ready: boolean;
  /** Every URL is stored (true for an empty list). */
  complete: boolean;
}

/** Whether a lesson's media is already downloaded; re-checks when the URL list changes. */
export function useAssetsCached(urls: readonly string[]): AssetsCachedState {
  const key = urls.join('\n');
  const [state, setState] = useState<{ key: string; cached: number }>({ key: '', cached: 0 });
  useEffect(() => {
    let live = true;
    const list = key ? key.split('\n') : [];
    void Promise.all(list.map((url) => hasAsset(url))).then((flags) => {
      if (live) setState({ key, cached: flags.filter(Boolean).length });
    });
    return () => {
      live = false;
    };
  }, [key]);
  const total = key ? key.split('\n').length : 0;
  const ready = state.key === key;
  const cached = ready ? state.cached : 0;
  return { cached, total, ready: total === 0 || ready, complete: total === 0 || (ready && cached === total) };
}
