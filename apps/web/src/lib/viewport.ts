const EDITABLE =
  'input:not([type=checkbox],[type=radio],[type=button],[type=submit],[type=range]), textarea, select';

function isEditable(el: Element | null): el is HTMLElement {
  return el instanceof HTMLElement && (el.isContentEditable || el.matches(EDITABLE));
}

/**
 * iOS Safari ignores `interactive-widget`; keep the focused field visible when the keyboard opens.
 * Resize events are batched per animation frame, and we only react when the visual viewport shrank
 * (keyboard opening) and the focused field is actually hidden by it.
 */
export function installKeyboardAwareness(win: Window = window): () => void {
  const vv = win.visualViewport;
  if (!vv) return () => {};

  let lastHeight = vv.height;
  let frame: number | null = null;

  const run = () => {
    frame = null;
    const shrank = vv.height < lastHeight;
    lastHeight = vv.height;
    if (!shrank) return;
    const el = win.document.activeElement;
    if (!isEditable(el)) return;
    const rect = el.getBoundingClientRect();
    const top = vv.offsetTop;
    const bottom = vv.offsetTop + vv.height;
    if (rect.top < top || rect.bottom > bottom) el.scrollIntoView({ block: 'nearest' });
  };

  const onResize = () => {
    if (frame !== null) return;
    frame = win.requestAnimationFrame(run);
  };

  vv.addEventListener('resize', onResize);
  return () => {
    vv.removeEventListener('resize', onResize);
    if (frame !== null) {
      win.cancelAnimationFrame(frame);
      frame = null;
    }
  };
}
