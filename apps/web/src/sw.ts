/// <reference lib="webworker" />
// Linguo service worker (spec 10 §4). Built by vite-plugin-pwa (injectManifest) into dist/sw.js; typechecked
// with tsconfig.sw.json (WebWorker lib) and excluded from the DOM tsconfig.
//
// - Precache: the app shell (HTML, JS, CSS, fonts, icons) listed in self.__WB_MANIFEST.
// - Navigations: precached index.html (SPA fallback inside the scope, works offline).
// - Content images/audio: CacheFirst, 7 days, 200 entries.
// - Supabase REST/RPC/Auth/Functions: never handled here (personal data goes straight to the network).
// - Updates: a new worker waits until the app posts SW_MESSAGE_SKIP_WAITING (the "Tải lại" button).
// - Push: shows the notification; a click focuses/opens the app and posts SW_NOTIFICATION_CLICKED.
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import {
  isCacheableMediaRequest,
  isSkipWaitingMessage,
  MEDIA_CACHE_NAME,
  MEDIA_MAX_AGE_SECONDS,
  MEDIA_MAX_ENTRIES,
  parsePushPayload,
  pickClient,
  SW_NOTIFICATION_CLICKED,
  type NotificationClickedMessage,
} from './features/pwa/sw-helpers';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

const scope = self.registration.scope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
// The very first install takes control right away; later updates wait for the learner (see `message`).
clientsClaim();

// SPA navigations inside the scope get the precached shell; the router renders the page (or NotFound).
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

registerRoute(
  ({ request }) =>
    isCacheableMediaRequest({
      url: request.url,
      method: request.method,
      destination: request.destination,
      hasRange: request.headers.has('range'),
    }),
  new CacheFirst({
    cacheName: MEDIA_CACHE_NAME,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: MEDIA_MAX_ENTRIES, maxAgeSeconds: MEDIA_MAX_AGE_SECONDS, purgeOnQuotaError: true }),
    ],
  }),
);

self.addEventListener('message', (event) => {
  if (isSkipWaitingMessage(event.data)) void self.skipWaiting();
});

self.addEventListener('push', (event) => {
  let raw: unknown = null;
  try {
    raw = event.data?.json();
  } catch {
    raw = event.data?.text() ?? null;
  }
  const push = parsePushPayload(raw, scope);
  const icon = new URL('icons/icon-192.png', scope).href;
  event.waitUntil(
    self.registration.showNotification(push.title, {
      body: push.body,
      icon,
      badge: icon,
      lang: 'vi',
      tag: push.notificationId ?? undefined,
      data: { url: push.url, notification_id: push.notificationId },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = (event.notification.data ?? {}) as { url?: unknown; notification_id?: unknown };
  // Re-validate: notification data survives SW updates and is the only input here.
  const push = parsePushPayload({ ...data, title: 'x', body: 'x' }, scope);
  event.waitUntil(openAndNotify(push.url, push.notificationId));
});

async function openAndNotify(url: string, notificationId: string | null): Promise<void> {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  let target: WindowClient | null = pickClient(windows, scope);
  let navigated = false;
  if (target) {
    try {
      target = await target.focus();
    } catch {
      // focus() can be refused (no user activation); the window still exists.
    }
    if (target.url === url) {
      navigated = true;
    } else {
      try {
        // navigate() only works on windows this worker controls; otherwise the app routes itself.
        const next = await target.navigate(url);
        if (next) {
          target = next;
          navigated = true;
        }
      } catch {
        navigated = false;
      }
    }
  } else {
    target = await self.clients.openWindow(url);
    navigated = Boolean(target);
  }
  const message: NotificationClickedMessage = {
    type: SW_NOTIFICATION_CLICKED,
    notification_id: notificationId,
    url,
    navigated,
  };
  target?.postMessage(message);
}
