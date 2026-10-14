// Pure helpers used by the service worker (src/sw.ts) and the app. No DOM or WebWorker globals here, so the
// file typechecks under both libs and stays unit-testable. Kept free of zod/@linguo/shared on purpose: the
// service worker bundle should stay tiny (sw-helpers.test.ts pins the shared constants it mirrors).

/** App → SW: activate the waiting worker (sent only when the learner taps "Tải lại"). */
export const SW_MESSAGE_SKIP_WAITING = 'linguo:skip-waiting';
/** SW → app, mirrors SW_MESSAGE_NOTIFICATION_CLICKED in packages/shared/src/notifications/contract.ts. */
export const SW_NOTIFICATION_CLICKED = 'linguo:notification-clicked';

/** Content media cached CacheFirst at runtime (spec 10 §4). */
export const MEDIA_CACHE_NAME = 'linguo-media-v1';
export const MEDIA_MAX_ENTRIES = 200;
export const MEDIA_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

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

/** Pick the window to reuse for a notification click: the focused one first, then any inside the scope. */
export function pickClient<T extends { url: string; focused: boolean }>(clients: readonly T[], scope: string): T | null {
  const inScope = clients.filter((c) => c.url.startsWith(scope));
  return inScope.find((c) => c.focused) ?? inScope[0] ?? null;
}
