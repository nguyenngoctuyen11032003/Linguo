import { forwardRef, useContext, useMemo, useRef, type InputHTMLAttributes, type KeyboardEvent } from 'react';
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
  'block w-full min-h-14 rounded-2xl border-2 border-input-border bg-surface-solid px-4 text-[17px] font-medium text-text placeholder:font-normal placeholder:text-muted ' +
  'transition-[border-color,box-shadow] duration-200 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/30 ' +
  'disabled:cursor-not-allowed disabled:opacity-70';

/** Single-line answer field: no autocorrect/capitalisation, ≥ 16px text, IME-safe Enter. */
export const AnswerInput = forwardRef<HTMLInputElement, AnswerInputProps>(function AnswerInput(
  { lang, value, onValueChange, onSubmitRequest, className, onKeyDown, onCompositionStart, onCompositionEnd, ...rest },
  ref,
) {
  const shared = useContext(CompositionGateContext);
  const local = useMemo(() => createCompositionGate(), []);
  const gate = shared ?? local;
  /** A submit request is waiting for the composition to settle: further Enters must not queue a second one. */
  const queued = useRef(false);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e);
    if (e.key !== 'Enter' || e.defaultPrevented) return;
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    if (!onSubmitRequest || e.repeat || queued.current) return;
    queued.current = true;
    gate.run(() => {
      queued.current = false;
      onSubmitRequest();
    });
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
