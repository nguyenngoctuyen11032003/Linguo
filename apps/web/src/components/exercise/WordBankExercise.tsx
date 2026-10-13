import { useEffect, useId, useRef, useState } from 'react';
import type { AnswerLang, WordBankPrompt } from '@linguo/shared';
import { cn } from '@/lib/cn';

export interface WordBankExerciseProps {
  prompt: WordBankPrompt;
  lang: AnswerLang;
  tokenIds: string[];
  onChange: (tokenIds: string[]) => void;
  disabled?: boolean;
}

const tokenClasses =
  'inline-flex min-h-11 min-w-11 max-w-full items-center justify-center rounded-xl border px-4 text-[17px] font-medium break-words ' +
  'transition-[scale,background-color] duration-150 not-disabled:active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40';

type FocusAfter = { bankIndex: number } | { bankId: string };

/** Tap to place / remove tokens (no drag and drop); a live region announces each change. */
export function WordBankExercise({ prompt, lang, tokenIds, onChange, disabled = false }: WordBankExerciseProps) {
  const answerLabel = useId();
  const [announcement, setAnnouncement] = useState('');
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
    const available = prompt.tokens.filter((t) => !tokenIds.includes(t.id));
    const target = available.find((t) => prompt.tokens.indexOf(t) > focusAfter.bankIndex) ?? available[0];
    if (target) bankRefs.current[target.id]?.focus();
    else answerRef.current?.querySelector<HTMLButtonElement>('button:last-of-type')?.focus();
  }, [focusAfter, prompt.tokens, tokenIds]);

  const add = (id: string) => {
    const next = [...tokenIds, id];
    onChange(next);
    setFocusAfter({ bankIndex: prompt.tokens.findIndex((t) => t.id === id) });
    setAnnouncement(`Đã thêm ${byId.get(id)?.text ?? ''}, vị trí ${next.length}`);
  };
  const remove = (index: number) => {
    const id = tokenIds[index]!;
    onChange(tokenIds.filter((_, i) => i !== index));
    setFocusAfter({ bankId: id });
    setAnnouncement(`Đã bỏ ${byId.get(id)?.text ?? ''}`);
  };

  return (
    <div className="min-w-0">
      <p className="mb-4 text-[18px] font-semibold leading-snug break-words">{prompt.instruction}</p>
      <p id={answerLabel} className="sr-only">
        Câu trả lời của bạn
      </p>
      <div
        ref={answerRef}
        role="group"
        aria-labelledby={answerLabel}
        lang={lang}
        className="flex min-h-16 min-w-0 flex-wrap content-start gap-2 rounded-2xl border-2 border-dashed border-border p-2"
      >
        {tokenIds.length === 0 && <span className="self-center px-2 text-[15px] text-muted">Chạm vào các thẻ bên dưới để ghép câu</span>}
        {tokenIds.map((id, i) => {
          const text = byId.get(id)?.text ?? id;
          return (
            <button
              key={`${id}-${i}`}
              type="button"
              aria-label={`Bỏ '${text}'`}
              disabled={disabled}
              onClick={() => remove(i)}
              className={cn(tokenClasses, 'border-primary bg-primary/10')}
            >
              {text}
            </button>
          );
        })}
      </div>
      <div role="group" aria-label="Các thẻ từ" lang={lang} className="mt-4 flex min-w-0 flex-wrap gap-2">
        {prompt.tokens.map((token) => {
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
              className={cn(tokenClasses, 'border-border bg-surface-solid not-disabled:hover:bg-text/5', used && 'invisible')}
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
