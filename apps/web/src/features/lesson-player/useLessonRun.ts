import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { getSupabase } from '@/lib/supabase';
import { lessonErrorCode } from './error-map';
import { readLessonCache, saveLessonCache, updateCachedRun } from './lesson-cache';
import { enqueueOutbox, outboxSize, pendingForRun, startOutboxSync, subscribeOutbox, type OutboxSync } from './outbox';
import { canComplete, initPlayer, playerReducer, selectView, toRunSnapshot, type PlayerAction, type PlayerState, type PlayerView } from './playerMachine';
import {
  completeLesson,
  getLessonRaw,
  NetworkError,
  parseLessonPayload,
  saveLessonCursor,
  startLesson,
  submitExercise,
  type Lesson,
  type RunState,
  type SubmitInput,
} from './service';

export interface SubmitMeta {
  /** 1 = "Đoán", 2 = "Hơi chắc", 3 = "Chắc chắn"; null in the recognition stage. */
  confidence: 1 | 2 | 3 | null;
  responseMs: number;
  hintCount: number;
}

export interface LessonRun {
  status: 'loading' | 'ready' | 'error';
  /** Load error (use `lessonErrorMessage`). */
  error: unknown;
  /** Opened from the on-device copy because the server could not be reached. */
  offline: boolean;
  state: PlayerState | null;
  view: PlayerView | null;
  next: () => void;
  goTo: (cursor: number) => void;
  /** Never rejects: outcomes land in `state` (`submitError`, pending, feedback). */
  submit: (response: unknown, meta: SubmitMeta) => Promise<void>;
  giveUp: (meta: SubmitMeta) => Promise<void>;
  /** Never rejects; see `state.completion`. No-op until `view.canComplete`. */
  complete: () => Promise<void>;
  reload: () => void;
}

type HookAction = PlayerAction | { type: 'init'; state: PlayerState | null };

function reducer(s: PlayerState | null, a: HookAction): PlayerState | null {
  if (a.type === 'init') return a.state;
  return s ? playerReducer(s, a) : s;
}

interface Loaded {
  key: string;
  status: LessonRun['status'];
  error: unknown;
  offline: boolean;
}

const newKey = () => crypto.randomUUID();

/**
 * Loads (or resumes) a lesson run and drives the player: submissions go straight to `submit_exercise`, falling back
 * to the outbox on network failure; outbox results flow back in as they sync, possibly from another tab.
 */
