import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { listPathLessons, type PathLesson } from './service';

export interface PathLessonsState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  lessons: PathLesson[];
  error: unknown;
  reload: () => void;
}

interface Owned {
  pathId: string | null;
  status: PathLessonsState['status'];
  lessons: PathLesson[];
  error: unknown;
}

const initial = (pathId: string | null): Owned => ({ pathId, status: pathId ? 'loading' : 'idle', lessons: [], error: null });

/** Published lessons of a learning path (`path_lessons`), in program → unit → lesson order. `null` path → `idle`. */
export function usePathLessons(pathId: string | null): PathLessonsState {
  const [owned, setOwned] = useState<Owned>(() => initial(pathId));
  const [attempt, setAttempt] = useState(0);
  const state = owned.pathId === pathId ? owned : initial(pathId);

  useEffect(() => {
    if (!pathId) return;
    const client = getSupabase();
    if (!client) {
      setOwned({ ...initial(pathId), status: 'error', error: new Error('supabase_unavailable') });
      return;
    }
    let active = true;
    setOwned((s) => (s.pathId === pathId ? { ...s, status: 'loading', error: null } : initial(pathId)));
    listPathLessons(client, pathId)
      .then((lessons) => {
        if (active) setOwned({ pathId, status: 'ready', lessons, error: null });
      })
      .catch((error: unknown) => {
        // Keep the previous list so a failed refresh does not blank the screen.
        if (active) setOwned((s) => (s.pathId === pathId ? { ...s, status: 'error', error } : { ...initial(pathId), status: 'error', error }));
      });
    return () => {
      active = false;
    };
  }, [pathId, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, reload };
}
