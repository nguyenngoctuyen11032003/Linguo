import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RECORDING_MAX_MS, useRecorder } from './useRecorder';

class FakeTrack {
  stopped = false;
  stop() {
    this.stopped = true;
  }
}
class FakeStream {
  tracks = [new FakeTrack(), new FakeTrack()];
  getTracks() {
    return this.tracks;
  }
}

class FakeRecorder {
  static instances: FakeRecorder[] = [];
  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public stream: FakeStream) {
    FakeRecorder.instances.push(this);
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['abc'], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

let stream: FakeStream;
let getUserMedia: ReturnType<typeof vi.fn>;
const createObjectURL = vi.fn(() => 'blob:fake-1');
const revokeObjectURL = vi.fn();

function install() {
  stream = new FakeStream();
  getUserMedia = vi.fn().mockResolvedValue(stream);
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
}

beforeEach(() => {
  FakeRecorder.instances = [];
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  install();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
});

describe('useRecorder', () => {
  it('records, then exposes an in-memory object URL and releases the microphone', async () => {
    const { result } = renderHook(() => useRecorder());
    expect(result.current.supported).toBe(true);
    expect(result.current.status).toBe('idle');
    await act(() => result.current.start());
    expect(result.current.status).toBe('recording');
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    act(() => result.current.stop());
    expect(result.current.status).toBe('recorded');
    expect(result.current.audioUrl).toBe('blob:fake-1');
    expect(stream.tracks.every((t) => t.stopped)).toBe(true);
  });

  it('discard revokes the URL and returns to idle', async () => {
    const { result } = renderHook(() => useRecorder());
    await act(() => result.current.start());
    act(() => result.current.stop());
    act(() => result.current.discard());
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-1');
    expect(result.current).toMatchObject({ status: 'idle', audioUrl: null });
  });

  it('a second recording replaces the first and revokes its URL', async () => {
    const { result } = renderHook(() => useRecorder());
    await act(() => result.current.start());
    act(() => result.current.stop());
    createObjectURL.mockReturnValueOnce('blob:fake-2');
    await act(() => result.current.start());
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-1');
    act(() => result.current.stop());
    expect(result.current.audioUrl).toBe('blob:fake-2');
  });

  it('reports permission denied without throwing', async () => {
    getUserMedia.mockRejectedValue(new DOMException('no', 'NotAllowedError'));
    const { result } = renderHook(() => useRecorder());
    await act(() => result.current.start());
    expect(result.current).toMatchObject({ status: 'error', error: 'denied' });
  });

  it('reports a missing microphone', async () => {
    getUserMedia.mockRejectedValue(new DOMException('none', 'NotFoundError'));
    const { result } = renderHook(() => useRecorder());
    await act(() => result.current.start());
    expect(result.current).toMatchObject({ status: 'error', error: 'no_device' });
  });

  it('reports any other failure and releases the stream when the recorder cannot be created', async () => {
    vi.stubGlobal(
      'MediaRecorder',
      class {
        constructor() {
          throw new Error('boom');
        }
      },
    );
    const { result } = renderHook(() => useRecorder());
    await act(() => result.current.start());
    expect(result.current).toMatchObject({ status: 'error', error: 'failed' });
    expect(stream.tracks.every((t) => t.stopped)).toBe(true);
  });

  it('is unsupported without getUserMedia or MediaRecorder', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    const { result } = renderHook(() => useRecorder());
    expect(result.current.supported).toBe(false);
    await act(() => result.current.start());
    expect(result.current).toMatchObject({ status: 'error', error: 'unsupported' });

    install();
    vi.stubGlobal('MediaRecorder', undefined);
    expect(renderHook(() => useRecorder()).result.current.supported).toBe(false);
  });

  it('stops the recorder, the tracks and the URL on unmount, without state updates afterwards', async () => {
    const { result, unmount } = renderHook(() => useRecorder());
    await act(() => result.current.start());
    unmount();
    expect(FakeRecorder.instances[0]?.state).toBe('inactive');
    expect(stream.tracks.every((t) => t.stopped)).toBe(true);
  });

  it('revokes a finished recording on unmount', async () => {
    const { result, unmount } = renderHook(() => useRecorder());
    await act(() => result.current.start());
    act(() => result.current.stop());
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-1');
  });

  it('releases a stream that arrives after unmount', async () => {
    let resolve!: (s: FakeStream) => void;
    getUserMedia.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result, unmount } = renderHook(() => useRecorder());
    let started!: Promise<void>;
    act(() => {
      started = result.current.start();
    });
    unmount();
    await act(async () => {
      resolve(stream);
      await started;
    });
    expect(stream.tracks.every((t) => t.stopped)).toBe(true);
    expect(FakeRecorder.instances).toHaveLength(0);
  });

  it('stops by itself after the maximum duration and counts seconds', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useRecorder());
    await act(() => result.current.start());
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.seconds).toBe(3);
    act(() => vi.advanceTimersByTime(RECORDING_MAX_MS));
    expect(result.current.status).toBe('recorded');
  });

  it('ignores start while already recording', async () => {
    const { result } = renderHook(() => useRecorder());
    await act(() => result.current.start());
    await act(() => result.current.start());
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.status).toBe('recording'));
  });
});
