import { useId, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

export interface FieldA11y {
  id: string;
  'aria-describedby'?: string;
  invalid: boolean;
}

interface FormFieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: (a11y: FieldA11y) => ReactNode;
}

export function FormField({ label, hint, error, children }: FormFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block px-1 text-sm font-medium text-text">
        {label}
      </label>
      {children({ id, 'aria-describedby': describedBy, invalid: Boolean(error) })}
      {hint && (
        <p id={hintId} className="px-1 text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="flex items-start gap-1.5 px-1 text-sm text-error">
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
