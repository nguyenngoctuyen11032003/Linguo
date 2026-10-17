import { useSyncExternalStore } from 'react';

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
  /** Android Chrome: 'cellular' | 'wifi' | 'ethernet' | … (not available on iOS Safari / Firefox). */
  type?: string;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
}

function connection(): NetworkInformationLike | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
}

/** The browser's data-saver setting or a very slow connection (no hook: usable in plain async code). */
export function isSaveDataActive(): boolean {
  const c = connection();
  if (!c) return false;
  return c.saveData === true || c.effectiveType === 'slow-2g' || c.effectiveType === '2g';
}

/**
 * A connection the learner may pay for by the megabyte: data saver on, a very slow link, or (where the browser says so)
 * cellular. Background downloads (offline lessons, font warm-up) stay off when this is true. Browsers that expose no
 * connection info (iOS Safari, Firefox) report false: those downloads are then left to the learner's own button.
 */
export function isMeteredConnection(): boolean {
  return isSaveDataActive() || connection()?.type === 'cellular';
}

function subscribe(onChange: () => void): () => void {
  const c = connection();
  if (!c || typeof c.addEventListener !== 'function') return () => {};
  c.addEventListener('change', onChange);
  return () => c.removeEventListener?.('change', onChange);
}

/** True when the user asked the browser to save data or the connection is very slow; follows `connection` changes. */
export function useSaveData(): boolean {
  return useSyncExternalStore(subscribe, isSaveDataActive, () => false);
}

/** Like useSaveData, but a cellular connection counts too (where the browser reports it). */
export function useMeteredConnection(): boolean {
  return useSyncExternalStore(subscribe, isMeteredConnection, () => false);
}
