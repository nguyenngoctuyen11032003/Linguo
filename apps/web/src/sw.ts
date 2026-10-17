/// <reference lib="webworker" />
// Linguo service worker (spec 10 §4). Built by vite-plugin-pwa (injectManifest) into dist/sw.js; typechecked
// with tsconfig.sw.json (WebWorker lib) and excluded from the DOM tsconfig.
//
// - Precache: the app shell (HTML, JS, CSS, the 21 self-hosted font subsets, icons) listed in self.__WB_MANIFEST.
// - Navigations: precached index.html (SPA fallback inside the scope, works offline).
// - Downloaded lessons ("Tải về học offline"): media the app stored on purpose in OFFLINE_MEDIA_CACHE is answered from
//   there first (no expiry, no quota purge); anything else falls through to the evicting runtime caches below.
// - Content images/audio: CacheFirst, 30 days, 300 entries.
// - Recorded listening clips (public `content-audio` bucket): CacheFirst in their own cache, 90 days, 400 entries.
// - Web fonts: self-hosted /fonts/*.woff2 are precached; Pretendard on jsDelivr (Korean) is cached at runtime: font
//   files CacheFirst for a year (the app can ask for a warm-up of all ~90 subsets), the stylesheet
//   StaleWhileRevalidate, so offline launches render with the real fonts.
// - Supabase REST/RPC/Auth/Functions: never handled here (personal data goes straight to the network).
// - Activate: old `linguo-*-v<N>` runtime caches are swept (never the downloaded-media cache).
// - Updates: a new worker waits until the app posts SW_MESSAGE_SKIP_WAITING (the "Tải lại" button).
// - Push: shows the notification; a click focuses/opens the app and posts SW_NOTIFICATION_CLICKED. An open window is
//   never navigated from here (that reloads the page, losing a lesson in progress): the app routes itself.
import { clientsClaim, type RouteHandlerCallback } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import {
  extractFontUrls,
  FONT_CSS_CACHE_NAME,
  FONT_FILE_RE,
  FONTS_CACHE_NAME,
  FONTS_MAX_ENTRIES,
  isCacheableMediaRequest,
  isSkipWaitingMessage,
  isWarmFontsMessage,
  MEDIA_CACHE_NAME,
  MEDIA_MAX_AGE_SECONDS,
  MEDIA_MAX_ENTRIES,
  parsePushPayload,
  PRETENDARD_CSS_URL,
  staleRuntimeCaches,
} from './features/pwa/sw-helpers';
import { handleNotificationClick } from './features/pwa/sw-click';
import {
  CONTENT_AUDIO_CACHE_NAME,
  CONTENT_AUDIO_MAX_AGE_SECONDS,
  CONTENT_AUDIO_MAX_ENTRIES,
  isContentAudioRequest,
} from './features/audio/sw-audio';
import { OFFLINE_MEDIA_CACHE } from './features/offline-media/constants';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

const scope = self.registration.scope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
// The very first install takes control right away; later updates wait for the learner (see `message`).
clientsClaim();

// Old versioned runtime caches (e.g. a `linguo-media-v1` once the name moves to v2) would otherwise sit on the disk
// for ever. The cache of downloaded lessons is never swept.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const stale = staleRuntimeCaches(await self.caches.keys(), [MEDIA_CACHE_NAME, CONTENT_AUDIO_CACHE_NAME, OFFLINE_MEDIA_CACHE]);
        await Promise.all(stale.map((name) => self.caches.delete(name)));
      } catch {
        // a failed sweep only leaves old caches around
      }
    })(),
  );
});

// SPA navigations inside the scope get the precached shell; the router renders the page (or NotFound).
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

/** Media the learner downloaded on purpose is served from its own cache before the evicting runtime strategy. */
function offlineMediaFirst(strategy: CacheFirst): RouteHandlerCallback {
  return async (options) => {
    try {
      const hit = await self.caches.match(options.request, { cacheName: OFFLINE_MEDIA_CACHE });
      if (hit) return hit;
    } catch {
      // Cache API unavailable: fall through to the strategy
    }
    return strategy.handle(options);
  };
}

