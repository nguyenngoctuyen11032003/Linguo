import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearOfflineMedia, hasAsset, lessonAssetUrls, offlineMediaSize, OFFLINE_MEDIA_CACHE, precacheLessonAssets, uncacheAssets } from './offline-media';
import { installCacheStub } from './test-stubs';

const SUPABASE = 'https://proj.supabase.co';
const ID_A = `ko-${'a'.repeat(32)}`;
const ID_B = `en-${'b'.repeat(32)}`;
const urlOf = (id: string) => `${SUPABASE}/storage/v1/object/public/content-audio/${id.slice(0, 2)}/${id}.wav`;

function audioResponse(bytes = 100): Response {
  return new Response(new Uint8Array(bytes), { status: 200, headers: { 'content-type': 'audio/wav' } });
}

describe('lessonAssetUrls', () => {
  it('collects item audio and listen-exercise recordings through contentAudioSrc, deduplicated', () => {
    const urls = lessonAssetUrls(
      {
        items: [{ audio_path: ID_A }, { audio_path: ID_A }, { audio_path: null }],
        exercises: [
          { type: 'listen', prompt: { audio_asset_id: ID_B } },
          { type: 'listen', prompt: { audio_asset_id: null } },
          { type: 'mcq', prompt: { audio_asset_id: ID_A } },
        ],
      },
      SUPABASE,
    );
    expect(urls).toEqual([urlOf(ID_A), urlOf(ID_B)]);
    expect(urls.every((u) => !u.includes('?'))).toBe(true);
  });

  it('is empty for lessons without recordings (today: every audio_asset_id is null)', () => {
    expect(lessonAssetUrls({ items: [{ audio_path: null }], exercises: [{ type: 'listen', prompt: { audio_asset_id: null } }] }, SUPABASE)).toEqual([]);
    expect(lessonAssetUrls(null)).toEqual([]);
  });
});

describe('offline media cache', () => {
  let stub: ReturnType<typeof installCacheStub>;
  beforeEach(() => {
    stub = installCacheStub();
  });
  afterEach(() => {
    stub.restore();
    vi.restoreAllMocks();
  });

  it('downloads, skips what is stored, and reports bytes', async () => {
    const fetchMock = vi.fn(async () => audioResponse(250));
    vi.stubGlobal('fetch', fetchMock);
    const progress = vi.fn();
    const first = await precacheLessonAssets([urlOf(ID_A), urlOf(ID_B), urlOf(ID_A)], { onProgress: progress });
    expect(first).toMatchObject({ cached: 2, skipped: 0, failed: 0, bytes: 500 });
    expect(progress).toHaveBeenLastCalledWith(2, 2);
    expect(fetchMock.mock.calls[0]).toEqual([urlOf(ID_A), expect.objectContaining({ mode: "cors", credentials: "omit" })]);

    const second = await precacheLessonAssets([urlOf(ID_A), urlOf(ID_B)]);
    expect(second).toMatchObject({ cached: 0, skipped: 2, failed: 0, bytes: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await hasAsset(urlOf(ID_A))).toBe(true);
    expect(await offlineMediaSize()).toBe(500);
  });

  it('never stores non-ok or opaque responses', async () => {
    const opaque = audioResponse();
    Object.defineProperty(opaque, 'type', { value: 'opaque' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => (url === urlOf(ID_A) ? new Response('nope', { status: 404 }) : opaque)),
    );
    const result = await precacheLessonAssets([urlOf(ID_A), urlOf(ID_B)]);
    expect(result).toMatchObject({ cached: 0, failed: 2 });
    expect(await hasAsset(urlOf(ID_A))).toBe(false);
    expect(await hasAsset(urlOf(ID_B))).toBe(false);
  });

  it('counts network failures and keeps going', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === urlOf(ID_A)) throw new TypeError('Failed to fetch');
        return audioResponse();
      }),
    );
    const result = await precacheLessonAssets([urlOf(ID_A), urlOf(ID_B)], { concurrency: 1 });
    expect(result).toMatchObject({ cached: 1, failed: 1 });
  });

  it('stops at the first QuotaExceededError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => audioResponse()));
    stub.failPutWith(new DOMException('full', 'QuotaExceededError'));
    const ids = Array.from({ length: 5 }, (_, i) => urlOf(`ko-${String(i).repeat(32)}`));
    const result = await precacheLessonAssets(ids, { concurrency: 1 });
    expect(result.quotaExceeded).toBe(true);
    expect(result.cached).toBe(0);
    expect(result.failed).toBe(5);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it('stops when the signal aborts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => audioResponse()));
    const controller = new AbortController();
    controller.abort();
    const result = await precacheLessonAssets([urlOf(ID_A)], { signal: controller.signal });
    expect(result.aborted).toBe(true);
    expect(result.cached).toBe(0);
  });

  it('uncaches and clears', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => audioResponse()));
    await precacheLessonAssets([urlOf(ID_A), urlOf(ID_B)]);
    expect(await uncacheAssets([urlOf(ID_A)])).toBe(1);
    expect(await hasAsset(urlOf(ID_A))).toBe(false);
    expect(await hasAsset(urlOf(ID_B))).toBe(true);
    await clearOfflineMedia();
    expect(stub.names()).not.toContain(OFFLINE_MEDIA_CACHE);
    expect(await offlineMediaSize()).toBe(0);
  });

  it('is a safe no-op without the Cache API', async () => {
    stub.restore();
    vi.stubGlobal('caches', undefined);
    expect(await precacheLessonAssets([urlOf(ID_A)])).toMatchObject({ cached: 0, failed: 1 });
    expect(await hasAsset(urlOf(ID_A))).toBe(false);
    expect(await offlineMediaSize()).toBe(0);
    await expect(clearOfflineMedia()).resolves.toBeUndefined();
  });
});
