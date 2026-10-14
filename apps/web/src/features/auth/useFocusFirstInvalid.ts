import { useEffect, useRef, useState } from 'react';

/**
 * Moves focus to the first field flagged `aria-invalid` after a failed submit, so keyboard and screen-reader
 * users land on the problem. Call `focusFirstInvalid()` in the same handler that sets the field errors.
 */
export function useFocusFirstInvalid() {
  const formRef = useRef<HTMLFormElement>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (attempt > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [attempt]);
  return { formRef, focusFirstInvalid: () => setAttempt((n) => n + 1) };
}
