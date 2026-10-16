import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { AnswerLang, WordBankPrompt } from '@linguo/shared';
import { cn } from '@/lib/cn';
import { seededShuffleAway } from './shuffle';

export interface WordBankExerciseProps {
  prompt: WordBankPrompt;
  lang: AnswerLang;
  /** Shuffle seed (run id + exercise id): the bank order is stable across renders and reloads of a run. */
  seed: string;
  tokenIds: string[];
  onChange: (tokenIds: string[]) => void;
  disabled?: boolean;
}

const tokenClasses =
  'inline-flex min-h-12 min-w-12 max-w-full items-center justify-center rounded-2xl border-2 px-4 text-[17px] font-semibold break-words ' +
  'transition-[translate,box-shadow,background-color] duration-150 not-disabled:active:translate-y-[3px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40';

type FocusAfter = { bankIndex: number } | { bankId: string };

/** Tap to place / remove tokens (no drag and drop); a live region announces each change. */
export function WordBankExercise({ prompt, lang, seed, tokenIds, onChange, disabled = false }: WordBankExerciseProps) {
  const answerLabel = useId();
  const [announcement, setAnnouncement] = useState('');
  // Tokens are authored in answer order: never show the bank that way.
  const bank = useMemo(() => seededShuffleAway(prompt.tokens, seed), [prompt.tokens, seed]);
  const byId = new Map(prompt.tokens.map((t) => [t.id, t]));
  const placed = new Set(tokenIds);
  const bankRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const answerRef = useRef<HTMLDivElement>(null);
  // The tapped button disappears (placed) or is removed (answer line), so keep focus somewhere sensible.
  const [focusAfter, setFocusAfter] = useState<FocusAfter | null>(null);

  useEffect(() => {
    if (!focusAfter) return;
    setFocusAfter(null);
    if ('bankId' in focusAfter) {
      bankRefs.current[focusAfter.bankId]?.focus();
      return;
    }
    const available = bank.filter((t) => !tokenIds.includes(t.id));
    const target = available.find((t) => bank.indexOf(t) > focusAfter.bankIndex) ?? available[0];
    if (target) bankRefs.current[target.id]?.focus();
    else answerRef.current?.querySelector<HTMLButtonElement>('button:last-of-type')?.focus();
  }, [focusAfter, bank, tokenIds]);

  const add = (id: string) => {
    const next = [...tokenIds, id];
    onChange(next);
    setFocusAfter({ bankIndex: bank.findIndex((t) => t.id === id) });
    setAnnouncement(`Đã thêm ${byId.get(id)?.text ?? ''}, vị trí ${next.length}`);
  };
  const remove = (index: number) => {
    const id = tokenIds[index]!;
    const next = tokenIds.filter((_, i) => i !== index);
    onChange(next);
    setFocusAfter({ bankId: id });
    setAnnouncement(`Đã bỏ ${byId.get(id)?.text ?? ''} khỏi vị trí ${index + 1}, còn ${next.length} thẻ trong câu`);
  };

  return (
    <div className="min-w-0">
      <p className="mb-5 text-[21px] font-extrabold leading-[1.3] tracking-[-0.015em] break-words">{prompt.instruction}</p>
      <p id={answerLabel} className="sr-only">
        Câu trả lời của bạn
      </p>
      {/* Ruled answer lines, one per token row: 6px top + 3rem token + 4px ledge = 3.625rem = 3rem token + 10px row gap. */}
      <div
        ref={answerRef}
        role="group"
        aria-labelledby={answerLabel}
        lang={lang}
        className="flex min-h-[7.5rem] min-w-0 flex-wrap content-start gap-x-2 gap-y-2.5 bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_calc(3.625rem-2px),var(--border)_calc(3.625rem-2px),var(--border)_3.625rem)] pt-1.5 pb-2"
      >
        {tokenIds.length === 0 && <span className="flex min-h-12 items-center px-1 text-[14px] text-muted">Chạm vào các thẻ bên dưới để ghép câu</span>}
        {tokenIds.map((id, i) => {
          const text = byId.get(id)?.text ?? id;
          return (
            <button
              key={`${id}-${i}`}
              type="button"
              aria-label={`Bỏ '${text}', vị trí ${i + 1}/${tokenIds.length}`}
              disabled={disabled}
              onClick={() => remove(i)}
              className={cn(tokenClasses, 'border-primary/60 bg-surface-solid shadow-[0_4px_0_color-mix(in_srgb,var(--primary)_45%,transparent)] not-disabled:active:shadow-[0_1px_0_var(--primary)]')}
            >
              {text}
            </button>
          );
        })}
      </div>
      <div role="group" aria-label="Các thẻ từ" lang={lang} className="mt-7 flex min-w-0 flex-wrap justify-center gap-x-2 gap-y-2.5 pb-1">
        {bank.map((token) => {
          const used = placed.has(token.id);
          return (
            <button
              key={token.id}
              ref={(el) => {
                bankRefs.current[token.id] = el;
              }}
              type="button"
              aria-label={`Thêm '${token.text}'`}
              aria-hidden={used || undefined}
              tabIndex={used ? -1 : undefined}
              disabled={disabled || used}
              onClick={() => add(token.id)}
              className={cn(
                tokenClasses,
                'border-border bg-surface-solid shadow-[0_4px_0_var(--border)] not-disabled:hover:bg-text/[0.03] not-disabled:active:shadow-[0_1px_0_var(--border)]',
                // A used token leaves a sunken slot of its own size, so the bank never reflows or looks gappy.
                used && 'border-transparent bg-text/[0.07] text-transparent shadow-none',
              )}
            >
              {token.text}
            </button>
          );
        })}
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
