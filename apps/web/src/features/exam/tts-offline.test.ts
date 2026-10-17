import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canSpeak, onVoicesChanged, speak } from './tts';

interface FakeVoice {
  lang: string;
  name: string;
  localService?: boolean;
}

class FakeUtterance {
  lang = '';
  voice: FakeVoice | null = null;
  rate = 1;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  constructor(public text: string) {}
}

function fakeSynth(voices: FakeVoice[]) {
  const spoken: FakeUtterance[] = [];
  const listeners = new Set<() => void>();
  const synth = {
    spoken,
    getVoices: () => voices,
    speak: vi.fn((u: FakeUtterance) => {
      spoken.push(u);
      u.onend?.();
    }),
    cancel: vi.fn(),
    addEventListener: vi.fn((_: string, l: () => void) => listeners.add(l)),
    removeEventListener: vi.fn((_: string, l: () => void) => listeners.delete(l)),
  };
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  return synth;
}

let online = true;
beforeEach(() => {
  online = true;
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('tts offline', () => {
  it('online: any voice of the language works, network voices included', () => {
    fakeSynth([{ lang: 'ko-KR', name: 'Google 한국의', localService: false }]);
    expect(canSpeak('ko')).toBe(true);
  });

  it('offline: a network-only voice cannot speak, so the UI shows the script', async () => {
    fakeSynth([{ lang: 'ko-KR', name: 'Google 한국의', localService: false }]);
    online = false;
    expect(canSpeak('ko')).toBe(false);
    await expect(speak('안녕하세요', 'ko')).rejects.toThrow('tts_unavailable');
  });

  it('offline: picks the on-device voice even when a network voice is listed first', async () => {
    const synth = fakeSynth([
      { lang: 'ko-KR', name: 'Google 한국의', localService: false },
      { lang: 'ko-KR', name: 'Yuna', localService: true },
    ]);
    online = false;
    expect(canSpeak('ko')).toBe(true);
    await speak('안녕하세요', 'ko');
    expect(synth.spoken[0]?.voice?.name).toBe('Yuna');
  });

  it('offline: a voice that does not report localService is assumed to be on the device', () => {
    fakeSynth([{ lang: 'en-US', name: 'Samantha' }]);
    online = false;
    expect(canSpeak('en')).toBe(true);
  });

  it('re-evaluates when the network goes away or comes back, and unsubscribes cleanly', () => {
    const synth = fakeSynth([{ lang: 'ko-KR', name: 'Google 한국의', localService: false }]);
    const listener = vi.fn();
    const off = onVoicesChanged(listener);
    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));
    expect(listener).toHaveBeenCalledTimes(2);
    expect(synth.addEventListener).toHaveBeenCalledWith('voiceschanged', listener);
    off();
    window.dispatchEvent(new Event('offline'));
    expect(listener).toHaveBeenCalledTimes(2);
    expect(synth.removeEventListener).toHaveBeenCalledWith('voiceschanged', listener);
  });
});
