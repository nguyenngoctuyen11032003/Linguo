import { useSyncExternalStore } from 'react';
import { readString, writeString } from '@/lib/storage';

/**
 * Device-local sound preferences. Kept out of the synced user_preferences row on purpose: whether a phone or a
 * laptop should beep depends on the device and where it is used (office, bus), not on the learner.
 */
export interface SoundPrefs {
  /** Interface sounds (answer feedback, celebrations, taps). */
  enabled: boolean;
  /** 0..1, applied on top of the per-cue level. */
  volume: number;
  /** Short vibrations paired with feedback on devices that support navigator.vibrate (Android). */
  haptics: boolean;
}

const KEY = 'linguo-sound';
export const DEFAULT_SOUND_PREFS: SoundPrefs = { enabled: true, volume: 0.7, haptics: true };

function load(): SoundPrefs {
  const raw = readString(KEY);
  if (!raw) return DEFAULT_SOUND_PREFS;
  try {
    const parsed = JSON.parse(raw) as Partial<SoundPrefs>;
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_SOUND_PREFS.enabled,
      volume: typeof parsed.volume === 'number' ? clamp01(parsed.volume) : DEFAULT_SOUND_PREFS.volume,
      haptics: typeof parsed.haptics === 'boolean' ? parsed.haptics : DEFAULT_SOUND_PREFS.haptics,
    };
  } catch {
    return DEFAULT_SOUND_PREFS;
  }
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : DEFAULT_SOUND_PREFS.volume;
}

let current: SoundPrefs | null = null;
const listeners = new Set<() => void>();

export function getSoundPrefs(): SoundPrefs {
  current ??= load();
  return current;
}

export function setSoundPrefs(patch: Partial<SoundPrefs>): void {
  const next = { ...getSoundPrefs(), ...patch };
  next.volume = clamp01(next.volume);
  current = next;
  writeString(KEY, JSON.stringify(next));
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  // Another tab changed the setting.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY) return;
    current = load();
    fn();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', onStorage);
  };
}

export function useSoundPrefs(): SoundPrefs {
  return useSyncExternalStore(subscribe, getSoundPrefs, () => DEFAULT_SOUND_PREFS);
}

/** Test helper: forget the cached value so the next read goes back to storage. */
export function resetSoundPrefsForTests(): void {
  current = null;
}
