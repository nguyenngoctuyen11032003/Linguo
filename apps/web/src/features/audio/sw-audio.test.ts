import { AUDIO_BUCKET, audioAssetUrl } from '@linguo/shared';
import { describe, expect, it } from 'vitest';
import { isCacheableMediaRequest, MEDIA_CACHE_NAME } from '../pwa/sw-helpers';
import { CONTENT_AUDIO_BUCKET, CONTENT_AUDIO_CACHE_NAME, CONTENT_AUDIO_MAX_ENTRIES, isContentAudioRequest } from './sw-audio';

const ID = `ko-${'ab'.repeat(16)}`;
const CLIP = audioAssetUrl(ID, 'https://abc.supabase.co')!;
const req = (url: string, over: Partial<{ method: string; destination: string; hasRange: boolean }> = {}) => ({
  url,
  method: 'GET',
  destination: '',
  hasRange: false,
  ...over,
});

describe('sw-audio', () => {
  it('mirrors the shared bucket name and uses its own bounded cache', () => {
    expect(CONTENT_AUDIO_BUCKET).toBe(AUDIO_BUCKET);
    expect(CLIP).toContain(`/public/${CONTENT_AUDIO_BUCKET}/`);
    expect(CONTENT_AUDIO_CACHE_NAME).not.toBe(MEDIA_CACHE_NAME);
    expect(CONTENT_AUDIO_MAX_ENTRIES).toBeGreaterThan(0);
    expect(CONTENT_AUDIO_MAX_ENTRIES).toBeGreaterThanOrEqual(400);
  });

  it('matches a plain GET of a recorded clip (any Supabase origin, local stack included)', () => {
    expect(isContentAudioRequest(req(CLIP))).toBe(true);
    expect(isContentAudioRequest(req(audioAssetUrl(ID, 'http://127.0.0.1:54321')!, { destination: 'audio' }))).toBe(true);
  });

  it('leaves Range requests, other methods and odd URLs to the network', () => {
    expect(isContentAudioRequest(req(CLIP, { hasRange: true }))).toBe(false);
    expect(isContentAudioRequest(req(CLIP, { method: 'HEAD' }))).toBe(false);
    expect(isContentAudioRequest(req(`${CLIP}?download=1`))).toBe(false);
    expect(isContentAudioRequest(req('not a url'))).toBe(false);
    expect(isContentAudioRequest(req(CLIP.replace('https:', 'ftp:')))).toBe(false);
  });

  it('only matches the content-audio id/path shape', () => {
    const base = 'https://abc.supabase.co/storage/v1/object/public';
    expect(isContentAudioRequest(req(`${base}/content-audio/en/${ID}.wav`))).toBe(false); // folder ≠ id language
    expect(isContentAudioRequest(req(`${base}/content-audio/ko/${ID}.mp3`))).toBe(false);
    expect(isContentAudioRequest(req(`${base}/other-bucket/ko/${ID}.wav`))).toBe(false);
    expect(isContentAudioRequest(req(`https://abc.supabase.co/storage/v1/object/content-audio/ko/${ID}.wav`))).toBe(false);
    expect(isContentAudioRequest(req(`${base}/content-audio/ko/${ID.toUpperCase()}.wav`))).toBe(false);
  });

  it('would also be accepted by the generic media rule, so it must be registered first', () => {
    expect(isCacheableMediaRequest(req(CLIP))).toBe(true);
  });
});
