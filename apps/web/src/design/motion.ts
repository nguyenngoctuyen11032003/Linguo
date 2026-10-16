import type { Transition, Variants } from 'motion/react';

export const EXPO_OUT = [0.16, 1, 0.3, 1] as const;
export const EASE_OUT = [0.25, 0.46, 0.45, 0.94] as const;
export const SPRING_POP = [0.34, 1.56, 0.64, 1] as const;
export const DUR = { fast: 0.18, base: 0.22, slow: 0.85 } as const;

/** `useInView` options for scroll reveals: fire once, slightly before the element is fully in view. */
export const VIEWPORT_ONCE = { once: true, margin: '0px 0px -60px 0px' } as const;

export type RevealKind = 'slideLeft' | 'slideRight' | 'blurUp' | 'fadeUp' | 'speed' | 'pop' | 'drop' | 'rise';

/**
 * Variants with `hidden` / `shown` states. Expressive tier (landing, celebrations).
 * When `reduce` is true every kind becomes a short opacity fade.
 */
export function reveal(kind: RevealKind, reduce: boolean, delay = 0): Variants {
  // `rise` never hides the element (no opacity change): use it for above-the-fold text so it paints, and counts as
  // the Largest Contentful Paint, before any script or animation runs.
  if (kind === 'rise') {
    if (reduce) return { hidden: {}, shown: {} };
    return { hidden: { y: 14 }, shown: { y: 0, transition: { duration: 0.6, ease: EXPO_OUT, delay } } };
  }
  if (reduce) {
    return { hidden: { opacity: 0 }, shown: { opacity: 1, transition: { duration: DUR.fast } } };
  }
  const t = (duration: number, ease: Transition['ease'] = EXPO_OUT): Transition => ({ duration, ease, delay });
  switch (kind) {
    case 'slideLeft':
      return { hidden: { opacity: 0, x: -400 }, shown: { opacity: 1, x: 0, transition: t(DUR.slow) } };
    case 'slideRight':
      return { hidden: { opacity: 0, x: 400 }, shown: { opacity: 1, x: 0, transition: t(DUR.slow) } };
    case 'blurUp':
      return {
        hidden: { opacity: 0, y: 26, scale: 0.985, filter: 'blur(7px)' },
        shown: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', transition: t(0.9) },
      };
    case 'fadeUp':
      return { hidden: { opacity: 0, y: 16 }, shown: { opacity: 1, y: 0, transition: t(0.7) } };
    case 'speed':
      return {
        hidden: { opacity: 0, x: '-60%', skewX: -8, filter: 'blur(8px)' },
        shown: { opacity: 1, x: '0%', skewX: 0, filter: 'blur(0px)', transition: t(0.8) },
      };
    case 'pop':
      return { hidden: { opacity: 0, y: 8, scale: 0.78 }, shown: { opacity: 1, y: 0, scale: 1, transition: t(0.7, SPRING_POP) } };
    case 'drop':
      return { hidden: { opacity: 0, y: -16, scale: 0.9 }, shown: { opacity: 1, y: 0, scale: 1, transition: t(0.9) } };
  }
}

/** Functional tier (in-app): short, transform/opacity only. */
export const functionalTransition: Transition = { duration: DUR.base, ease: EASE_OUT };
