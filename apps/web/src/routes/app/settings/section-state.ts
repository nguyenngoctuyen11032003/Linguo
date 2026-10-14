/**
 * Open/closed state of the collapsible Settings sections. Kept in memory only: it lasts for the browser session
 * (it survives leaving and re-entering Settings) and starts closed again on the next visit.
 */
const openSections = new Map<string, boolean>();
const listeners = new Set<() => void>();

export const SECTION_SCROLL_MARGIN = 'scroll-mt-[calc(4.5rem+env(safe-area-inset-top,0px))]';

export function subscribeSections(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isSectionOpen(id: string): boolean {
  return openSections.get(id) ?? false;
}

export function setSectionOpen(id: string, open: boolean): void {
  if (isSectionOpen(id) === open) return;
  openSections.set(id, open);
  listeners.forEach((listener) => listener());
}

/** Settings sections that start folded. */
export const COLLAPSIBLE_SECTION_IDS: readonly string[] = ['bao-loi', 'tai-khoan-du-lieu'];

/** Opens the section if it is folded, scrolls to it and puts keyboard focus on its heading. */
export function jumpToSection(id: string): void {
  setSectionOpen(id, true);
  // Let React apply the open state (and the browser lay the content out) before scrolling.
  requestAnimationFrame(() => {
    const section = document.getElementById(id);
    if (!section) return;
    section.scrollIntoView?.({ block: 'start' });
    section.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  });
}

/** Test hook. */
export function resetSectionStateForTests(): void {
  openSections.clear();
  listeners.forEach((listener) => listener());
}
