// Pure helpers used by the service worker (src/sw.ts) and the app. No DOM or WebWorker globals here, so the
// file typechecks under both libs and stays unit-testable. Kept free of zod/@linguo/shared on purpose: the
// service worker bundle should stay tiny (sw-helpers.test.ts pins the shared constants it mirrors).

/** App → SW: activate the waiting worker (sent only when the learner taps "Tải lại"). */
export const SW_MESSAGE_SKIP_WAITING = 'linguo:skip-waiting';
/** SW → app, mirrors SW_MESSAGE_NOTIFICATION_CLICKED in packages/shared/src/notifications/contract.ts. */
export const SW_NOTIFICATION_CLICKED = 'linguo:notification-clicked';

/** App → SW: warm the Pretendard (Korean) font subsets into the font cache while online (offline learning). */
export const SW_MESSAGE_WARM_FONTS = 'linguo:warm-fonts';

/** Content media cached CacheFirst at runtime (spec 10 §4). The limits are generous: lessons are used offline. */
export const MEDIA_CACHE_NAME = 'linguo-media-v1';
export const MEDIA_MAX_ENTRIES = 300;
export const MEDIA_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** Web fonts: self-hosted subsets are precached; Pretendard's ~90 subsets are cached at runtime. */
export const FONTS_CACHE_NAME = 'linguo-fonts';
export const FONT_CSS_CACHE_NAME = 'linguo-font-css';
/** ~90 Pretendard subsets (Korean) plus headroom for any self-hosted subset that is not precached. */
export const FONTS_MAX_ENTRIES = 200;
export const FONT_FILE_RE = /\.(?:woff2?|ttf|otf)$/i;
/** The Pretendard stylesheet index.html appends (a test pins the two together). */
export const PRETENDARD_CSS_URL =
  'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css';

const DEFAULT_TITLE = 'Linguo';
const DEFAULT_BODY = 'Bạn có thông báo mới từ Linguo.';
const FALLBACK_PATH = 'app';
const NOTIFICATIONS_PATH = 'app/thong-bao';

/** Supabase API paths (REST/RPC, Auth, Edge Functions, Realtime, GraphQL, private Storage). */
const SUPABASE_API_PATH = /^\/(?:rest|auth|functions|realtime|graphql|storage)\/v1(?:\/|$)/;
/** Public Storage objects are plain content media and may be cached like any other image/audio. */
const SUPABASE_PUBLIC_OBJECT = /^\/storage\/v1\/object\/public\//;
const MEDIA_EXTENSION = /\.(?:png|jpe?g|webp|avif|gif|svg|mp3|m4a|aac|ogg|oga|opus|wav)$/i;
const MEDIA_DESTINATIONS = new Set(['image', 'audio']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Requests the service worker must never answer from a cache (personal data, auth). */
export function isSupabaseApiRequest(url: URL): boolean {
  if (SUPABASE_PUBLIC_OBJECT.test(url.pathname)) return false;
  return /\.supabase\.(?:co|in)$/i.test(url.hostname) || SUPABASE_API_PATH.test(url.pathname);
}

export interface MediaRequestInfo {
  url: string;
  method: string;
  /** Request.destination ('' for fetch()). */
  destination: string;
  /** Range requests (audio seeking) go to the network: a cached 200 cannot answer a 206 reliably. */
  hasRange: boolean;
}

/** Content images and audio: CacheFirst, 7 days, 200 entries. */
export function isCacheableMediaRequest(req: MediaRequestInfo): boolean {
  if (req.method !== 'GET' || req.hasRange) return false;
  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  if (isSupabaseApiRequest(url)) return false;
  return MEDIA_DESTINATIONS.has(req.destination) || MEDIA_EXTENSION.test(url.pathname);
}

/**
 * Absolute URL for a notification target, always inside the service worker scope. Server URLs are app
 * paths such as '/app/on-tap' (contract: action_url starts with '/app/'), resolved against the scope so
 * the GitHub Pages base path is kept. Anything leaving the scope falls back to `<scope>app`.
 */
export function resolveUrlInScope(url: unknown, scope: string): string {
  const fallback = new URL(FALLBACK_PATH, scope).href;
  if (typeof url !== 'string' || !url.trim()) return fallback;
  const raw = url.trim();
  try {
    const isAbsolute = /^[a-z][a-z0-9+.-]*:/i.test(raw);
    // '/app/x' and '//host/x' both become scope-relative: never another origin.
    const resolved = isAbsolute ? new URL(raw) : new URL(raw.replace(/^[/\\]+/, ''), scope);
    return resolved.href.startsWith(scope) ? resolved.href : fallback;
  } catch {
    return fallback;
  }
}

export interface ParsedPush {
  title: string;
  body: string;
  /** Absolute URL inside the scope. */
  url: string;
  /** null when the payload carried no valid uuid. */
  notificationId: string | null;
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * Defensive parse of a pushPayloadSchema-shaped message ({ notification_id, title, body, url }). Accepts a
 * JSON string or an object; never throws, since every push must show a notification.
 */
export function parsePushPayload(raw: unknown, scope: string): ParsedPush {
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
  }
  const obj = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const id = typeof obj.notification_id === 'string' && UUID.test(obj.notification_id) ? obj.notification_id : null;
  return {
    title: str(obj.title, 120) || DEFAULT_TITLE,
    body: str(obj.body, 300) || DEFAULT_BODY,
    url: typeof obj.url === 'string' && obj.url.trim() ? resolveUrlInScope(obj.url, scope) : new URL(NOTIFICATIONS_PATH, scope).href,
    notificationId: id,
  };
}

/** Message posted by the SW to the app after a notification click. */
export interface NotificationClickedMessage {
  type: typeof SW_NOTIFICATION_CLICKED;
  notification_id: string | null;
  /** Absolute URL the notification points to. */
  url: string;
  /** true when the SW already opened/navigated a window to `url`. */
  navigated: boolean;
}

export function isNotificationClickedMessage(data: unknown): data is NotificationClickedMessage {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    d.type === SW_NOTIFICATION_CLICKED &&
    (d.notification_id === null || (typeof d.notification_id === 'string' && UUID.test(d.notification_id))) &&
    typeof d.url === 'string' &&
    typeof d.navigated === 'boolean'
  );
}

