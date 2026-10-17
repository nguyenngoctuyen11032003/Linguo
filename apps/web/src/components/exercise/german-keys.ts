/** The characters a Vietnamese keyboard cannot type; the grader also accepts ae / oe / ue / ss for them. */
export const GERMAN_CHARS = ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'] as const;

export const GERMAN_CHAR_NAMES: Record<(typeof GERMAN_CHARS)[number], string> = {
  ä: 'ä',
  ö: 'ö',
  ü: 'ü',
  ß: 'ß (eszett)',
  Ä: 'Ä hoa',
  Ö: 'Ö hoa',
  Ü: 'Ü hoa',
};

export const GERMAN_KEYS_HINT = 'Không có phím ä ö ü ß? Bấm nút, hoặc gõ ae, oe, ue, ss: hệ thống vẫn chấm đúng.';
export const GERMAN_KEYS_HINT_UNGRADED = 'Không có phím ä ö ü ß? Bấm nút để chèn vào chỗ con trỏ.';

export type TextField = HTMLInputElement | HTMLTextAreaElement;

export function isTextField(el: EventTarget | Element | null): el is TextField {
  if (el instanceof HTMLTextAreaElement) return true;
  return el instanceof HTMLInputElement && (el.type === 'text' || el.type === 'search');
}

/**
 * Types `char` at the caret of a React-controlled field: the native value setter plus a real `input` event, so the
 * field's own onChange runs (nothing is assumed about how the caller stores the value). Respects maxLength.
 */
export function insertAtCaret(el: TextField, char: string): boolean {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  const next = el.value.slice(0, start) + char + el.value.slice(end);
  if (el.maxLength > 0 && next.length > el.maxLength) return false;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, next);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.focus();
  el.setSelectionRange(start + char.length, start + char.length);
  return true;
}

