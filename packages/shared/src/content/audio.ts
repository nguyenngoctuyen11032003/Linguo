// Recorded listening audio (docs/AUDIO.md). Files are generated offline by scripts/generate-audio.mjs and stored in
// the public Supabase Storage bucket `content-audio` (migration 20261017000200_content_audio.sql).
//
// URL contract (stable; the web resolves an `audio_asset_id` with audioAssetUrl):
//   ${VITE_SUPABASE_URL}/storage/v1/object/public/content-audio/<lang>/<audio_asset_id>.wav
// audio_asset_id = `<lang>-<32 lowercase hex>` — the language is part of the id, so no extra argument is needed.

/** Storage bucket holding listening audio (public read, service_role write). */
export const AUDIO_BUCKET = 'content-audio';
/** File extension of every asset in the bucket (RIFF/WAVE, PCM 16-bit mono 24 kHz). */
export const AUDIO_ASSET_EXT = 'wav';
export const AUDIO_ASSET_MIME = 'audio/wav';
/** `<lang>-<first 32 hex chars of sha256(lang \n voice \n NFC text)>`. */
export const AUDIO_ASSET_ID_RE = /^([a-z]{2})-([0-9a-f]{32})$/;

/** True when `id` has the generated audio id shape. */
export function isAudioAssetId(id: unknown): id is string {
  return typeof id === 'string' && AUDIO_ASSET_ID_RE.test(id);
}

/** Language code embedded in an audio id (`ko` for `ko-…`), or null when the id is not one. */
export function audioAssetLang(id: unknown): string | null {
  if (typeof id !== 'string') return null;
  const m = AUDIO_ASSET_ID_RE.exec(id);
  return m ? m[1]! : null;
}

/** Object path inside the bucket: `<lang>/<id>.wav`, or null for a missing/unknown id. */
export function audioAssetPath(id: string | null | undefined): string | null {
  const lang = audioAssetLang(id);
  return lang ? `${lang}/${id}.${AUDIO_ASSET_EXT}` : null;
}

/**
 * Public URL of a listening audio file, or null when there is no (valid) recording — the caller then falls back to
 * speech synthesis of the text. `supabaseUrl` is the project URL (VITE_SUPABASE_URL); trailing slashes are ignored.
 */
export function audioAssetUrl(id: string | null | undefined, supabaseUrl: string): string | null {
  const path = audioAssetPath(id);
  const base = supabaseUrl.trim().replace(/\/+$/, '');
  if (!path || !base) return null;
  return `${base}/storage/v1/object/public/${AUDIO_BUCKET}/${path}`;
}
