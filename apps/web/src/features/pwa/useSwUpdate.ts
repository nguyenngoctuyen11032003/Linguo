import { useSyncExternalStore } from 'react';
import { swUpdateStore } from './register';

export interface SwUpdate {
  /** A new version is installed and waiting (and the learner has not dismissed it). */
  updateAvailable: boolean;
  /** Activates the new version, then reloads once. Only call from a user action. */
  applyUpdate: () => void;
  /** Hides the prompt until the next new version. */
  dismiss: () => void;
}

export function useSwUpdate(): SwUpdate {
  const { updateAvailable } = useSyncExternalStore(swUpdateStore.subscribe, swUpdateStore.getSnapshot, swUpdateStore.getSnapshot);
  return { updateAvailable, applyUpdate: () => swUpdateStore.applyUpdate(), dismiss: swUpdateStore.dismiss };
}
