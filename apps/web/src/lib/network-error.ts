// fetch() failures across browsers/Node, and postgrest-js's "<name>: <message>" wrapping of them.
const NETWORK_PATTERN = /^(?:TypeError|FetchError|AbortError):|failed to fetch|fetch failed|networkerror|load failed|network request failed/i;

/**
 * True when the request never got a server answer (offline, DNS, timeout). supabase-js does not throw on
 * those: postgrest-js resolves `{ message: 'TypeError: Failed to fetch', code: '' }` instead.
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (!error || typeof error !== 'object') return false;
  if ('status' in error && error.status === 0) return true;
  if ('message' in error && typeof error.message === 'string') {
    // A server error always carries a SQLSTATE / snake_case code; postgrest-js uses '' for fetch failures.
    const code = 'code' in error && typeof error.code === 'string' ? error.code : '';
    if (code) return false;
    return NETWORK_PATTERN.test(error.message);
  }
  return false;
}
