import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canSpeak, onVoicesChanged, speak, stopSpeaking } from './tts';

class FakeUtterance {
  lang = '';
  voice: unknown = null;
  rate = 1;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  constructor(public text: string) {}
}

function fakeSynth(voiceLangs: string[]) {
  const spoken: FakeUtterance[] = [];
  const listeners = new Set<() => void>();
  const synth = {
    spoken,
    getVoices: vi.fn(() => voiceLangs.map((lang) => ({ lang, name: `Voice ${lang}` }))),
    speak: vi.fn((u: FakeUtterance) => spoken.push(u)),
    cancel: vi.fn(() => {
      for (const u of spoken.splice(0)) u.onerror?.({ error: 'canceled' });
    }),
    addEventListener: vi.fn((_: string, l: () => void) => listeners.add(l)),
    removeEventListener: vi.fn((_: string, l: () => void) => listeners.delete(l)),
    fire: () => listeners.forEach((l) => l()),
  };
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  return synth;
}

beforeEach(() => {
  vi.stubGlobal('speechSynthesis', undefined);
  vi.stubGlobal('SpeechSynthesisUtterance', undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe('tts', () => {
  it('cannot speak without the Web Speech API', async () => {
    expect(canSpeak('ko')).toBe(false);
    await expect(speak('안녕하세요', 'ko')).rejects.toThrow('tts_unavailable');
    expect(() => stopSpeaking()).not.toThrow();
    expect(onVoicesChanged(() => {})).toBeTypeOf('function');
  });

  it('needs a voice of the language', async () => {
    fakeSynth(['en-GB']);
    expect(canSpeak('en')).toBe(true);
    expect(canSpeak('ko')).toBe(false);
    await expect(speak('안녕하세요', 'ko')).rejects.toThrow('tts_unavailable');
  });

  it('prefers ko-KR / en-US and resolves when speech ends', async () => {
    const synth = fakeSynth(['en-GB', 'en_US', 'ko-KR']);
    const done = speak('Hello there', 'en', { rate: 0.8 });
    const u = synth.spoken[0]!;
    expect(u.text).toBe('Hello there');
    expect(u.lang).toBe('en-US');
    expect(u.voice).toEqual({ lang: 'en_US', name: 'Voice en_US' });
    expect(u.rate).toBe(0.8);
    u.onend?.();
    await expect(done).resolves.toBeUndefined();

    const ko = speak('안녕하세요', 'ko');
    expect(synth.spoken.at(-1)?.lang).toBe('ko-KR');
    expect(synth.spoken.at(-1)?.rate).toBe(1);
    synth.spoken.at(-1)?.onend?.();
    await ko;
  });

  it('stopSpeaking cancels and resolves the pending speech', async () => {
    const synth = fakeSynth(['ko-KR']);
    const done = speak('천천히 말해 주세요', 'ko');
    stopSpeaking();
    expect(synth.cancel).toHaveBeenCalled();
    await expect(done).resolves.toBeUndefined();
  });

  it('a new speech interrupts the previous one', async () => {
    fakeSynth(['ko-KR']);
    const first = speak('하나', 'ko');
    void speak('둘', 'ko');
    await expect(first).resolves.toBeUndefined();
  });

  it('rejects on a synthesis error', async () => {
    const synth = fakeSynth(['ko-KR']);
    const done = speak('안녕하세요', 'ko');
    synth.spoken[0]!.onerror?.({ error: 'synthesis-failed' });
    await expect(done).rejects.toThrow('tts_failed');
  });

  it('notifies when voices change', () => {
    const synth = fakeSynth([]);
    const listener = vi.fn();
    const off = onVoicesChanged(listener);
    synth.fire();
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    synth.fire();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