export function isSkipWaitingMessage(data: unknown): boolean {
  return Boolean(data && typeof data === 'object' && (data as { type?: unknown }).type === SW_MESSAGE_SKIP_WAITING);
}

export function isWarmFontsMessage(data: unknown): boolean {
  return Boolean(data && typeof data === 'object' && (data as { type?: unknown }).type === SW_MESSAGE_WARM_FONTS);
}

/** Versioned runtime caches (`linguo-<name>-v<N>`); the unversioned font caches are never swept. */
const VERSIONED_RUNTIME_CACHE = /^linguo-.+-v\d+$/;
/** Caches the learner filled on purpose (downloaded lessons). Never swept, whatever the version. */
const PROTECTED_CACHE_PREFIX = 'linguo-offline-media-';

/**
 * Caches to delete on activate: old `linguo-*-v<N>` runtime caches that are not in `current`. The downloaded-media cache
 * (`linguo-offline-media-*`) is never listed, and neither are Workbox's precache caches (cleanupOutdatedCaches owns them).
 */
export function staleRuntimeCaches(existing: readonly string[], current: readonly string[]): string[] {
  const keep = new Set(current);
  return existing.filter((name) => VERSIONED_RUNTIME_CACHE.test(name) && !name.startsWith(PROTECTED_CACHE_PREFIX) && !keep.has(name));
}

/**
 * Absolute font file URLs referenced by a stylesheet's `url(...)` values (resolved against the stylesheet URL),
 * deduplicated, https only, font extensions only. Used to warm Pretendard's unicode-range subsets.
 */
export function extractFontUrls(css: string, baseUrl: string): string[] {
  const urls = new Set<string>();
  for (const match of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s'"]*))\s*\)/g)) {
    const raw = (match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (!raw || raw.startsWith('data:')) continue;
    try {
      const url = new URL(raw, baseUrl);
      url.hash = '';
      if (url.protocol === 'https:' && FONT_FILE_RE.test(url.pathname)) urls.add(url.href);
    } catch {
      // not a URL
    }
  }
  return [...urls];
}

/** Pick the window to reuse for a notification click: the focused one first, then any inside the scope. */
export function pickClient<T extends { url: string; focused: boolean }>(clients: readonly T[], scope: string): T | null {
  const inScope = clients.filter((c) => c.url.startsWith(scope));
  return inScope.find((c) => c.focused) ?? inScope[0] ?? null;
}
