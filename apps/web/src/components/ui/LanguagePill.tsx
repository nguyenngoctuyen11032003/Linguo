import { useEffect, useId, useRef, useState, type FocusEvent } from 'react';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { LANGUAGE_CODES, LANGUAGES, type LanguageCode, type PathStatus } from '@linguo/shared';
import { Spinner } from './Spinner';
import { DISABLED_NEUTRAL } from './disabled-styles';

export interface PillPath {
  id: string;
  language: LanguageCode;
  status: PathStatus;
}

interface LanguagePillProps {
  paths: readonly PillPath[];
  currentId: string | null;
  /** A path switch is in flight: the trigger shows a spinner and the items are disabled. */
  pending?: boolean;
  onSelect: (pathId: string) => void;
  onAdd: (language: LanguageCode) => void;
}

/**
 * Current learning language as text ("EN ▾"), never a flag (PRD 12.2).
 * Disclosure pattern: a button toggles a plain list of buttons (not an ARIA menu).
 */
export function LanguagePill({ paths, currentId, pending = false, onSelect, onAdd }: LanguagePillProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const current = paths.find((p) => p.id === currentId) ?? null;
  const lang = current ? LANGUAGES[current.language] : null;
  const missing = LANGUAGE_CODES.filter((code) => LANGUAGES[code].available && !paths.some((p) => p.language === code));

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

  const itemClass =
    'flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm not-disabled:hover:bg-text/5 ' + DISABLED_NEUTRAL;

  return (
    <div ref={wrapperRef} className="relative" onBlur={onBlur}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-busy={pending || undefined}
        aria-label={lang ? `${lang.short} – Ngôn ngữ đang học: ${lang.nameVi}. Đổi ngôn ngữ` : 'Chọn ngôn ngữ học'}
        onClick={() => setOpen((v) => !v)}
        className="glass inline-flex min-h-11 border border-input-border items-center gap-1.5 rounded-full px-4 text-sm font-semibold"
      >
        {lang ? lang.short : 'Ngôn ngữ'}
        {pending ? <Spinner /> : <ChevronDown aria-hidden className="size-4" />}
      </button>
      <ul
        id={panelId}
        hidden={!open}
        className="z-50 rounded-2xl border border-border bg-surface-solid p-1.5 shadow-[var(--shadow-card)] max-sm:fixed max-sm:inset-x-4 max-sm:top-[calc(3.5rem+env(safe-area-inset-top,0px))] max-sm:w-auto sm:absolute sm:right-0 sm:top-full sm:mt-2 sm:w-64"
      >
        {paths.map((path) => {
          const item = LANGUAGES[path.language];
          const active = path.id === currentId;
          return (
            <li key={path.id}>
              <button
                type="button"
                aria-current={active ? 'true' : undefined}
                disabled={pending}
                onClick={() => {
                  setOpen(false);
                  triggerRef.current?.focus();
                  if (!active) onSelect(path.id);
                }}
                className={itemClass}
              >
                <span>
                  <span className="font-semibold">{item.short}</span> · {item.nameVi} <span lang={path.language}>({item.nativeName})</span>
                  {path.status === 'paused' && <span className="text-muted"> · tạm dừng</span>}
                </span>
                {active && <Check aria-hidden className="size-4 shrink-0 text-primary" />}
              </button>
            </li>
          );
        })}
        {missing.map((code) => (
          <li key={code}>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setOpen(false);
                triggerRef.current?.focus();
                onAdd(code);
              }}
              className={itemClass}
            >
              <span>+ Thêm {LANGUAGES[code].nameVi}</span>
              <Plus aria-hidden className="size-4 shrink-0 text-muted" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
