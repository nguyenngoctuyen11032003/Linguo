import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { LANGUAGE_CODES, LANGUAGES, type LanguageCode } from '@lexipath/shared';

/** Current learning language as text ("EN ▾"), never a flag (PRD 12.2). Switching arrives in spec 1. */
export function LanguagePill({ current = 'en' }: { current?: LanguageCode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const lang = LANGUAGES[current];

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Ngôn ngữ đang học: ${lang.nameVi}. Đổi ngôn ngữ`}
        onClick={() => setOpen((v) => !v)}
        className="glass inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold"
      >
        {lang.short}
        <ChevronDown aria-hidden className="size-4" />
      </button>
      {open && (
        <ul
          role="menu"
          aria-label="Chọn ngôn ngữ học"
          className="absolute right-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-surface-solid p-1.5 shadow-[var(--shadow-card)]"
        >
          {LANGUAGE_CODES.map((code) => {
            const item = LANGUAGES[code];
            const active = code === current;
            return (
              <li key={code} role="none">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  disabled={!item.available}
                  onClick={() => setOpen(false)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm enabled:hover:bg-text/5 disabled:opacity-60"
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
      )}
    </div>
  );
}
