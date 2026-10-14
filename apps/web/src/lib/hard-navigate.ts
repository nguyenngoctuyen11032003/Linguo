/**
 * Full page load of an app path (`/` = the landing page), dropping every in-memory cache. Used after account
 * deletion, where a client-side navigation can lose a race against the sign-out redirect of RequireAuth.
 */
export function hardNavigate(path: string): void {
  window.location.replace(`${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`);
}
