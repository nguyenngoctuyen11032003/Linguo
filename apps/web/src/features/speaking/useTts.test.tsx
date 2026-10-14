import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTts } from './useTts';

const tts = vi.hoisted(() => ({
  canSpeak: vi.fn(() => true),
  speak: vi.fn(),
  stopSpeaking: vi.fn(),
  voicesListener: null as null | (() => void),
  off: vi.fn(),
}));
vi.mock('@/features/exam/tts', () => ({
  canSpeak: tts.canSpeak,
  speak: tts.speak,
  stopSpeaking: tts.stopSpeaking,
  onVoicesChanged: (l: () => void) => {
    tts.voicesListener = l;
    return tts.off;
  },
}));

beforeEach(() => {
  tts.canSpeak.mockReturnValue(true);
  tts.speak.mockReset();
  tts.stopSpeaking.mockClear();
  tts.off.mockClear();
});

describe('useTts', () => {
  it('speaks the text and clears the speaking state when it ends', async () => {
    let end!: () => void;
    tts.speak.mockReturnValue(new Promise<void>((r) => (end = r)));
    const { result } = renderHook(() => useTts('en'));
    expect(result.current.available).toBe(true);
    act(() => result.current.play('Hello'));
    expect(tts.speak).toHaveBeenCalledWith('Hello', 'en');
    expect(result.current.speakingText).toBe('Hello');
    await act(async () => end());
    expect(result.current.speakingText).toBeNull();
  });

  it('clears the speaking state when synthesis fails', async () => {
    tts.speak.mockRejectedValue(new Error('tts_failed'));
    const { result } = renderHook(() => useTts('ko'));
    await act(async () => result.current.play('안녕하세요'));
    expect(result.current.speakingText).toBeNull();
  });

  it('reports unavailable until voices load', () => {
    tts.canSpeak.mockReturnValue(false);
    const { result } = renderHook(() => useTts('en'));
    expect(result.current.available).toBe(false);
    tts.canSpeak.mockReturnValue(true);
    act(() => tts.voicesListener?.());
    expect(result.current.available).toBe(true);
  });

  it('stop cancels speech, and unmount stops it and unsubscribes', () => {
    tts.speak.mockReturnValue(new Promise(() => {}));
    const { result, unmount } = renderHook(() => useTts('en'));
    act(() => result.current.play('Hi'));
    act(() => result.current.stop());
    expect(result.current.speakingText).toBeNull();
    expect(tts.stopSpeaking).toHaveBeenCalled();
    tts.stopSpeaking.mockClear();
    unmount();
    expect(tts.stopSpeaking).toHaveBeenCalled();
    expect(tts.off).toHaveBeenCalled();
  });
});
