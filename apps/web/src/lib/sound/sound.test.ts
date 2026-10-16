import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CUES, type SoundCue } from './cues';
import { resetSoundEngineForTests } from './engine';
import { playSound, resetSoundThrottleForTests, setSoundPrefs, verdictCue } from './index';
import { getSoundPrefs, resetSoundPrefsForTests } from './prefs';

const param = () => ({
  value: 0,
  setValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
});
const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });

let oscillators = 0;

class FakeAudioContext {
  state: AudioContextState = 'running';
  currentTime = 0;
  sampleRate = 8000;
  destination = node();
  resume = vi.fn(() => Promise.resolve());
  createGain = () => ({ ...node(), gain: param() });
  createDynamicsCompressor = () => ({ ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() });
  createDelay = () => ({ ...node(), delayTime: param() });
  createBiquadFilter = () => ({ ...node(), type: 'lowpass', frequency: param(), Q: param() });
  createBuffer = (_c: number, length: number) => ({ getChannelData: () => new Float32Array(length) });
  createOscillator = () => {
    oscillators += 1;
    return { ...node(), type: 'sine', frequency: param(), detune: param(), start: vi.fn(), stop: vi.fn(), onended: null };
  };
  createBufferSource = () => ({ ...node(), buffer: null, start: vi.fn(), stop: vi.fn(), onended: null });
}

beforeEach(() => {
  localStorage.clear();
  resetSoundPrefsForTests();
  resetSoundEngineForTests();
  resetSoundThrottleForTests();
  oscillators = 0;
  vi.stubGlobal('AudioContext', FakeAudioContext);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('playSound', () => {
  it('synthesises every cue without throwing', () => {
    for (const cue of Object.keys(CUES) as SoundCue[]) {
      resetSoundThrottleForTests();
      playSound(cue, { intensity: 1 });
    }
    expect(oscillators).toBeGreaterThan(Object.keys(CUES).length);
  });

  it('stays silent when sounds are off, unless forced (settings preview)', () => {
    setSoundPrefs({ enabled: false });
    playSound('correct');
    expect(oscillators).toBe(0);
    playSound('toggleOn', { force: true });
    expect(oscillators).toBeGreaterThan(0);
  });

  it('is a no-op when Web Audio is missing', () => {
    vi.stubGlobal('AudioContext', undefined);
    expect(() => playSound('complete')).not.toThrow();
  });

  it('throttles rapid repeats of frequent cues', () => {
    playSound('tap');
    const after = oscillators;
    playSound('tap');
    expect(oscillators).toBe(after);
  });

  it('vibrates with haptics on and not with haptics off', () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    playSound('incorrect');
    expect(vibrate).toHaveBeenCalledWith(CUES.incorrect.haptic);
    vibrate.mockClear();
    setSoundPrefs({ haptics: false });
    resetSoundThrottleForTests();
    playSound('incorrect');
    expect(vibrate).not.toHaveBeenCalled();
  });
});

describe('prefs', () => {
  it('persists and clamps', () => {
    setSoundPrefs({ volume: 4, enabled: false });
    resetSoundPrefsForTests();
    expect(getSoundPrefs()).toEqual({ enabled: false, volume: 1, haptics: true });
  });

  it('falls back to defaults on corrupt storage', () => {
    localStorage.setItem('linguo-sound', '{nope');
    expect(getSoundPrefs().enabled).toBe(true);
  });
});

describe('verdictCue', () => {
  it('maps verdicts and turns streaks into a climbing combo', () => {
    expect(verdictCue('incorrect', 0).cue).toBe('incorrect');
    expect(verdictCue('almost', 4).cue).toBe('almost');
    expect(verdictCue('correct', 2).cue).toBe('correct');
    expect(verdictCue('correct', 3)).toEqual({ cue: 'combo', intensity: 0 });
    expect(verdictCue('correct', 20)).toEqual({ cue: 'combo', intensity: 1 });
  });
});
