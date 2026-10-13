import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { MotionConfig } from 'motion/react';
import { readBool, writeBool } from '@/lib/storage';
import { useMediaQuery } from '@/lib/useMediaQuery';

const STORAGE_KEY = 'lp-reduce-motion';

interface MotionPrefs {
  /** Effective value: system preference OR the in-app toggle. */
  reduceMotion: boolean;
  /** The in-app toggle only (shown in Settings). */
  userReduceMotion: boolean;
  setUserReduceMotion: (value: boolean) => void;
}

const MotionContext = createContext<MotionPrefs | null>(null);

export function MotionProvider({ children }: { children: ReactNode }) {
  const system = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [user, setUser] = useState(() => readBool(STORAGE_KEY));
  const reduceMotion = system || user;

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(reduceMotion);
  }, [reduceMotion]);

  const setUserReduceMotion = useCallback((value: boolean) => {
    setUser(value);
    writeBool(STORAGE_KEY, value);
  }, []);

  const value = useMemo(
    () => ({ reduceMotion, userReduceMotion: user, setUserReduceMotion }),
    [reduceMotion, user, setUserReduceMotion],
  );

  return (
    <MotionContext.Provider value={value}>
      <MotionConfig reducedMotion={reduceMotion ? 'always' : 'never'}>{children}</MotionConfig>
    </MotionContext.Provider>
  );
}

export function useMotionPrefs(): MotionPrefs {
  const ctx = useContext(MotionContext);
  if (!ctx) throw new Error('useMotionPrefs must be used inside <MotionProvider>');
  return ctx;
}
