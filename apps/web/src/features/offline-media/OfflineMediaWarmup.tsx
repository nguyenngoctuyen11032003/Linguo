import { useEffect } from 'react';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { requestPretendardWarmup } from './font-warmup';

/**
 * Renders nothing. Once the learner is signed in and has a Korean path, and the browser is idle and online on an
 * unmetered connection, asks the service worker to cache the Pretendard subsets (Korean text offline).
 */
export function OfflineMediaWarmup() {
  const { paths } = useLearningPaths();
  const korean = paths.some((p) => p.language === 'ko');
  useEffect(() => {
    if (!korean) return;
    let cancelled = false;
    const run = () => {
      if (!cancelled) void requestPretendardWarmup();
    };
    // Idle, and after the first screens: it competes with nothing the learner is waiting for.
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(run, { timeout: 15_000 });
      return () => {
        cancelled = true;
        w.cancelIdleCallback?.(id);
      };
    }
    const timer = window.setTimeout(run, 8_000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [korean]);
  return null;
}
