import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubSpeechSynthesis } from '../../../tests/unit/speech-synthesis';
import { OFFLINE_MEDIA_CACHE } from '../offline-media/constants';
import { installCacheStub } from '../offline-media/test-stubs';
import { ContentAudio } from './ContentAudio';
import { AudioLoadError, audioLoadReason, loadAudioObjectUrl } from './content-audio';

const envMock = vi.hoisted(() => ({ supabaseUrl: 'https://abc.supabase.co' }));
vi.mock('@/lib/env', () => ({ env: envMock }));

const ID = `ko-${'0a'.repeat(16)}`;
const SRC = `https://abc.supabase.co/storage/v1/object/public/content-audio/ko/${ID}.wav`;

let stub: ReturnType<typeof installCacheStub>;
let fetchMock: ReturnType<typeof vi.fn>;
let online: boolean;

beforeEach(() => {
  stub = installCacheStub();
  online = true;
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
  fetchMock = vi.fn(async () => new Response(new Blob([new Uint8Array([1, 2])], { type: 'audio/wav' }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:clip');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event('playing'));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});

afterEach(() => {
  stub.restore();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function store(cacheName: string, body = new Uint8Array([9, 9, 9])) {
  const cache = await caches.open(cacheName);
  await cache.put(SRC, new Response(body, { status: 200, headers: { 'content-type': 'audio/wav' } }));
}

describe('loadAudioObjectUrl offline', () => {
  it('uses the downloaded copy without a request, even with no network', async () => {
    await store(OFFLINE_MEDIA_CACHE);
    online = false;
    await expect(loadAudioObjectUrl(SRC)).resolves.toBe('blob:clip');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('also uses a copy from the runtime cache', async () => {
    await store('linguo-content-audio-v1');
    await expect(loadAudioObjectUrl(SRC)).resolves.toBe('blob:clip');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails at once as offline_uncached when offline and not stored', async () => {
    online = false;
    const error = await loadAudioObjectUrl(SRC).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AudioLoadError);
    expect(audioLoadReason(error)).toBe('offline_uncached');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('types the other failures', async () => {
    fetchMock.mockResolvedValueOnce(new Response('x', { status: 404 }));
    await expect(loadAudioObjectUrl(SRC)).rejects.toMatchObject({ reason: 'http', status: 404, message: 'audio_http_404' });
    fetchMock.mockResolvedValueOnce(new Response(new Blob([]), { status: 200 }));
    await expect(loadAudioObjectUrl(SRC)).rejects.toMatchObject({ reason: 'empty', message: 'audio_empty' });
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(loadAudioObjectUrl(SRC)).rejects.toMatchObject({ reason: 'network' });
  });

  it('passes an abort through untouched', async () => {
    const controller = new AbortController();
    const abort = new DOMException('aborted', 'AbortError');
    fetchMock.mockImplementationOnce(async () => {
      controller.abort();
      throw abort;
    });
    await expect(loadAudioObjectUrl(SRC, controller.signal)).rejects.toBe(abort);
  });

  it('treats a stored empty file as empty, not as a hit', async () => {
    await store(OFFLINE_MEDIA_CACHE, new Uint8Array([]));
    await expect(loadAudioObjectUrl(SRC)).rejects.toMatchObject({ reason: 'empty' });
  });
});

describe('ContentAudio offline', () => {
  it('says the clip is not downloaded and offers the machine voice', async () => {
    stubSpeechSynthesis([{ lang: 'ko-KR', name: 'Yuna' }]);
    online = false;
    const onFailed = vi.fn();
    const user = userEvent.setup();
    render(<ContentAudio assetId={ID} fallbackText="안녕하세요" onFailedChange={onFailed} />);
    await user.click(screen.getByRole('button', { name: 'Nghe bản ghi âm' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Chưa tải bản ghi âm này. Bạn có thể nghe giọng đọc của máy.');
    expect(onFailed).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole('button', { name: 'Nghe bằng giọng đọc của máy: 안녕하세요' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    // Back online: the retry downloads and plays.
    online = true;
    await user.click(screen.getByRole('button', { name: 'Chưa tải bản ghi âm này. Thử lại' }));
    await screen.findByRole('button', { name: 'Tạm dừng bản ghi âm' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('plays a downloaded clip offline', async () => {
    await store(OFFLINE_MEDIA_CACHE);
    online = false;
    const user = userEvent.setup();
    render(<ContentAudio assetId={ID} fallbackText="안녕하세요" />);
    await user.click(screen.getByRole('button', { name: 'Nghe bản ghi âm' }));
    await screen.findByRole('button', { name: 'Tạm dừng bản ghi âm' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
