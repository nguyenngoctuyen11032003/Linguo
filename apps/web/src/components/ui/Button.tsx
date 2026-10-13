import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'accent' | 'ghost' | 'glass' | 'danger';
export type ButtonSize = 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  block?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary enabled:hover:bg-primary-strong',
  accent: 'bg-accent text-on-accent enabled:hover:brightness-110',
  ghost: 'border border-border bg-transparent text-text enabled:hover:bg-text/5',
  glass: 'glass text-text enabled:hover:bg-text/5',
  danger: 'border border-error/40 bg-transparent text-error enabled:hover:bg-error/10',
};

/** Shared with links that must look like buttons (e.g. `<Link className={buttonClasses('ghost')}>`). */
export const buttonClasses = (variant: ButtonVariant = 'primary', size: ButtonSize = 'md', block = false) =>
  cn(
    'inline-flex items-center justify-center gap-2 rounded-full py-2 text-center font-semibold leading-tight',
    'transition-[transform,background-color,filter] duration-200 enabled:active:scale-[0.97]',
    'disabled:cursor-not-allowed disabled:opacity-60',
    size === 'lg' ? 'min-h-13 px-6 text-[17px]' : 'min-h-11 px-5 text-[15px]',
    block && 'w-full',
    VARIANTS[variant],
  );

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, block = false, disabled, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClasses(variant, size, block), className)}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
});
