import type { NotificationPrefs } from '@linguo/shared';

// Same-tab broadcasts so the bell, the inbox page, the Home weekly card and Settings stay in step without refetching
// on every render (pattern of features/progress/prefs-events.ts).

type ChangeListener = () => void;
type PrefsListener = (userId: string, prefs: NotificationPrefs) => void;

const changeListeners = new Set<ChangeListener>();
const prefsListeners = new Set<PrefsListener>();

/** Something marked a notification read/clicked (or the SW reported a click): readers refetch. */
export function subscribeNotificationsChanged(listener: ChangeListener): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

export function publishNotificationsChanged(): void {
  for (const listener of [...changeListeners]) listener();
}

export function subscribeNotificationPrefs(listener: PrefsListener): () => void {
  prefsListeners.add(listener);
  return () => {
    prefsListeners.delete(listener);
  };
}

export function publishNotificationPrefs(userId: string, prefs: NotificationPrefs): void {
  for (const listener of [...prefsListeners]) listener(userId, prefs);
}
