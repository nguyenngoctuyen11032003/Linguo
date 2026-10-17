// Service-worker rule for recorded listening audio (docs/AUDIO.md). Pure, no DOM/WebWorker globals and no
// @linguo/shared import (keeps the SW bundle tiny); sw-audio.test.ts pins the bucket name against AUDIO_BUCKET.
import type { MediaRequestInfo } from '../pwa/sw-helpers';

/** Bucket of recorded listening audio; mirrors AUDIO_BUCKET in packages/shared/src/content/audio.ts. */
export const CONTENT_AUDIO_BUCKET = 'content-audio';
/** Separate cache so recordings never evict images (and vice versa). */
export const CONTENT_AUDIO_CACHE_NAME = 'linguo-content-audio-v1';
/** WAV clips are 50–500 KB; 400 stays around 100 MB at worst. Clips downloaded on purpose live in OFFLINE_MEDIA_CACHE instead. */
export const CONTENT_AUDIO_MAX_ENTRIES = 400;
/** Asset ids are content hashes, so a file never changes under its URL: keep it three months. */
export const CONTENT_AUDIO_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

/** `/storage/v1/object/public/content-audio/<lang>/<lang>-<32 hex>.wav` (the URL contract of audioAssetUrl). */
const CONTENT_AUDIO_PATH = /^\/storage\/v1\/object\/public\/content-audio\/([a-z]{2})\/\1-[0-9a-f]{32}\.wav$/;

/**
 * True for a plain GET of a recorded listening clip. The player downloads clips with fetch() (no Range header), so
 * one full 200 is cached; Range requests (an <audio src> seeking) go to the network as before.
 */
export function isContentAudioRequest(req: MediaRequestInfo): boolean {
  if (req.method !== 'GET' || req.hasRange) return false;
  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  return url.search === '' && CONTENT_AUDIO_PATH.test(url.pathname);
}
