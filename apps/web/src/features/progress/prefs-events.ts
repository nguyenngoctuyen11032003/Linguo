import type { MotivationPrefs } from '@linguo/shared';

// Saved motivation preferences are broadcast so every reader (Settings, HomePage strip, AnalyticsProvider) follows a
// change made elsewhere in the same tab without refetching.

type Listener = (userId: string, prefs: MotivationPrefs) => void;
const listeners = new Set<Listener>();

export function subscribeMotivationPrefs(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishMotivationPrefs(userId: string, prefs: MotivationPrefs): void {
  for (const listener of [...listeners]) listener(userId, prefs);
}
