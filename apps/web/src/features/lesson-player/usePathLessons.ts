import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PathLesson } from '@linguo/shared';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { useOptionalUserId } from '@/features/offline/useUserId';
import { LOCAL_RUNS_EVENT, listLocalRuns, overlayLocalRuns, pruneConfirmedRuns } from '@/features/offline/local-runs';
import type { StoredRun } from '@/features/offline/content-store';
import { readCachedPathLessons, writeCachedPathLessons } from '@/features/offline/swr';
import { getSupabase } from '@/lib/supabase';
import { useOnline } from '@/lib/useOnline';
import { lessonErrorMessage } from './error-map';
import { fetchPathLessons } from './service';

export interface PathLessonsState {
  status: 'loading' | 'ready' | 'error';
  lessons: PathLesson[];
  /** Vietnamese message (from lessonErrorMessage) when status is 'error'. */
  error: string | null;
  /**
   * The list on screen is the copy saved on this device (offline, or the server could not be reached) and has not been
   * confirmed yet. Lessons finished on the device are already applied to it.
   */
  fromCache: boolean;
  reload: () => void;
}

interface Owned {
  pathId: string | null;
  status: PathLessonsState['status'];
  lessons: PathLesson[];
  error: string | null;
  fromCache: boolean;
}

const NO_LESSONS: PathLesson[] = [];
const NO_RUNS: StoredRun[] = [];

/**
 * Lessons of the current learning path (spec 2 §7.1), in path order; empty when there is no path.
 * Stale-while-revalidate: the copy saved on the device is shown at once (and kept when the network fails or the device is
 * offline), the server list replaces it when it arrives. Runs made on the device (offline lessons) are overlaid, so a lesson
 * finished offline shows as completed and unlocks the next before the server has heard of it.
 */
export function usePathLessons(): PathLessonsState {
  const userId = useOptionalUserId();
  const { currentId: pathId, status: pathsStatus } = useLearningPaths();
  const online = useOnline();
  const [owned, setOwned] = useState<Owned>({ pathId, status: 'loading', lessons: NO_LESSONS, error: null, fromCache: false });
  const [attempt, setAttempt] = useState(0);
  const [runs, setRuns] = useState<{ userId: string | null; list: StoredRun[] }>({ userId, list: NO_RUNS });

  useEffect(() => {
    if (!pathId) return;
    const client = getSupabase();
    let active = true;
    const cachedRead = userId ? readCachedPathLessons(userId, pathId) : Promise.resolve(null);
    // Keep the previous list of the same path while reloading so the screen does not blank.
    setOwned((s) => (s.pathId === pathId ? { ...s, status: s.lessons.length > 0 ? s.status : 'loading', error: null } : { pathId, status: 'loading', lessons: NO_LESSONS, error: null, fromCache: false }));

    const fallback = async (error: unknown) => {
      const cached = await cachedRead;
      if (!active) return;
      setOwned((s) => {
        const lessons = s.pathId === pathId && s.lessons.length > 0 ? s.lessons : (cached?.data ?? NO_LESSONS);
        if (lessons.length > 0) return { pathId, status: 'ready', lessons, error: null, fromCache: true };
        return { pathId, status: 'error', lessons: NO_LESSONS, error: lessonErrorMessage(error), fromCache: false };
      });
    };

    if (!client) {
      void fallback(new Error('supabase_unavailable'));
      return () => {
        active = false;
      };
    }
    // Offline: the request could only hang for its timeout; the saved list is the answer.
    if (!online) {
      void fallback(new TypeError('Failed to fetch'));
      return () => {
        active = false;
      };
    }

    let settled = false;
    void cachedRead.then((cached) => {
      if (!active || settled || !cached) return;
      setOwned((s) => (s.pathId === pathId && s.lessons.length > 0 && !s.fromCache ? s : { pathId, status: 'ready', lessons: cached.data, error: null, fromCache: true }));
    });
    fetchPathLessons(client, pathId)
      .then((lessons) => {
        settled = true;
        if (!active) return;
        setOwned({ pathId, status: 'ready', lessons, error: null, fromCache: false });
        if (userId) {
          void writeCachedPathLessons(userId, pathId, lessons);
          // The server list now shows what the device finished: the overlay copies are no longer needed.
          void pruneConfirmedRuns(userId);
        }
      })
      .catch((error: unknown) => {
        settled = true;
        void fallback(error);
      });
    return () => {
      active = false;
    };
  }, [pathId, userId, attempt, online]);

  // Runs made on the device, refreshed whenever they change.
  useEffect(() => {
    if (!userId) return;
    let active = true;
    const read = () => {
      void listLocalRuns(userId).then((list) => {
        if (active) setRuns({ userId, list });
      });
    };
    read();
    window.addEventListener(LOCAL_RUNS_EVENT, read);
    return () => {
      active = false;
      window.removeEventListener(LOCAL_RUNS_EVENT, read);
    };
  }, [userId]);

  // A completion confirmed by the server: refetch so the list itself shows it.
  useEffect(() => {
    if (!userId) return;
    const onChange = () => {
      void listLocalRuns(userId).then((list) => {
        if (list.some((r) => r.confirmedAt !== undefined)) setAttempt((n) => n + 1);
      });
    };
    window.addEventListener(LOCAL_RUNS_EVENT, onChange);
    return () => window.removeEventListener(LOCAL_RUNS_EVENT, onChange);
  }, [userId]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const localRuns = runs.userId === userId ? runs.list : NO_RUNS;
  const overlaid = useMemo(
    () => (pathId && owned.pathId === pathId ? overlayLocalRuns(owned.lessons, localRuns, pathId) : NO_LESSONS),
    [owned.lessons, owned.pathId, localRuns, pathId],
  );

  if (!pathId) {
    return { status: pathsStatus === 'loading' ? 'loading' : 'ready', lessons: NO_LESSONS, error: null, fromCache: false, reload };
  }
  if (owned.pathId !== pathId) return { status: 'loading', lessons: NO_LESSONS, error: null, fromCache: false, reload };
  return { status: owned.status, lessons: overlaid, error: owned.error, fromCache: owned.fromCache, reload };
}
