import { isNotificationClickedMessage } from './sw-helpers';

export interface NotificationClick {
  /** notifications.id to mark as clicked (null when the push carried none). */
  notificationId: string | null;
  /** Absolute URL the notification points to (inside the app scope). */
  url: string;
  /** false when the SW could not navigate the window itself: route to `url` in the app. */
  navigated: boolean;
}

type Callback = (click: NotificationClick) => void;

const callbacks = new Set<Callback>();
/** Clicks that arrived before anyone subscribed (fresh window opened by the SW). */
let pending: NotificationClick[] = [];
let listening: ServiceWorkerContainer | null = null;

function onMessage(event: MessageEvent): void {
  const data: unknown = event.data;
  if (!isNotificationClickedMessage(data)) return;
  const click: NotificationClick = { notificationId: data.notification_id, url: data.url, navigated: data.navigated };
  if (callbacks.size === 0) {
    pending = [...pending.slice(-4), click];
    return;
  }
  callbacks.forEach((cb) => cb(click));
}

/** Idempotent: starts buffering SW → app click messages. registerServiceWorker() calls it. */
export function startNotificationClickListener(container?: ServiceWorkerContainer): void {
  const c = container ?? (typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? navigator.serviceWorker : undefined);
  if (!c || listening === c) return;
  listening?.removeEventListener('message', onMessage);
  listening = c;
  c.addEventListener('message', onMessage);
  // addEventListener alone does not open the client message queue before DOMContentLoaded.
  c.startMessages?.();
}

/**
 * Subscribes to notification clicks relayed by the service worker (SW_MESSAGE_NOTIFICATION_CLICKED).
 * Buffered clicks are delivered to the first subscriber. Returns the unsubscribe function.
 */
export function onNotificationClicked(cb: Callback, container?: ServiceWorkerContainer): () => void {
  startNotificationClickListener(container);
  callbacks.add(cb);
  const queued = pending;
  pending = [];
  queued.forEach((click) => cb(click));
  return () => {
    callbacks.delete(cb);
  };
}

/** Test hook. */
export function resetNotificationClickListener(): void {
  listening?.removeEventListener('message', onMessage);
  listening = null;
  callbacks.clear();
  pending = [];
}
