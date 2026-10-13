import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const inputClasses = (invalid = false) =>
  cn(
    'block w-full min-h-12 rounded-full border bg-surface-solid px-5 text-base text-text placeholder:text-muted',
    'transition-[border-color,box-shadow] duration-200 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20',
    invalid ? 'border-error' : 'border-border',
  );

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, invalid = false, ...rest }, ref) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={cn(inputClasses(invalid), className)} {...rest} />;
});
