const FIELD = 'input, textarea, select, [contenteditable="true"]';

/** iOS Safari ignores `interactive-widget`; keep the focused field visible when the keyboard opens. */
export function installKeyboardAwareness(win: Window = window): () => void {
  const vv = win.visualViewport;
  if (!vv) return () => {};
  const onResize = () => {
    const el = win.document.activeElement;
    if (el instanceof HTMLElement && el.matches(FIELD)) el.scrollIntoView({ block: 'center' });
  };
  vv.addEventListener('resize', onResize);
  return () => vv.removeEventListener('resize', onResize);
}
