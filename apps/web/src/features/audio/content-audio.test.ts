import { afterEach, describe, expect, it, vi } from 'vitest';
import { contentAudioSrc, fallbackSpeechLang, loadAudioObjectUrl, playContentAudioOnce } from './content-audio';

vi.mock('@/lib/env', () => ({ env: { supabaseUrl: 'https://abc.supabase.co' } }));

const KO_ID = `ko-${'0123456789abcdef'.repeat(2)}`;
const EN_ID = `en-${'f'.repeat(32)}`;
const KO_URL = `https://abc.supabase.co/storage/v1/object/public/content-audio/ko/${KO_ID}.wav`;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('contentAudioSrc', () => {
  it('resolves generated ids to the public content-audio bucket', () => {
    expect(contentAudioSrc(KO_ID)).toBe(KO_URL);
    expect(contentAudioSrc(EN_ID, 'http://127.0.0.1:54321/')).toBe(`http://127.0.0.1:54321/storage/v1/object/public/content-audio/en/${EN_ID}.wav`);
  });

  it('returns null without an id or without a Supabase URL for a generated id', () => {
    expect(contentAudioSrc(null)).toBeNull();
    expect(contentAudioSrc(undefined)).toBeNull();
    expect(contentAudioSrc('   ')).toBeNull();
    expect(contentAudioSrc(KO_ID, '')).toBeNull();
  });

  it('keeps the legacy resolution for other paths', () => {
    expect(contentAudioSrc('https://cdn.example.com/a.mp3')).toBe('https://cdn.example.com/a.mp3');
    expect(contentAudioSrc('/audio/a.mp3')).toBe('/audio/a.mp3');
    expect(contentAudioSrc('hello.mp3')).toMatch(/audio\/hello\.mp3$/);
    // Upper-case hex is not a generated id: never sent to the bucket.
    expect(contentAudioSrc(`ko-${'A'.repeat(32)}`)).not.toContain('content-audio');
  });
});

describe('fallbackSpeechLang', () => {
  it('uses the id language, else the script of the text', () => {
    expect(fallbackSpeechLang(KO_ID, 'Hello')).toBe('ko');
    expect(fallbackSpeechLang(EN_ID, '안녕')).toBe('en');
    expect(fallbackSpeechLang(null, '안녕하세요')).toBe('ko');
    expect(fallbackSpeechLang('legacy.mp3', 'Hello')).toBe('en');
    expect(fallbackSpeechLang(`ja-${'a'.repeat(32)}`, 'Hello')).toBe('ja');
    expect(fallbackSpeechLang(`fr-${'a'.repeat(32)}`, 'Hello')).toBe('en');
  });
});

describe('loadAudioObjectUrl', () => {
  it('downloads without credentials and returns an object URL', async () => {
    const fetchMock = vi.fn(async () => new Response(new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:clip');
    await expect(loadAudioObjectUrl(KO_URL)).resolves.toBe('blob:clip');
    expect(fetchMock).toHaveBeenCalledWith(KO_URL, expect.objectContaining({ credentials: 'omit' }));
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('rejects an HTTP error or an empty file', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('missing', { status: 404 })));
    await expect(loadAudioObjectUrl(KO_URL)).rejects.toThrow('audio_http_404');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob([]), { status: 200 })));
    await expect(loadAudioObjectUrl(KO_URL)).rejects.toThrow('audio_empty');
  });
});

describe('playContentAudioOnce', () => {
  class FakeAudio {
    static last: FakeAudio | null = null;
    static playResult: () => Promise<void> = () => Promise.resolve();
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(public src: string) {
      FakeAudio.last = this;
    }
    play() {
      return FakeAudio.playResult();
    }
  }

  it('resolves false for an empty id without touching the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(playContentAudioOnce('  ', () => {})).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('downloads a generated clip, reports the start and resolves true at the end', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob([new Uint8Array([1])]), { status: 200 })));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:one');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.stubGlobal('Audio', FakeAudio);
    FakeAudio.playResult = () => Promise.resolve();
    const onStarted = vi.fn();
    const done = playContentAudioOnce(KO_ID, onStarted);
    await vi.waitFor(() => expect(onStarted).toHaveBeenCalledTimes(1));
    expect(FakeAudio.last?.src).toBe('blob:one');
    FakeAudio.last?.onended?.();
    await expect(done).resolves.toBe(true);
    expect(revoke).toHaveBeenCalledWith('blob:one');
  });

  it('resolves false when the download fails or play() is blocked', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    await expect(playContentAudioOnce(KO_ID, () => {})).resolves.toBe(false);

    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob([new Uint8Array([1])]), { status: 200 })));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:two');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.stubGlobal('Audio', FakeAudio);
    FakeAudio.playResult = () => Promise.reject(new Error('NotAllowedError'));
    const onStarted = vi.fn();
    await expect(playContentAudioOnce(KO_ID, onStarted)).resolves.toBe(false);
    expect(onStarted).not.toHaveBeenCalled();
  });

  it('plays a legacy path directly', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('Audio', FakeAudio);
    FakeAudio.playResult = () => Promise.resolve();
    const onStarted = vi.fn();
    const done = playContentAudioOnce('https://cdn.example.com/a.mp3', onStarted);
    await vi.waitFor(() => expect(onStarted).toHaveBeenCalled());
    expect(FakeAudio.last?.src).toBe('https://cdn.example.com/a.mp3');
    FakeAudio.last?.onerror?.();
    await expect(done).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