// Recorded listening clips (content-audio bucket): own bounded cache, registered first so it wins over the media rule.
registerRoute(
  ({ request }) =>
    isContentAudioRequest({
      url: request.url,
      method: request.method,
      destination: request.destination,
      hasRange: request.headers.has('range'),
    }),
  offlineMediaFirst(
    new CacheFirst({
      cacheName: CONTENT_AUDIO_CACHE_NAME,
      plugins: [
        new CacheableResponsePlugin({ statuses: [200] }),
        new ExpirationPlugin({ maxEntries: CONTENT_AUDIO_MAX_ENTRIES, maxAgeSeconds: CONTENT_AUDIO_MAX_AGE_SECONDS, purgeOnQuotaError: true }),
      ],
    }),
  ),
);

registerRoute(
  ({ request }) =>
    isCacheableMediaRequest({
      url: request.url,
      method: request.method,
      destination: request.destination,
      hasRange: request.headers.has('range'),
    }),
  offlineMediaFirst(
    new CacheFirst({
      cacheName: MEDIA_CACHE_NAME,
      plugins: [
        new CacheableResponsePlugin({ statuses: [200] }),
        new ExpirationPlugin({ maxEntries: MEDIA_MAX_ENTRIES, maxAgeSeconds: MEDIA_MAX_AGE_SECONDS, purgeOnQuotaError: true }),
      ],
    }),
  ),
);

const FONT_CSS_HOSTS = new Set(['cdn.jsdelivr.net']);
const FONT_FILE_HOSTS = new Set(['cdn.jsdelivr.net']);
const YEAR_SECONDS = 365 * 24 * 60 * 60;

// Pretendard stylesheet: opaque (no-cors) responses from <link rel="stylesheet">, hence status 0 is cacheable.
registerRoute(
  ({ request, url }) => request.method === 'GET' && request.destination === 'style' && FONT_CSS_HOSTS.has(url.hostname),
  new StaleWhileRevalidate({
    cacheName: FONT_CSS_CACHE_NAME,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 8, maxAgeSeconds: YEAR_SECONDS, purgeOnQuotaError: true }),
    ],
  }),
);

// Font files: Pretendard's ~90 Korean subsets from jsDelivr (CORS) and any same-origin /fonts subset that is not
// precached. The precache route above answers the 21 self-hosted subsets first.
const fontFiles = new CacheFirst({
  cacheName: FONTS_CACHE_NAME,
  plugins: [
    new CacheableResponsePlugin({ statuses: [200] }),
    new ExpirationPlugin({ maxEntries: FONTS_MAX_ENTRIES, maxAgeSeconds: YEAR_SECONDS, purgeOnQuotaError: true }),
  ],
});
registerRoute(
  ({ request, url }) =>
    request.method === 'GET' &&
    (FONT_FILE_HOSTS.has(url.hostname) || url.origin === self.location.origin) &&
    (request.destination === 'font' || FONT_FILE_RE.test(url.pathname)),
  fontFiles,
);

/**
 * Korean learners: fetch every Pretendard subset once while online so Hangul renders in the real font offline (the
 * page only loads the subsets of the characters it has shown). Runs here, not in the page, because the page CSP does
 * not allow fetch() to jsDelivr. Pulled through the font strategy, so entries are tracked and capped like the rest.
 */
async function warmPretendard(event: ExtendableEvent): Promise<void> {
  try {
    const res = await fetch(PRETENDARD_CSS_URL, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) return;
    const urls = extractFontUrls(await res.text(), PRETENDARD_CSS_URL).slice(0, FONTS_MAX_ENTRIES);
    let next = 0;
    const worker = async () => {
      while (next < urls.length) {
        const url = urls[next++]!;
        try {
          await fontFiles.handle({ request: new Request(url, { mode: 'cors', credentials: 'omit' }), event });
        } catch {
          // offline or one subset failing: the rest still helps
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
  } catch {
    // offline: nothing to warm
  }
}

self.addEventListener('message', (event) => {
  if (isSkipWaitingMessage(event.data)) void self.skipWaiting();
  else if (isWarmFontsMessage(event.data)) event.waitUntil(warmPretendard(event));
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
