import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSpeechRecognition } from './useSpeechRecognition';

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = '';
  continuous = false;
  interimResults = false;
  onresult: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  started = false;
  aborted = false;
  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    this.started = true;
  }
  stop() {
    this.onend?.();
  }
  abort() {
    this.aborted = true;
  }
}

/** A SpeechRecognitionEvent-like object: a list of results, each with one alternative. */
const results = (...parts: Array<[string, boolean]>) => ({
  results: parts.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal })),
});

beforeEach(() => {
  FakeRecognition.instances = [];
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useSpeechRecognition', () => {
  it('is unsupported (and does nothing) without any SpeechRecognition constructor', () => {
    const { result } = renderHook(() => useSpeechRecognition('en'));
    expect(result.current.supported).toBe(false);
    act(() => result.current.start());
    expect(result.current.listening).toBe(false);
  });

  it('uses the webkit-prefixed constructor with the path language', () => {
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition);
    const { result } = renderHook(() => useSpeechRecognition('ko'));
    expect(result.current.supported).toBe(true);
    act(() => result.current.start());
    const rec = FakeRecognition.instances[0]!;
    expect(rec).toMatchObject({ lang: 'ko-KR', continuous: true, interimResults: true, started: true });
    expect(result.current.listening).toBe(true);
  });

  it('uses en-US for English and prefers the unprefixed constructor', () => {
    vi.stubGlobal('SpeechRecognition', FakeRecognition);
    const { result } = renderHook(() => useSpeechRecognition('en'));
    act(() => result.current.start());
    expect(FakeRecognition.instances[0]?.lang).toBe('en-US');
  });

  it('builds the transcript from final and interim results', () => {
    vi.stubGlobal('SpeechRecognition', FakeRecognition);
    const { result } = renderHook(() => useSpeechRecognition('en'));
    act(() => result.current.start());
    act(() => FakeRecognition.instances[0]!.onresult?.(results(['hello ', true], ['wor', false])));
    expect(result.current.transcript).toBe('hello wor');
    act(() => FakeRecognition.instances[0]!.onresult?.(results(['hello ', true], ['world', true])));
    expect(result.current.transcript).toBe('hello world');
  });

  it('lets the learner edit the transcript and clear it', () => {
    vi.stubGlobal('SpeechRecognition', FakeRecognition);
    const { result } = renderHook(() => useSpeechRecognition('en'));
    act(() => result.current.setTranscript('I fixed this'));
    expect(result.current.transcript).toBe('I fixed this');
    act(() => result.current.reset());
    expect(result.current.transcript).toBe('');
  });

  it('stops listening on end and on error without throwing', () => {
    vi.stubGlobal('SpeechRecognition', FakeRecognition);
    const { result } = renderHook(() => useSpeechRecognition('en'));
    act(() => result.current.start());
    act(() => FakeRecognition.instances[0]!.onerror?.({ error: 'not-allowed' }));
    expect(result.current.listening).toBe(false);
    act(() => result.current.start());
    act(() => result.current.stop());
    expect(result.current.listening).toBe(false);
  });

  it('survives a constructor that throws', () => {
    vi.stubGlobal(
      'SpeechRecognition',
      class {
        constructor() {
          throw new Error('nope');
        }
      },
    );
    const { result } = renderHook(() => useSpeechRecognition('en'));
    act(() => result.current.start());
    expect(result.current.listening).toBe(false);
  });

  it('aborts on unmount', () => {
    vi.stubGlobal('SpeechRecognition', FakeRecognition);
    const { result, unmount } = renderHook(() => useSpeechRecognition('en'));
    act(() => result.current.start());
    unmount();
    expect(FakeRecognition.instances[0]?.aborted).toBe(true);
  });
});
