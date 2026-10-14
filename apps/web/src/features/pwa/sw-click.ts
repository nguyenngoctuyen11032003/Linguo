// Notification click handling for the service worker (src/sw.ts), written against two tiny interfaces instead of
// the WebWorker globals so it is unit-testable (sw-click.test.ts) and typechecks under both libs.
import { pickClient, SW_NOTIFICATION_CLICKED, type NotificationClickedMessage } from './sw-helpers';

/** The slice of WindowClient the click handler uses. */
export interface ClickWindow {
  url: string;
  focused: boolean;
  focus(): Promise<ClickWindow>;
  postMessage(message: unknown): void;
}

/** The slice of `self.clients` the click handler uses. */
export interface ClickClients {
  matchAll(): Promise<readonly ClickWindow[]>;
  openWindow(url: string): Promise<ClickWindow | null>;
}

/**
 * A learner tapped a notification (`url` is absolute and inside the scope).
 *
 * - No window of the app: open one at `url`.
 * - A window exists: focus it and NEVER navigate it from here. client.navigate() reloads the page, which would throw
 *   away a lesson, exam or session in progress (and could drop the click before the app marks it). The app gets
 *   the target through postMessage with `navigated: false` and routes there itself (PwaBridge): at once on an
 *   ordinary page, after asking on a lesson/exam route.
 *
 * Either way the window gets the message so the notification is marked 'clicked' (backoff depends on it); the
 * app buffers messages that arrive before its listener exists (notification-click.ts).
 */
export async function handleNotificationClick(
  clients: ClickClients,
  scope: string,
  url: string,
  notificationId: string | null,
): Promise<void> {
  const windows = await clients.matchAll();
  let target: ClickWindow | null = pickClient(windows, scope);
  let navigated: boolean;
  if (target) {
    try {
      target = await target.focus();
    } catch {
      // focus() can be refused (no user activation); the window still exists.
    }
    // Nothing to do when the window already shows the target; otherwise the app routes there.
    navigated = target.url === url;
  } else {
    try {
      target = await clients.openWindow(url);
    } catch {
      target = null;
    }
    navigated = target !== null;
  }
  const message: NotificationClickedMessage = {
    type: SW_NOTIFICATION_CLICKED,
    notification_id: notificationId,
    url,
    navigated,
  };
  target?.postMessage(message);
}
