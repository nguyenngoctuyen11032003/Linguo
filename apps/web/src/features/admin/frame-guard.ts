/**
 * Anti-clickjacking for /quan-tri. GitHub Pages cannot send frame-ancestors and a meta CSP ignores it
 * (apps/web/build/csp.ts), so the admin layout refuses to render inside another page's frame.
 */

/** True when the page is not the top-level browsing context (or that cannot be told, e.g. a blocked access). */
export function isFramed(win: Window = window): boolean {
  try {
    return win.top !== win.self;
  } catch {
    return true;
  }
}

/** Asks the browser to load this page as the top-level page; a no-op when it is not allowed (sandboxed frame). */
export function breakOutOfFrame(win: Window = window): void {
  try {
    if (win.top) win.top.location.href = win.self.location.href;
  } catch {
    // A sandboxed frame cannot navigate its top: the layout keeps showing nothing sensitive.
  }
}
