import { createContext } from 'react';

export const COMPOSITION_FALLBACK_MS = 80;

/**
 * Tracks IME composition (Korean, Vietnamese Telex…) across the inputs of one exercise so a submit
 * requested mid-composition waits for `compositionend` (or an 80 ms fallback) before reading values.
 */
export interface CompositionGate {
  readonly composing: boolean;
  begin(): void;
  end(): void;
  /** Runs `fn` now when no composition is active, otherwise once it ends (or after the fallback delay). */
  run(fn: () => void): void;
}

export function createCompositionGate(fallbackMs = COMPOSITION_FALLBACK_MS): CompositionGate {
  let composing = false;
  let pending: Array<() => void> = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    const fns = pending;
    pending = [];
    fns.forEach((fn) => fn());
  };

  return {
    get composing() {
      return composing;
    },
    begin() {
      composing = true;
    },
    end() {
      composing = false;
      // Let the final `input`/`change` of the composition land (its order vs compositionend varies by browser).
      if (pending.length > 0) setTimeout(flush, 0);
    },
    run(fn) {
      if (!composing) {
        fn();
        return;
      }
      pending.push(fn);
      if (timer === null) {
        timer = setTimeout(() => {
          timer = null;
          composing = false;
          flush();
        }, fallbackMs);
      }
    },
  };
}

/** Shared by the ExerciseFrame and its AnswerInputs; inputs fall back to a private gate without a provider. */
export const CompositionGateContext = createContext<CompositionGate | null>(null);
