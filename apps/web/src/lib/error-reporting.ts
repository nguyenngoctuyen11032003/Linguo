import type { ClientErrorKind } from '@linguo/shared';

// Privacy-preserving client error reporting, part of the analytics system (event `client_error`). Only a bounded
// whitelist leaves the device: kind, an error name/short code (never a message), a route TEMPLATE (never ids, query
// or hash) and the online flag. Signed-out or opted-out users send nothing (track() is a no-op without an enabled
// client). Nothing here ever throws or blocks the UI.
//
// The analytics queue (and the zod contracts it validates with) is not part of the entry chunk: app-services.ts
// connects it through connectErrorReporting() before anyone can be signed in. Until then track() would drop the
// event anyway (no analytics client is configured before AnalyticsProvider mounts, which happens after the
// connection), so reports are still checked and deduped exactly as before, just not handed to the queue.

type ClientErrorProps = { kind: ClientErrorKind; code: string; online: boolean };

/** The analytics queue as seen from here (error-reporting-sink.ts). */
export interface ErrorReportingSink {
  validProps: (props: ClientErrorProps) => boolean;
  track: (props: ClientErrorProps, route: string) => void;
  flush: () => void;
}

let sink: ErrorReportingSink | null = null;

/** Called once the analytics queue is loaded (app/app-services.ts). */
export function connectErrorReporting(next: ErrorReportingSink | null): void {
  sink = next;
}

/** Mirrors CLIENT_ERROR_KINDS of @linguo/shared (the Record type makes the compiler keep it exhaustive). */
const CLIENT_ERROR_KINDS: Record<ClientErrorKind, true> = {
  render_error: true,
  unhandled_rejection: true,
  window_error: true,
  chunk_load_error: true,
  rpc_error: true,
};

export const ERROR_DEDUPE_WINDOW_MS = 10 * 60 * 1000;
const DEDUPE_MAX_ENTRIES = 100;
const CODE_RE = /^[A-Za-z0-9_.:-]{1,60}$/;
const CHUNK_RE = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError/i;

const lastSent = new Map<string, number>();

/** "/app/hoc-tap/bai/3f2…?x=1#y" → "/app/hoc-tap/bai/:id". Segments that are not plain lowercase slugs become ":id". */
export function templatePath(pathname: string): string {
  const path = (pathname.split('?')[0] ?? '').split('#')[0] ?? '';
  const segments = path.split('/').filter(Boolean).map((s) => (/^[a-z][a-z-]{0,39}$/.test(s) ? s : ':id'));
  return `/${segments.slice(0, 8).join('/')}`.slice(0, 80);
}

export function isChunkLoadError(error: unknown): boolean {
  if (error instanceof Error) return error.name === 'ChunkLoadError' || CHUNK_RE.test(error.message);
  return typeof error === 'string' && CHUNK_RE.test(error);
}

/** Short, message-free code: the error's name when it is a plain token, else "Error". */
export function errorCode(error: unknown): string {
  if (isChunkLoadError(error)) return 'ChunkLoadError';
  const name = error instanceof Error ? error.name : error === null || error === undefined ? 'Unknown' : 'NonError';
  return CODE_RE.test(name) ? name : 'Error';
}

export interface ClientErrorReport {
  kind: ClientErrorKind;
  error?: unknown;
  /** Explicit code (overrides the one derived from `error`). */
  code?: string;
  /** Defaults to the current location. */
  pathname?: string;
}

/** Returns true when an event was queued. Never throws. */
export function reportClientError(report: ClientErrorReport): boolean {
  try {
    if (!Object.prototype.hasOwnProperty.call(CLIENT_ERROR_KINDS, report.kind)) return false;
    const route = templatePath(report.pathname ?? window.location.pathname);
    const code = report.code && CODE_RE.test(report.code) ? report.code : errorCode(report.error);
    const key = `${report.kind}|${route}|${code}`;
    const now = Date.now();
    const prev = lastSent.get(key);
    if (prev !== undefined && now - prev < ERROR_DEDUPE_WINDOW_MS) return false;
    const props = { kind: report.kind, code, online: typeof navigator === 'undefined' ? true : navigator.onLine };
    // Without a sink the props are valid by construction: kind is checked above, code matches CODE_RE (the
    // contract's own pattern) and online is a boolean; the sink checks them against the shared zod contract.
    if (sink && !sink.validProps(props)) return false;
    lastSent.set(key, now);
    if (lastSent.size > DEDUPE_MAX_ENTRIES) lastSent.delete(lastSent.keys().next().value as string);
    sink?.track(props, route);
    sink?.flush();
    return true;
  } catch {
    return false;
  }
}

/** Kind for an error caught by a boundary: a failed lazy chunk is its own kind. */
export function reportRenderError(error: unknown): void {
  reportClientError({ kind: isChunkLoadError(error) ? 'chunk_load_error' : 'render_error', error });
}

let installed = false;

/** Installs window error / unhandledrejection / vite:preloadError listeners, once. */
export function installErrorReporting(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (e: ErrorEvent) => {
    // Resource load errors (img/script) have no `error` and bubble no message; ignore them.
    if (!e.error && !e.message) return;
    reportClientError({ kind: isChunkLoadError(e.error ?? e.message) ? 'chunk_load_error' : 'window_error', error: e.error ?? e.message });
  });
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    reportClientError({ kind: isChunkLoadError(e.reason) ? 'chunk_load_error' : 'unhandled_rejection', error: e.reason });
  });
  window.addEventListener('vite:preloadError', (e: Event) => {
    reportClientError({ kind: 'chunk_load_error', error: (e as Event & { payload?: unknown }).payload ?? new Error('ChunkLoadError') });
  });
}

/** Tests only. */
export function resetErrorReportingForTests(): void {
  lastSent.clear();
  installed = false;
}
