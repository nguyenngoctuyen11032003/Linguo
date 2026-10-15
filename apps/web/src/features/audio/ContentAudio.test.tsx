import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubSpeechSynthesis } from '../../../tests/unit/speech-synthesis';
import { ContentAudio } from './ContentAudio';

const envMock = vi.hoisted(() => ({ supabaseUrl: 'https://abc.supabase.co' }));
vi.mock('@/lib/env', () => ({ env: envMock }));

const ID = `ko-${'0a'.repeat(16)}`;
const URL_ = `https://abc.supabase.co/storage/v1/object/public/content-audio/ko/${ID}.wav`;

let played: HTMLMediaElement[];
let playImpl: (el: HTMLMediaElement) => Promise<void>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  played = [];
  playImpl = (el) => {
    el.dispatchEvent(new Event('playing'));
    return Promise.resolve();
  };
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    played.push(this);
    return playImpl(this);
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event('pause'));
  });
  fetchMock = vi.fn(async () => new Response(new Blob([new Uint8Array([82, 73, 70, 70])], { type: 'audio/wav' }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:clip');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

afterEach(() => {
  envMock.supabaseUrl = 'https://abc.supabase.co';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ContentAudio', () => {
  it('downloads nothing before the first press, then plays the bucket clip', async () => {
    const user = userEvent.setup();
    render(<ContentAudio assetId={ID} fallbackText="안녕하세요" />);
    expect(screen.getByRole('group', { name: 'Trình phát bản ghi âm' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Nghe lại từ đầu' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Nghe bản ghi âm' }));
    expect(fetchMock).toHaveBeenCalledWith(URL_, expect.objectContaining({ credentials: 'omit' }));
    expect(await screen.findByRole('button', { name: 'Tạm dừng bản ghi âm' })).toBeInTheDocument();
    expect(played).toHaveLength(1);
    expect(played[0]!.src).toBe('blob:clip');
    expect(played[0]!.preload).toBe('none');
  });

  it('pauses, resumes without downloading again and replays from the start', async () => {
    const user = userEvent.setup();
    render(<ContentAudio assetId={ID} />);
    await user.click(screen.getByRole('button', { name: 'Nghe bản ghi âm' }));
    await user.click(await screen.findByRole('button', { name: 'Tạm dừng bản ghi âm' }));
    await user.click(await screen.findByRole('button', { name: 'Nghe tiếp bản ghi âm' }));
    await screen.findByRole('button', { name: 'Tạm dừng bản ghi âm' });
    played[0]!.currentTime = 3;
    await user.click(screen.getByRole('button', { name: 'Nghe lại từ đầu' }));
    expect(played).toHaveLength(3);
    expect(played[2]!.currentTime).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('switches to 0.75× and back, applied to the clip', async () => {
    const user = userEvent.setup();
    render(<ContentAudio assetId={ID} />);
    const speed = screen.getByRole('button', { name: 'Nghe chậm (0,75×)' });
    expect(speed).toHaveAttribute('aria-pressed', 'false');
    await user.click(speed);
    expect(speed).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Nghe bản ghi âm' }));
    await screen.findByRole('button', { name: 'Tạm dừng bản ghi âm' });
    expect(played[0]!.playbackRate).toBe(0.75);
    await user.click(speed);
    expect(speed).toHaveAttribute('aria-pressed', 'false');
    expect(played[0]!.playbackRate).toBe(1);
  });

  it('falls back to machine speech when the clip cannot be downloaded, and a retry downloads again', async () => {
    stubSpeechSynthesis([{ lang: 'ko-KR', name: 'Yuna' }]);
    fetchMock.mockResolvedValueOnce(new Response('missing', { status: 404 }));
    const onFailed = vi.fn();
    const user = userEvent.setup();
    render(<ContentAudio assetId={ID} fallbackText="안녕하세요" onFailedChange={onFailed} />);
    expect(onFailed).toHaveBeenLastCalledWith(false);

    await user.click(screen.getByRole('button', { name: 'Nghe bản ghi âm' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Không phát được bản ghi âm. Bạn có thể nghe giọng đọc của máy.');
    expect(onFailed).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole('button', { name: 'Nghe bằng giọng đọc của máy: 안녕하세요' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Không phát được bản ghi âm. Thử lại' }));
    await screen.findByRole('button', { name: 'Tạm dừng bản ghi âm' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onFailed).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole('button', { name: /giọng đọc của máy/ })).not.toBeInTheDocument();
  });

  it('treats a blocked play() as a failure', async () => {
    playImpl = () => Promise.reject(new Error('NotAllowedError'));
    const user = userEvent.setup();
    render(<ContentAudio assetId={ID} />);
    await user.click(screen.getByRole('button', { name: 'Nghe bản ghi âm' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Không phát được bản ghi âm.');
  });

  it('only one recording plays at a time', async () => {
    const user = userEvent.setup();
    render(
      <>
        <ContentAudio assetId={ID} />
        <ContentAudio assetId={`en-${'b'.repeat(32)}`} />
      </>,
    );
    const [first, second] = screen.getAllByRole('button', { name: 'Nghe bản ghi âm' });
    await user.click(first!);
    await screen.findByRole('button', { name: 'Tạm dừng bản ghi âm' });
    await user.click(second!);
    await vi.waitFor(() => expect(played).toHaveLength(2));
    expect(screen.getAllByRole('button', { name: 'Nghe tiếp bản ghi âm' })).toHaveLength(1);
  });

  it('stops and frees the clip on unmount', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ContentAudio assetId={ID} />);
    await user.click(screen.getByRole('button', { name: 'Nghe bản ghi âm' }));
    await screen.findByRole('button', { name: 'Tạm dừng bản ghi âm' });
    act(() => unmount());
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:clip');
  });

  it('shows only machine speech when the id cannot be resolved', () => {
    stubSpeechSynthesis([{ lang: 'en-US', name: 'Yank' }]);
    const onFailed = vi.fn();
    envMock.supabaseUrl = '';
    render(<ContentAudio assetId={`en-${'c'.repeat(32)}`} fallbackText="Hello" onFailedChange={onFailed} />);
    expect(screen.queryByRole('group', { name: 'Trình phát bản ghi âm' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nghe bằng giọng đọc của máy: Hello' })).toBeInTheDocument();
    expect(onFailed).toHaveBeenLastCalledWith(true);
  });

  it('keeps the single legacy button for a hand-placed audio path', () => {
    render(<ContentAudio assetId="ko/hakgyo.mp3" fallbackText="학교" />);
    expect(screen.getByRole('button', { name: 'Nghe' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Trình phát bản ghi âm' })).not.toBeInTheDocument();
  });

  it('gives every control a 48px target', () => {
    render(<ContentAudio assetId={ID} compact />);
    for (const button of screen.getAllByRole('button')) expect(button.className).toMatch(/min-h-12/);
  });
});
