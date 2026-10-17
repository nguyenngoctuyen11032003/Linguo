import { useId, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { GERMAN_CHARS, GERMAN_KEYS_HINT, GERMAN_KEYS_HINT_UNGRADED, GERMAN_CHAR_NAMES, insertAtCaret, isTextField, type TextField } from './german-keys';

export interface GermanKeysScopeProps {
  /** Off for any other language: the children render untouched, with no wrapper. */
  enabled: boolean;
  /** The answer is auto-graded (so ae/oe/ue/ss count); essays and chat replies are not. */
  graded?: boolean;
  disabled?: boolean;
  /** Tighter row for sticky composers: smaller keys, the hint stays available to screen readers only. */
  compact?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Wraps one or more text fields and, for German, adds a row of ä ö ü ß Ä Ö Ü buttons below them. The buttons type into
 * the field that had focus last (or the first one), keep the keyboard open and never take part in the tab flow of the
 * answer itself beyond one stop each.
 */
export function GermanKeysScope({ enabled, graded = true, disabled = false, compact = false, className, children }: GermanKeysScopeProps) {
  if (!enabled) return <>{children}</>;
  return (
    <GermanKeysInner graded={graded} disabled={disabled} compact={compact} className={className}>
      {children}
    </GermanKeysInner>
  );
}

function GermanKeysInner({ graded, disabled, compact, className, children }: Omit<GermanKeysScopeProps, 'enabled'>) {
  const scope = useRef<HTMLDivElement>(null);
  const last = useRef<TextField | null>(null);
  const hintId = useId();

  const insert = (char: string) => {
    const root = scope.current;
    if (!root || disabled) return;
    const remembered = last.current && root.contains(last.current) && !last.current.disabled ? last.current : null;
    const target = remembered ?? root.querySelector<TextField>('input[type="text"]:not(:disabled), textarea:not(:disabled)');
    if (target) insertAtCaret(target, char);
  };

  return (
    <div ref={scope} className={cn('min-w-0', className)} onFocusCapture={(e) => isTextField(e.target) && (last.current = e.target)}>
      {children}
      <div className={cn('min-w-0', compact ? 'mt-1.5' : 'mt-2')}>
        <div role="group" aria-label="Chèn chữ cái tiếng Đức" aria-describedby={hintId} className="flex flex-wrap items-center gap-1.5">
          {GERMAN_CHARS.map((char) => (
            <button
              key={char}
              type="button"
              lang="de"
              disabled={disabled}
              aria-label={`Chèn ${GERMAN_CHAR_NAMES[char]}`}
              // Keep the caret and the on-screen keyboard where they are.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(char)}
              className={cn(
                compact ? 'size-9 text-[16px]' : 'size-10 text-[18px]',
                'inline-flex items-center justify-center rounded-xl border-2 border-border bg-surface-solid font-semibold text-text',
                'shadow-[0_2px_0_var(--border)] transition-[translate,box-shadow,background-color] duration-150 active:translate-y-[2px] active:shadow-none',
                'hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60',
              )}
            >
              {char}
            </button>
          ))}
        </div>
        <p id={hintId} className={compact ? 'sr-only' : 'mt-1.5 text-[13px] text-muted'}>
          {graded ? GERMAN_KEYS_HINT : GERMAN_KEYS_HINT_UNGRADED}
        </p>
      </div>
    </div>
  );
}
