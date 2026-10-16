import { forwardRef, useId, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'accent' | 'ghost' | 'glass' | 'danger';
export type ButtonSize = 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  block?: boolean;
  /** Short line under the button (typically why it is disabled), linked to it through `aria-describedby`. */
  hint?: string;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'press-primary bg-primary text-on-primary not-disabled:hover:bg-primary-strong',
  accent: 'press-accent bg-accent text-on-accent not-disabled:hover:brightness-110',
  ghost: 'border border-border bg-text/[0.03] text-text not-disabled:hover:bg-text/8 not-disabled:active:scale-[0.97]',
  glass: 'glass text-text not-disabled:hover:bg-text/5 not-disabled:active:scale-[0.97]',
  danger: 'border border-error/40 bg-transparent text-error not-disabled:hover:bg-error/10 not-disabled:active:scale-[0.97]',
};

/**
 * Disabled reads as a neutral surface with a dashed outline (muted text >= 4.5:1, outline >= 3:1) instead of faded
 * colour. A loading button keeps its colour: `aria-busy` marks it and the spinner shows progress.
 */
const DISABLED =
  'disabled:cursor-not-allowed disabled:aria-busy:cursor-progress ' +
  'disabled:not-aria-busy:border-transparent disabled:not-aria-busy:bg-surface-solid disabled:not-aria-busy:text-muted ' +
  'disabled:not-aria-busy:shadow-none disabled:not-aria-busy:outline-2 disabled:not-aria-busy:-outline-offset-2 disabled:not-aria-busy:outline-dashed disabled:not-aria-busy:outline-muted';

/** Shared with links that must look like buttons (e.g. `<Link className={buttonClasses('ghost')}>`). */
export const buttonClasses = (variant: ButtonVariant = 'primary', size: ButtonSize = 'md', block = false) =>
  cn(
    'inline-flex items-center justify-center gap-2 rounded-full py-2 text-center font-bold leading-tight tracking-[-0.01em]',
    'transition-[scale,translate,box-shadow,background-color,filter] duration-150',
    DISABLED,
    size === 'lg' ? 'min-h-13 px-6 text-[17px]' : 'min-h-11 px-5 text-[15px]',
    block && 'w-full',
    VARIANTS[variant],
  );

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    block = false,
    hint,
    disabled,
    className,
    children,
    type = 'button',
    'aria-describedby': describedByProp,
    ...rest
  },
  ref,
) {
  const hintId = useId();
  const describedBy = [describedByProp, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  const button = (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-describedby={describedBy}
      className={cn(buttonClasses(variant, size, block), className)}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
  if (!hint) return button;
  return (
    <span className={cn('inline-flex flex-col items-center gap-1.5', block && 'w-full')}>
      {button}
      <span id={hintId} className="text-center text-sm text-muted">
        {hint}
      </span>
    </span>
  );
});
