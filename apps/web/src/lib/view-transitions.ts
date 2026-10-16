import type { createBrowserRouter } from 'react-router';

type AppRouter = ReturnType<typeof createBrowserRouter>;
type NavigateArgs = Parameters<AppRouter['navigate']>;

/**
 * Page transitions via the View Transitions API. React Router supports them per navigation (`viewTransition`);
 * this turns them on by default for every in-app PUSH that changes the pathname, so screens cross-fade (styles in
 * app/app-shell.css) instead of swapping abruptly. Off when motion is reduced (system setting or the in-app toggle,
 * mirrored on <html data-reduce-motion>), on `replace` (redirects) and on search-only changes (filters, tabs).
 * Browsers without `document.startViewTransition` simply navigate as before. An explicit `viewTransition`
 * option on a Link or navigate() call always wins.
 */
export function prefersReducedMotion(): boolean {
  if (typeof document === 'undefined') return true;
  if (document.documentElement.dataset.reduceMotion === 'true') return true;
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function targetPathname(to: unknown, currentPathname: string): string | null {
  if (typeof to === 'string') {
    if (to.startsWith('?') || to.startsWith('#')) return null;
    try {
      return new URL(to, `http://app${currentPathname}`).pathname;
    } catch {
      return null;
    }
  }
  if (to && typeof to === 'object' && 'pathname' in to && typeof to.pathname === 'string') return to.pathname;
  return null;
}

export function shouldTransition(to: unknown, opts: { replace?: boolean; viewTransition?: boolean } | undefined, currentPathname: string): boolean {
  if (typeof document === 'undefined' || typeof document.startViewTransition !== 'function') return false;
  if (opts?.replace) return false;
  if (prefersReducedMotion()) return false;
  const next = targetPathname(to, currentPathname);
  return next !== null && next !== currentPathname;
}

export function enableViewTransitions(router: AppRouter): void {
  const navigate = router.navigate.bind(router);
  router.navigate = ((to: NavigateArgs[0], opts?: NavigateArgs[1]) => {
    if (typeof to === 'number' || opts?.viewTransition !== undefined) return navigate(to as never, opts as never);
    const viewTransition = shouldTransition(to, opts as { replace?: boolean } | undefined, router.state.location.pathname);
    return navigate(to as never, { ...opts, viewTransition } as never);
  }) as AppRouter['navigate'];
}
