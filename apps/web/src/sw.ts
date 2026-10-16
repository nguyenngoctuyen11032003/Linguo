/// <reference lib="webworker" />
// Linguo service worker (spec 10 §4). Built by vite-plugin-pwa (injectManifest) into dist/sw.js; typechecked
// with tsconfig.sw.json (WebWorker lib) and excluded from the DOM tsconfig.
//
// - Precache: the app shell (HTML, JS, CSS, fonts, icons) listed in self.__WB_MANIFEST.
// - Navigations: precached index.html (SPA fallback inside the scope, works offline).
// - Content images/audio: CacheFirst, 7 days, 200 entries.
// - Recorded listening clips (public `content-audio` bucket): CacheFirst in their own cache, 30 days, 80 entries.
// - Web fonts (Google Fonts, Pretendard on jsDelivr): stylesheets StaleWhileRevalidate, font files CacheFirst for a
//   year (their URLs are versioned), so repeat visits and offline launches render with the real fonts at once.
// - Supabase REST/RPC/Auth/Functions: never handled here (personal data goes straight to the network).
// - Updates: a new worker waits until the app posts SW_MESSAGE_SKIP_WAITING (the "Tải lại" button).
// - Push: shows the notification; a click focuses/opens the app and posts SW_NOTIFICATION_CLICKED. An open window is
//   never navigated from here (that reloads the page, losing a lesson in progress): the app routes itself.
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import {
  isCacheableMediaRequest,
  isSkipWaitingMessage,
  MEDIA_CACHE_NAME,
  MEDIA_MAX_AGE_SECONDS,
  MEDIA_MAX_ENTRIES,
  parsePushPayload,
} from './features/pwa/sw-helpers';
import { handleNotificationClick } from './features/pwa/sw-click';
import {
  CONTENT_AUDIO_CACHE_NAME,
  CONTENT_AUDIO_MAX_AGE_SECONDS,
  CONTENT_AUDIO_MAX_ENTRIES,
  isContentAudioRequest,
} from './features/audio/sw-audio';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

const scope = self.registration.scope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
// The very first install takes control right away; later updates wait for the learner (see `message`).
clientsClaim();

// SPA navigations inside the scope get the precached shell; the router renders the page (or NotFound).
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// Recorded listening clips (content-audio bucket): own bounded cache, registered first so it wins over the media rule.
registerRoute(
  ({ request }) =>
    isContentAudioRequest({
      url: request.url,
      method: request.method,
      destination: request.destination,
      hasRange: request.headers.has('range'),
    }),
  new CacheFirst({
    cacheName: CONTENT_AUDIO_CACHE_NAME,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: CONTENT_AUDIO_MAX_ENTRIES, maxAgeSeconds: CONTENT_AUDIO_MAX_AGE_SECONDS, purgeOnQuotaError: true }),
    ],
  }),
);

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

const FONT_CSS_HOSTS = new Set(['fonts.googleapis.com', 'cdn.jsdelivr.net']);
const FONT_FILE_HOSTS = new Set(['fonts.gstatic.com', 'cdn.jsdelivr.net']);
const FONT_FILE = /.(?:woff2?|ttf|otf)$/i;
const YEAR_SECONDS = 365 * 24 * 60 * 60;

// Font stylesheets: opaque (no-cors) responses from <link rel="stylesheet">, hence status 0 is cacheable.
registerRoute(
  ({ request, url }) => request.method === 'GET' && request.destination === 'style' && FONT_CSS_HOSTS.has(url.hostname),
  new StaleWhileRevalidate({
    cacheName: 'linguo-font-css',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 8, maxAgeSeconds: YEAR_SECONDS, purgeOnQuotaError: true }),
    ],
  }),
);

// Font files (CORS): Google Fonts serves unicode-range subsets, Pretendard ~90 Korean subsets.
registerRoute(
  ({ request, url }) =>
    request.method === 'GET' &&
    FONT_FILE_HOSTS.has(url.hostname) &&
    (request.destination === 'font' || FONT_FILE.test(url.pathname)),
  new CacheFirst({
    cacheName: 'linguo-fonts',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: YEAR_SECONDS, purgeOnQuotaError: true }),
    ],
  }),
);

self.addEventListener('message', (event) => {
  if (isSkipWaitingMessage(event.data)) void self.skipWaiting();
});

self.addEventListener('push', (event) => {
  let raw: unknown;
  try {
    raw = event.data?.json() ?? null;
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
  event.waitUntil(
    handleNotificationClick(
      {
        matchAll: () => self.clients.matchAll({ type: 'window', includeUncontrolled: true }) as Promise<readonly WindowClient[]>,
        openWindow: (target) => self.clients.openWindow(target),
      },
      scope,
      push.url,
      push.notificationId,
    ),
  );
});
