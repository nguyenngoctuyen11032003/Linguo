// eslint-disable-next-line no-control-regex -- rejecting control characters is the point of this check
const UNSAFE_CHARS = /[\u0000-\u001F\u007F\s\\]/;
/** Auth screens themselves: redirecting there after sign-in would loop or confuse. */
const AUTH_ROUTES = /^\/(?:dang-nhap|dang-ky|auth)(?:[/?#]|$)/;

/** Only same-app paths: blocks open redirects like `//evil.com` or `https://…`, and auth-screen loops. */
export function safeNext(next: string | null | undefined, fallback = '/app'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return fallback;
  if (UNSAFE_CHARS.test(next) || AUTH_ROUTES.test(next)) return fallback;
  return next;
}

/**
 * `path` carrying `?next=` unless `next` is the default destination: moving between the auth screens (sign-in ⇄
 * sign-up, email confirmation link) must not lose where the learner was going, e.g. a class invite link.
 */
export function withNext(path: string, next: string): string {
  return next === '/app' ? path : `${path}?next=${encodeURIComponent(next)}`;
}
