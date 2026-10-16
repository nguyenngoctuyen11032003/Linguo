import { matchRoutes, type RouteObject } from 'react-router';

/**
 * Route chunk prefetching. Every signed-in screen is a lazy route (app/router.tsx), so the first visit to a tab
 * waits for its chunk. This warms those chunks before the tap:
 *   - on intent: a pointer hovering / touching / focusing an in-app link starts loading its route chunks (a touch
 *     lands ~100 ms before the click, usually enough for a precached chunk to be parsed);
 *   - on idle: the likely-next routes (bottom-nav tabs, sign-in) load once the browser is idle.
 * Only the JS chunks are loaded (React Router's `route.lazy`, deduplicated by the module cache), no data and no
 * render. Skipped when the user asked to save data or is on a 2G connection.
 */

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

let registered: RouteObject[] = [];
let routerBasename = '/';
const requested = new Set<string>();

export function shouldSaveData(): boolean {
  if (typeof navigator === 'undefined') return true;
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  if (!connection) return false;
  return connection.saveData === true || connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g';
}

/** Loads the lazy route modules matching `pathname` (app-relative, e.g. `/app/hoc-tap`). Never throws. */
export function prefetchRoute(pathname: string): void {
  const path = pathname.split(/[?#]/)[0] || '/';
  if (requested.has(path) || registered.length === 0) return;
  requested.add(path);
  const matches = matchRoutes(registered, path) ?? [];
  for (const { route } of matches) {
    if (typeof route.lazy !== 'function') continue;
    try {
      // The lazyPage() wrappers in router.tsx never reject; this catch covers anything else.
      void Promise.resolve((route.lazy as () => unknown)()).catch(() => undefined);
    } catch {
      // Ignore: the real navigation retries and reports.
    }
  }
}

type IdleCallback = (cb: () => void, opts?: { timeout: number }) => number;

/** Runs `fn` when the main thread is idle (falls back to a short timeout, e.g. Safari < 18). */
export function onIdle(fn: () => void, timeout = 2500): void {
  const ric = (globalThis as unknown as { requestIdleCallback?: IdleCallback }).requestIdleCallback;
  if (ric) ric(fn, { timeout });
  else setTimeout(fn, 600);
}

/** Prefetches `paths` one per idle period so a burst of chunk parsing never blocks input. */
export function prefetchOnIdle(paths: readonly string[]): void {
  if (shouldSaveData()) return;
  const queue = paths.filter((p) => !requested.has(p));
  const next = () => {
    const path = queue.shift();
    if (!path) return;
    prefetchRoute(path);
    onIdle(next);
  };
  onIdle(next);
}

/** `/linguo/app/hoc-tap` → `/app/hoc-tap` for an in-app link, null for anything else. */
export function appPathOf(href: string, origin: string, basename: string): string | null {
  let url: URL;
  try {
    url = new URL(href, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  const base = basename === '/' ? '' : basename.replace(/\/+$/, '');
  if (base && url.pathname !== base && !url.pathname.startsWith(`${base}/`)) return null;
  return url.pathname.slice(base.length) || '/';
}

function onIntent(event: Event) {
  if (shouldSaveData()) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const anchor = target.closest('a[href]');
  if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
  const path = appPathOf(anchor.href, window.location.origin, routerBasename);
  if (path) prefetchRoute(path);
}

/**
 * Registers the route tree and installs the delegated intent listeners (no per-link wiring needed). Returns a
 * cleanup function. Call once, from the real browser router only.
 */
export function installRoutePrefetch(routes: RouteObject[], basename: string): () => void {
  registered = routes;
  routerBasename = basename;
  if (typeof document === 'undefined') return () => undefined;
  const opts: AddEventListenerOptions = { passive: true, capture: true };
  // mouseover (bubbles, unlike pointerenter) covers hover on desktop; touchstart/pointerdown fire before click.
  const events = ['mouseover', 'touchstart', 'pointerdown', 'focusin'] as const;
  for (const type of events) document.addEventListener(type, onIntent, opts);
  return () => {
    for (const type of events) document.removeEventListener(type, onIntent, opts);
  };
}

/** Test hook: forget registered routes and prefetched paths. */
export function resetPrefetchForTests(): void {
  registered = [];
  routerBasename = '/';
  requested.clear();
}
