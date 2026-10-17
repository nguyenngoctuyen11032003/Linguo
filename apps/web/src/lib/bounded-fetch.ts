/**
 * `global.fetch` for the Supabase client: bounds REST/RPC calls so no screen waits forever on a dead network.
 *
 * - Offline (`navigator.onLine === false`): a data request fails at once with the same `TypeError('Failed to fetch')`
 *   the browser would raise after a long hang, so the callers' existing network-error paths (cached data, "cần mạng")
 *   run immediately instead of after the connection times out.
 * - Lie-fi (`onLine` is true but nothing gets through): the request is aborted after REST_TIMEOUT_MS with a
 *   TimeoutError, which `isNetworkError` treats like any other network failure.
 *
 * Never applied to `/auth/v1/*` (token refresh has its own retry/backoff and aborting it could look like a revoked
 * session), `/functions/v1/*` (AI calls and push legitimately run longer) or `/storage/v1/*` (uploads).
 */
export const REST_TIMEOUT_MS = 10_000;

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export function isBoundedRequest(input: RequestInfo | URL): boolean {
  try {
    return new URL(requestUrl(input), 'http://localhost').pathname.startsWith('/rest/v1/');
  } catch {
    return false;
  }
}

function withTimeout(signal: AbortSignal | null | undefined, ms: number): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('The request timed out', 'TimeoutError')), ms);
  const onAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    },
  };
}

export function createBoundedFetch(base: typeof fetch = (...args) => fetch(...args), timeoutMs: number = REST_TIMEOUT_MS): typeof fetch {
  return async (input, init) => {
    if (!isBoundedRequest(input)) return base(input, init);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new TypeError('Failed to fetch');
    const { signal, done } = withTimeout(init?.signal ?? (input instanceof Request ? input.signal : null), timeoutMs);
    try {
      return await base(input, { ...init, signal });
    } finally {
      done();
    }
  };
}
