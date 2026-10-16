import { useEffect, useRef, type KeyboardEvent } from 'react';
import { Check, CornerDownRight, X } from 'lucide-react';
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

type Tone = 'idle' | 'checked' | 'correct' | 'wrong';

const CHOICE_TONE: Record<Tone, string> = {
  idle: 'border-border bg-surface-solid shadow-[0_4px_0_var(--border)] not-disabled:hover:bg-text/[0.03] not-disabled:active:shadow-[0_1px_0_var(--border)]',
  checked: 'border-primary bg-primary/10 shadow-[0_4px_0_var(--primary)] not-disabled:active:shadow-[0_1px_0_var(--primary)]',
  correct: 'border-success bg-success/12 shadow-[0_4px_0_var(--success)]',
  wrong: 'border-error bg-error/10 shadow-[0_4px_0_var(--error)]',
};

const KEY_TONE: Record<Tone, string> = {
  idle: 'border-border text-muted',
  checked: 'border-primary bg-primary text-on-primary',
  correct: 'border-success bg-success text-bg',
  wrong: 'border-error bg-error text-bg',
};

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
    <div ref={groupRef} role="radiogroup" aria-labelledby={labelledBy} onKeyDown={onKeyDown} className="grid min-w-0 auto-rows-fr gap-3 pb-1">
      {options.map((option, i) => {
        const checked = option.id === selectedId;
        const chosen = marks?.chosenId === option.id;
        const correct = marks?.correctText != null && marks.correctText.trim() === option.text.trim();
        // One tone per option: graded marks win over the plain selection.
        const tone = correct ? 'correct' : chosen ? 'wrong' : checked ? 'checked' : 'idle';
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
              'flex min-h-16 w-full min-w-0 items-center gap-3.5 rounded-[1.25rem] border-2 px-4 py-3 text-left',
              'transition-[translate,box-shadow,background-color,border-color] duration-150 not-disabled:active:translate-y-[3px]',
              'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40 disabled:cursor-default',
              CHOICE_TONE[tone],
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'inline-flex size-8 shrink-0 items-center justify-center rounded-[0.65rem] border-2 text-sm font-bold tabular-nums',
                KEY_TONE[tone],
              )}
            >
              {tone === 'correct' ? <Check className="size-4" strokeWidth={3} /> : tone === 'wrong' ? <X className="size-4" strokeWidth={3} /> : i + 1}
            </span>
            <span className="min-w-0 flex-1 break-words">
              <span lang={option.lang} className="block text-[17px] font-semibold leading-snug">
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
