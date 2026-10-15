import { vi } from 'vitest';

export interface FakeUtterance {
  text: string;
  lang: string;
  rate: number;
  voice: { lang: string; name: string } | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
}

/** Installs a fake window.speechSynthesis; `voices` empty or null = no voice / unsupported. */
export function stubSpeechSynthesis(voices: Array<{ lang: string; name: string }> | null) {
  const spoken: FakeUtterance[] = [];
  const cancel = vi.fn(() => {
    const last = spoken.at(-1);
    if (last?.onerror) last.onerror({ error: 'interrupted' });
  });
  if (voices === null) {
    vi.stubGlobal('speechSynthesis', undefined);
    vi.stubGlobal('SpeechSynthesisUtterance', undefined);
    return { spoken, cancel };
  }
  class Utterance {
    onend: (() => void) | null = null;
    onerror: ((event: { error: string }) => void) | null = null;
    lang = '';
    rate = 1;
    voice: { lang: string; name: string } | null = null;
    constructor(public text: string) {}
  }
  vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
  vi.stubGlobal('speechSynthesis', {
    getVoices: () => voices,
    speak: (u: FakeUtterance) => spoken.push(u),
    cancel,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  return { spoken, cancel };
}
