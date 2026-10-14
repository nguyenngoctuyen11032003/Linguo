import { useId, useLayoutEffect, useRef, type ChangeEvent, type KeyboardEvent, type TextareaHTMLAttributes } from 'react';
import { inputClasses } from '@/components/ui/Input';
import { cn } from '@/lib/cn';

export interface AiTextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value' | 'maxLength' | 'rows'> {
  value: string;
  onValueChange: (value: string) => void;
  maxLength: number;
  invalid?: boolean;
  /** Called on Ctrl/Cmd + Enter. Plain Enter inserts a line break (it also confirms IME composition). */
  onSubmitShortcut?: () => void;
}

/** The counter appears once this share of `maxLength` is used. */
const COUNTER_FROM = 0.8;

/** Multi-line input for tutor questions: grows to about five lines, then scrolls; shows a counter near the limit. */
export function AiTextarea({
  value,
  onValueChange,
  maxLength,
  invalid = false,
  onSubmitShortcut,
  className,
  onKeyDown,
  'aria-describedby': describedBy,
  ...rest
}: AiTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const counterId = useId();
  const showCounter = value.length >= Math.floor(maxLength * COUNTER_FROM);
  const atLimit = value.length >= maxLength;

  // Auto-grow: measure the content height, the CSS max-height caps it (about five lines).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    if (el.scrollHeight > 0) el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing && onSubmitShortcut) {
      e.preventDefault();
      onSubmitShortcut();
    }
  };

  const describedByIds = [describedBy, showCounter ? counterId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="space-y-1">
      <textarea
        ref={ref}
        rows={1}
        value={value}
        maxLength={maxLength}
        aria-invalid={invalid || undefined}
        aria-describedby={describedByIds}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onValueChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className={cn(inputClasses(invalid), 'resize-none overflow-y-auto rounded-3xl py-3 leading-6 max-h-[9.5rem]', className)}
        {...rest}
      />
      {(showCounter || onSubmitShortcut) && (
        <div className="flex items-start justify-between gap-3 px-1 text-sm">
          {onSubmitShortcut ? <p className="hidden text-muted md:block">Nhấn Ctrl hoặc ⌘ + Enter để gửi.</p> : <span />}
          {showCounter && (
            <p id={counterId} className={cn('ml-auto tabular-nums', atLimit ? 'font-semibold text-error-text' : 'text-muted')}>
              {value.length}/{maxLength}
              {atLimit && <span className="sr-only"> ký tự, đã đạt giới hạn</span>}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
