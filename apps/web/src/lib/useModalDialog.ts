import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export interface ModalDialogRefs {
  /** Element that opened the dialog; focus returns here on close. Falls back to whatever was focused on open. */
  triggerRef?: RefObject<HTMLElement | null>;
  /** The dialog surface: Tab is trapped inside it and its first focusable element receives focus. */
  containerRef: RefObject<HTMLElement | null>;
}

function focusableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
}

/**
 * Modal behaviour for overlays rendered conditionally with `open`: Escape closes, the page behind does
 * not scroll, Tab / Shift+Tab cycle inside the container, focus moves in on open and is restored to the
 * trigger on close.
 */
export function useModalDialog(open: boolean, onClose: () => void, { triggerRef, containerRef }: ModalDialogRefs): void {
  // Always call the latest handler without re-running the effect (which would re-steal focus).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    // Resolve the return target up front: the trigger exists when the dialog opens, and some browsers
    // (Safari) do not focus a button on click, so `activeElement` alone is not reliable.
    const returnTo = triggerRef?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const container = containerRef.current;
      if (!container) return;
      const items = focusableIn(container);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        event.preventDefault();
        container.focus();
        return;
      }
      const active = document.activeElement;
      const inside = active instanceof Node && container.contains(active);
      if (event.shiftKey && (!inside || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    const container = containerRef.current;
    if (container) (focusableIn(container)[0] ?? container).focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      if (returnTo?.isConnected) returnTo.focus();
    };
  }, [open, containerRef, triggerRef]);
}
