import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { routeDocumentTitle, routeName } from '@/lib/route-titles';

/** Where focus goes after a route change: the page's first heading, else the main landmark. */
function focusTarget(): HTMLElement | null {
  const main = document.querySelector<HTMLElement>('main');
  return main?.querySelector<HTMLElement>('h1') ?? main ?? document.querySelector<HTMLElement>('h1');
}

function pageAlreadyHasFocus(): boolean {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active === document.body) return false;
  return Boolean(active.closest('main, [role="dialog"], [aria-modal="true"]'));
}

/**
 * Per-route a11y for the SPA (WCAG 2.4.2 + client-side navigation):
 *  - `document.title` becomes "Tên trang · Linguo" for every route,
 *  - a polite live region announces the new page name,
 *  - focus moves to the new page's h1 (or `<main>`) without scrolling, so keyboard and screen-reader users start at
 *    the top of the new screen. Skipped on first load, on search-param / hash-only changes, and when the page has
 *    already placed focus itself (onboarding, placement test, dialogs).
 * Works with lazy routes: React Router commits the new location only once the route chunk has loaded.
 */
export function RouteAnnouncer() {
  const { pathname } = useLocation();
  const previous = useRef(pathname);
  const [message, setMessage] = useState('');

  useLayoutEffect(() => {
    document.title = routeDocumentTitle(pathname);
  }, [pathname]);

  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    // Clear first, set in the next frame: an identical consecutive message (two unknown paths) must still change the
    // live region's text, or screen readers would not announce it again.
    setMessage('');
    const text = routeName(pathname) ?? 'Trang chủ Linguo';
    const announce = requestAnimationFrame(() => setMessage(text));
    // After the frame: a closing sheet restores focus to its trigger in a follow-up commit, which we must not lose to.
    const frame = requestAnimationFrame(() => {
      if (pageAlreadyHasFocus()) return;
      const target = focusTarget();
      if (!target) return;
      if (!target.hasAttribute('tabindex')) {
        target.setAttribute('tabindex', '-1');
        // No outline override: the global :focus-visible ring stays, and the browser itself shows it only for
        // keyboard-initiated navigation.
      }
      target.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(announce);
      cancelAnimationFrame(frame);
    };
  }, [pathname]);

  return (
    <div role="status" aria-live="polite" className="sr-only">
      {message}
    </div>
  );
}
