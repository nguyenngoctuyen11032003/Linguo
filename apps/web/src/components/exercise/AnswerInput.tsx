import { forwardRef, useContext, useMemo, type InputHTMLAttributes, type KeyboardEvent } from 'react';
import { RESPONSE_TEXT_MAX, type AnswerLang } from '@linguo/shared';
import { cn } from '@/lib/cn';
import { CompositionGateContext, createCompositionGate } from './compositionGate';

export interface AnswerInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'lang' | 'type'> {
  lang: AnswerLang;
  value: string;
  onValueChange: (value: string) => void;
  /** Enter pressed outside an IME composition; runs once any composition has settled. */
  onSubmitRequest?: () => void;
}

const answerInputClasses =
  'block w-full min-h-12 rounded-2xl border border-input-border bg-surface-solid px-4 text-[17px] text-text placeholder:text-muted ' +
  'transition-[border-color,box-shadow] duration-200 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/45 ' +
  'disabled:cursor-not-allowed disabled:opacity-70';

/** Single-line answer field: no autocorrect/capitalisation, ≥ 16px text, IME-safe Enter. */
export const AnswerInput = forwardRef<HTMLInputElement, AnswerInputProps>(function AnswerInput(
  { lang, value, onValueChange, onSubmitRequest, className, onKeyDown, onCompositionStart, onCompositionEnd, ...rest },
  ref,
) {
  const shared = useContext(CompositionGateContext);
  const local = useMemo(() => createCompositionGate(), []);
  const gate = shared ?? local;

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e);
    if (e.key !== 'Enter' || e.defaultPrevented) return;
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    if (onSubmitRequest) gate.run(onSubmitRequest);
  };

  return (
    <input
      ref={ref}
      type="text"
      lang={lang}
      autoCapitalize="off"
      autoCorrect="off"
      autoComplete="off"
      spellCheck={false}
      enterKeyHint="done"
      maxLength={RESPONSE_TEXT_MAX}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      onKeyDown={handleKeyDown}
      onCompositionStart={(e) => {
        gate.begin();
        onCompositionStart?.(e);
      }}
      onCompositionEnd={(e) => {
        gate.end();
        onCompositionEnd?.(e);
      }}
      className={cn(answerInputClasses, className)}
      {...rest}
    />
  );
});
