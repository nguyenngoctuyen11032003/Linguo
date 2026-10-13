import { useEffect, useId, useRef, useState, type FocusEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { LANGUAGE_CODES, LANGUAGES, type LanguageCode } from '@linguo/shared';

/**
 * Current learning language as text ("EN ▾"), never a flag (PRD 12.2). Switching arrives in spec 1.
 * Disclosure pattern: a button toggles a plain list of buttons (not an ARIA menu).
 */
export function LanguagePill({ current = 'en' }: { current?: LanguageCode }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const lang = LANGUAGES[current];

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // A null relatedTarget (e.g. Safari not focusing clicked buttons) is handled by the pointerdown listener.
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget;
    if (next instanceof Node && !e.currentTarget.contains(next)) setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative" onBlur={onBlur}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${lang.short} – Ngôn ngữ đang học: ${lang.nameVi}. Đổi ngôn ngữ`}
        onClick={() => setOpen((v) => !v)}
        className="glass inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold"
      >
        {lang.short}
        <ChevronDown aria-hidden className="size-4" />
      </button>
      <ul
        id={panelId}
        hidden={!open}
        className="absolute right-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-surface-solid p-1.5 shadow-[var(--shadow-card)]"
      >
        {LANGUAGE_CODES.map((code) => {
          const item = LANGUAGES[code];
          const active = code === current;
          return (
            <li key={code}>
              <button
                type="button"
                aria-current={active ? 'true' : undefined}
                aria-disabled={!item.available || undefined}
                onClick={() => {
                  if (!item.available) return;
                  setOpen(false);
                }}
                className={cn(
                  'flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm',
                  item.available ? 'hover:bg-text/5' : 'cursor-not-allowed opacity-60',
                )}
              >
                <span>
                  <span className="font-semibold">{item.short}</span> · {item.nameVi}{' '}
                  <span lang={code}>({item.nativeName})</span>
                </span>
                {active ? (
                  <Check aria-hidden className="size-4 shrink-0 text-primary" />
                ) : (
                  !item.available && <span className="shrink-0 text-xs text-muted">Sắp ra mắt</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