export function useLessonRun(lessonId: string, pathId: string | null): LessonRun {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const loadKey = `${userId}|${lessonId}|${pathId}`;
  const [state, dispatch] = useReducer(reducer, null);
  const [loaded, setLoaded] = useState<Loaded>({ key: '', status: 'loading', error: null, offline: false });
  const [attempt, setAttempt] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const inFlight = useRef(false);
  const syncRef = useRef<OutboxSync | null>(null);
  const savedCursor = useRef<{ runId: string; cursor: number } | null>(null);

  // Load or resume.
  useEffect(() => {
    dispatch({ type: 'init', state: null });
    if (!userId || !pathId) return;
    const client = getSupabase();
    if (!client) {
      setLoaded({ key: loadKey, status: 'error', error: new Error('supabase_unavailable'), offline: false });
      return;
    }
    let active = true;
    setLoaded({ key: loadKey, status: 'loading', error: null, offline: false });
    (async () => {
      let offline = false;
      let lesson: Lesson;
      let run: RunState;
      try {
        const raw = await getLessonRaw(client, lessonId, pathId);
        const payload = parseLessonPayload(raw);
        lesson = payload.lesson;
        run = payload.run?.status === 'in_progress' ? payload.run : await startLesson(client, lessonId, pathId);
        const cached = readLessonCache(userId, lessonId, pathId);
        // Cursor saves made while offline never reached the server.
        if (cached?.run.runId === run.runId && cached.run.cursor > run.cursor) run = { ...run, cursor: cached.run.cursor };
        saveLessonCache(userId, { lessonId, pathId, payload: raw, run });
      } catch (error) {
        const cached = error instanceof NetworkError ? readLessonCache(userId, lessonId, pathId) : null;
        if (!cached) {
          if (active) {
            const shown = error instanceof NetworkError ? Object.assign(new Error('lesson_unavailable_offline'), { cause: error }) : error;
            setLoaded({ key: loadKey, status: 'error', error: shown, offline: false });
          }
          return;
        }
        lesson = cached.lesson;
        run = cached.run;
        offline = true;
      }
      if (!active) return;
      savedCursor.current = { runId: run.runId, cursor: run.cursor };
      const pending = pendingForRun(userId, run.runId);
      dispatch({ type: 'init', state: initPlayer({ lesson, run, pending, outboxSize: outboxSize(userId) }) });
      setLoaded({ key: loadKey, status: 'ready', error: null, offline });
    })();
    return () => {
      active = false;
    };
  }, [userId, lessonId, pathId, attempt, loadKey]);

  // Outbox: flush on open/online/visible, and feed synced results back into the player.
  useEffect(() => {
    if (!userId) return;
    const client = getSupabase();
    if (!client) return;
    const unsubscribe = subscribeOutbox(userId, (event) => {
      if (event.type === 'changed') {
        dispatch({ type: 'outbox_size', size: event.size });
        return;
      }
      if (event.item.runId !== stateRef.current?.runId) return;
      if (event.type === 'synced') dispatch({ type: 'sync_result', key: event.item.idempotencyKey, exerciseId: event.item.exerciseId, result: event.result });
      else dispatch({ type: 'sync_failed', key: event.item.idempotencyKey, exerciseId: event.item.exerciseId });
    });
    const sync = startOutboxSync({ userId, send: (item) => submitExercise(client, item) });
    syncRef.current = sync;
    return () => {
      sync.stop();
      unsubscribe();
      syncRef.current = null;
    };
  }, [userId]);

  // Persist progress: server cursor (monotonic) and the offline copy.
  const runId = state?.runId;
  const maxCursor = state?.maxCursor;
  useEffect(() => {
    if (!runId || maxCursor === undefined) return;
    const last = savedCursor.current;
    if (last?.runId === runId && last.cursor >= maxCursor) return;
    const client = getSupabase();
    if (!client) return;
    savedCursor.current = { runId, cursor: maxCursor };
    saveLessonCursor(client, runId, maxCursor).catch(() => {
      // Kept in the offline copy and re-sent with the next step; the server keeps the greatest value.
      if (savedCursor.current?.runId === runId && savedCursor.current.cursor === maxCursor) savedCursor.current = { runId, cursor: maxCursor - 1 };
    });
  }, [runId, maxCursor]);

  useEffect(() => {
    if (state && userId && pathId) updateCachedRun(userId, lessonId, pathId, toRunSnapshot(state));
  }, [state, userId, lessonId, pathId]);

  const next = useCallback(() => dispatch({ type: 'next' }), []);
  const goTo = useCallback((cursor: number) => dispatch({ type: 'go_to', cursor }), []);

  const submit = useCallback(
    async (response: unknown, meta: SubmitMeta) => {
      const s = stateRef.current;
      const client = getSupabase();
      if (!s || !client || !userId || inFlight.current) return;
      const view = selectView(s);
      if (!view.canSubmit || !view.exercise) return;
      inFlight.current = true; // double taps: one request only
      const key = newKey();
      const input: SubmitInput = {
        runId: s.runId,
        exerciseId: view.exercise.id,
        exerciseVersion: view.exercise.version,
        idempotencyKey: key,
        response,
        confidence: meta.confidence,
        responseMs: Math.max(0, Math.round(meta.responseMs)),
        hintCount: Math.max(0, Math.round(meta.hintCount)),
        clientAt: new Date().toISOString(),
      };
      dispatch({ type: 'submit_start', key, exerciseId: input.exerciseId });
      const queue = () => {
        enqueueOutbox(userId, { ...input, lessonId: s.lesson.id });
        dispatch({ type: 'submit_queued', key });
        void syncRef.current?.trigger();
      };
      try {
        // Older answers are still waiting: keep FIFO order by queueing behind them.
        if (outboxSize(userId) > 0) {
          queue();
          return;
        }
        try {
          const result = await submitExercise(client, input);
          dispatch({ type: 'submit_result', key, result });
        } catch (error) {
          if (error instanceof NetworkError) queue();
          else dispatch({ type: 'submit_failed', key, code: lessonErrorCode(error) });
        }
      } finally {
        inFlight.current = false;
      }
    },
    [userId],
  );

  const giveUp = useCallback((meta: SubmitMeta) => submit({ give_up: true }, meta), [submit]);

  const complete = useCallback(async () => {
    const s = stateRef.current;
    const client = getSupabase();
    if (!s || !client || !canComplete(s)) return;
    dispatch({ type: 'complete_start' });
    try {
      const result = await completeLesson(client, s.runId);
      dispatch({ type: 'complete_result', result });
    } catch (error) {
      dispatch({ type: 'complete_failed', code: lessonErrorCode(error) });
    }
  }, []);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const current = loaded.key === loadKey ? loaded : { key: loadKey, status: 'loading' as const, error: null, offline: false };
  const view = useMemo(() => (state ? selectView(state) : null), [state]);

  return {
    status: current.status === 'ready' && !state ? 'loading' : current.status,
    error: current.error,
    offline: current.offline,
    state,
    view,
    next,
    goTo,
    submit,
    giveUp,
    complete,
    reload,
  };
}
