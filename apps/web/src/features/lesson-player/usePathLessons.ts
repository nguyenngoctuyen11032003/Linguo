import { useCallback, useEffect, useState } from 'react';
import type { PathLesson } from '@linguo/shared';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { getSupabase } from '@/lib/supabase';
import { lessonErrorMessage } from './error-map';
import { fetchPathLessons } from './service';

export interface PathLessonsState {
  status: 'loading' | 'ready' | 'error';
  lessons: PathLesson[];
  /** Vietnamese message (from lessonErrorMessage) when status is 'error'. */
  error: string | null;
  reload: () => void;
}

interface Owned {
  pathId: string | null;
  status: PathLessonsState['status'];
  lessons: PathLesson[];
  error: string | null;
}

const NO_LESSONS: PathLesson[] = [];

/** Lessons of the current learning path (spec 2 §7.1), in path order; empty when there is no path. */
export function usePathLessons(): PathLessonsState {
  const { currentId: pathId, status: pathsStatus } = useLearningPaths();
  const [owned, setOwned] = useState<Owned>({ pathId, status: 'loading', lessons: NO_LESSONS, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!pathId) return;
    const client = getSupabase();
    if (!client) {
      setOwned({ pathId, status: 'error', lessons: NO_LESSONS, error: lessonErrorMessage(new Error('supabase_unavailable')) });
      return;
    }
    let active = true;
    // Keep the previous list of the same path while reloading so the screen does not blank.
    setOwned((s) => (s.pathId === pathId ? { ...s, status: 'loading', error: null } : { pathId, status: 'loading', lessons: NO_LESSONS, error: null }));
    fetchPathLessons(client, pathId)
      .then((lessons) => {
        if (active) setOwned({ pathId, status: 'ready', lessons, error: null });
      })
      .catch((error: unknown) => {
        if (active) setOwned((s) => ({ pathId, status: 'error', lessons: s.pathId === pathId ? s.lessons : NO_LESSONS, error: lessonErrorMessage(error) }));
      });
    return () => {
      active = false;
    };
  }, [pathId, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  if (!pathId) {
    return { status: pathsStatus === 'loading' ? 'loading' : 'ready', lessons: NO_LESSONS, error: null, reload };
  }
  if (owned.pathId !== pathId) return { status: 'loading', lessons: NO_LESSONS, error: null, reload };
  return { status: owned.status, lessons: owned.lessons, error: owned.error, reload };
}
