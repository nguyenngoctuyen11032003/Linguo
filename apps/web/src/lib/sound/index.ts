import { useCallback } from 'react';
import { CUES, type SoundCue } from './cues';
import { perform } from './engine';
import { getSoundPrefs } from './prefs';

export type { SoundCue } from './cues';
export { installSoundUnlock } from './engine';
export { DEFAULT_SOUND_PREFS, getSoundPrefs, setSoundPrefs, useSoundPrefs, type SoundPrefs } from './prefs';

const lastPlayed = new Map<SoundCue, number>();

export interface PlayOptions {
  /** 0..1, used by cues that scale (combo). */
  intensity?: number;
  /** Play even when the user turned sounds off (only the Settings preview uses this). */
  force?: boolean;
}

/** Plays a cue (and its vibration) if the user allows it. Safe to call anywhere: never throws, no-ops in tests/SSR. */
export function playSound(cue: SoundCue, { intensity = 0, force = false }: PlayOptions = {}): void {
  if (typeof document === 'undefined' || document.hidden) return;
  const def = CUES[cue];
  const now = performance.now();
  if (def.minGap && now - (lastPlayed.get(cue) ?? -Infinity) < def.minGap) return;
  lastPlayed.set(cue, now);

  const prefs = getSoundPrefs();
  if (prefs.enabled || force) {
    // Perceived loudness is roughly logarithmic: square the slider so its low half stays usable.
    const level = def.level * prefs.volume * prefs.volume;
    try {
      perform((voice) => def.play(voice, Math.min(1, Math.max(0, intensity))), level);
    } catch {
      // Audio is decoration; never let it break a lesson.
    }
  }
  if (prefs.haptics && def.haptic && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(def.haptic);
    } catch {
      // Some browsers throw without user activation.
    }
  }
}

/** Stable callback for components. */
export function useSound(): (cue: SoundCue, options?: PlayOptions) => void {
  return useCallback((cue: SoundCue, options?: PlayOptions) => playSound(cue, options), []);
}

/**
 * Picks the feedback cue for a graded answer. `streak` is the number of correct answers in a row INCLUDING this one;
 * from the third in a row the plain "correct" becomes a climbing combo so momentum is audible.
 */
export function verdictCue(verdict: 'correct' | 'almost' | 'incorrect', streak: number): { cue: SoundCue; intensity: number } {
  if (verdict === 'incorrect') return { cue: 'incorrect', intensity: 0 };
  if (verdict === 'almost') return { cue: 'almost', intensity: 0 };
  if (streak >= 3) return { cue: 'combo', intensity: Math.min(1, (streak - 3) / 5) };
  return { cue: 'correct', intensity: 0 };
}

/** Test helper. */
export function resetSoundThrottleForTests(): void {
  lastPlayed.clear();
}
