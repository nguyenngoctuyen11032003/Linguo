// Pure constants shared by the service worker (src/sw.ts) and the app. No imports: the SW bundle stays tiny.

/**
 * Cache holding media the learner downloaded on purpose ("Tải về học offline"). Written only by the app
 * (offline-media.ts), read by the service worker before the evicting runtime caches. It has no ExpirationPlugin and
 * no purgeOnQuotaError: a downloaded lesson must stay available until the learner removes it.
 * Never bump the version casually: the SW activate cleanup deliberately leaves this cache alone.
 */
export const OFFLINE_MEDIA_CACHE = 'linguo-offline-media-v1';
