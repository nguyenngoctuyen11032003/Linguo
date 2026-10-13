import { useEffect, useRef, type KeyboardEvent } from 'react';
import { Check, CornerDownRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ChoiceOption } from './exercise-utils';

export interface ChoiceMarks {
  /** Option the learner submitted ("Bạn chọn"). */
  chosenId: string | null;
  /** `display_answer` from the server; the option whose text matches gets "Đáp án đúng". */
  correctText: string | null;
}

export interface ChoiceGroupProps {
  labelledBy: string;
  options: ChoiceOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  disabled?: boolean;
  marks?: ChoiceMarks | null;
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target.matches('input, textarea, select'));
}

/** A modal dialog (e.g. the lesson exit sheet) is open over the group: its keys belong to the dialog. */
function isCoveredByModal(group: HTMLElement | null): boolean {
  const modals = document.querySelectorAll('[aria-modal="true"]');
  return Array.from(modals).some((modal) => !group || !modal.contains(group));
}

/**
 * ARIA radio group of large buttons: arrow keys move focus and selection (roving tabindex),
 * number keys 1–6 select the n-th visible option anywhere on the page (not while a modal dialog covers it).
 */
export function ChoiceGroup({ labelledBy, options, selectedId, onSelect, disabled = false, marks }: ChoiceGroupProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const groupRef = useRef<HTMLDivElement>(null);
  const selectedIndex = options.findIndex((o) => o.id === selectedId);
  const tabIndexOf = (i: number) => (i === (selectedIndex >= 0 ? selectedIndex : 0) ? 0 : -1);

  useEffect(() => {
    if (disabled) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.repeat || isTypingTarget(e.target) || isCoveredByModal(groupRef.current)) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > Math.min(6, options.length)) return;
      e.preventDefault();
      onSelect(options[n - 1]!.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [disabled, options, onSelect]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const current = refs.current.findIndex((el) => el === document.activeElement);
    const from = current >= 0 ? current : Math.max(selectedIndex, 0);
    const next = (from + step + options.length) % options.length;
    onSelect(options[next]!.id);
    refs.current[next]?.focus();
  };

  return (
    <div ref={groupRef} role="radiogroup" aria-labelledby={labelledBy} onKeyDown={onKeyDown} className="grid min-w-0 gap-2">
      {options.map((option, i) => {
        const checked = option.id === selectedId;
        const chosen = marks?.chosenId === option.id;
        const correct = marks?.correctText != null && marks.correctText.trim() === option.text.trim();
        return (
          <button
            key={option.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={tabIndexOf(i)}
            disabled={disabled}
            onClick={() => onSelect(option.id)}
            className={cn(
              'flex min-h-14 w-full min-w-0 items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors',
              'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40 disabled:cursor-default',
              checked ? 'border-primary bg-primary/10' : 'border-border bg-surface-solid not-disabled:hover:bg-text/5',
              correct && 'border-success',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'inline-flex size-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold',
                checked ? 'border-primary bg-primary text-on-primary' : 'border-input-border text-muted',
              )}
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 break-words">
              <span lang={option.lang} className="block text-[17px] font-medium">
                {option.text}
              </span>
              {(chosen || correct) && (
                <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm font-semibold">
                  {chosen && (
                    <span className="inline-flex items-center gap-1 text-muted">
                      <CornerDownRight aria-hidden className="size-4" />
                      Bạn chọn
                    </span>
                  )}
                  {correct && (
                    <span className="inline-flex items-center gap-1 text-success-text">
                      <Check aria-hidden className="size-4" />
                      Đáp án đúng
                    </span>
                  )}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
