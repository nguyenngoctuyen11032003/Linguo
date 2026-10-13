import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  type CompleteResult,
  type ExerciseResponse,
  type LessonItem,
  type LessonPayload,
  type PublicExercise,
  type SubmitArgs,
} from '@linguo/shared';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthProvider';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { isNetworkError } from '@/lib/network-error';
import { getSupabase, type AppSupabaseClient } from '@/lib/supabase';
import { useOnline } from '@/lib/useOnline';
import { isUnansweredError, lessonErrorMessage } from './error-map';
import { lessonCacheKey, readLessonCache, writeLessonCache } from './lessonCache';
import { createOutbox, OUTBOX_CHANGE_EVENT, outboxKey, type OutboxEntry } from './outbox';
import {
  buildSteps,
  entryKey,
  exerciseStateFor,
  initialPlayerState,
  playerReducer,
  unresolvedSteps,
  type EntryRef,
} from './playerMachine';
import { completeLesson, getLesson, saveCursor, startLesson, submitExercise } from './service';
import type { ExerciseUiState, LessonRunApi, LessonStep, SubmitMeta } from './types';
import { useOutboxSyncContext } from './OutboxSyncProvider';
import type { OutboxOutcome } from './useOutboxSync';

export const CURSOR_DEBOUNCE_MS = 500;
const STEP_PARAM = 'buoc';
const NO_ITEMS: LessonItem[] = [];
const NO_EXERCISES: Record<string, PublicExercise> = {};
const NO_STEPS: LessonStep[] = [];
const NO_INDEXES: number[] = [];

/** `?buoc=` is 1-based; returns a 0-based index clamped to the steps, or null when absent/invalid. */
function parseStepParam(value: string | null, stepCount: number): number | null {
  if (value === null || !/^\d+$/.test(value) || stepCount === 0) return null;
  return Math.min(Math.max(Number(value), 1), stepCount) - 1;
}

/**
 * The open run, else the latest completed one as is (reopening a finished lesson shows its summary). A new run is
 * started only when there is none yet or when the learner asked to study a completed lesson again (`restart`).
 */
async function loadPayload(
  client: AppSupabaseClient,
  userId: string,
  lessonId: string,
  pathId: string,
  restart: boolean,
): Promise<LessonPayload> {
  let payload: LessonPayload;
  try {
    payload = await getLesson(client, lessonId, pathId);
  } catch (error) {
    const cached = isNetworkError(error) ? readLessonCache(lessonCacheKey(userId, pathId, lessonId)) : null;
    if (!cached) throw error;
    return cached;
  }
  if (payload.run?.status === 'in_progress') return payload;
  if (payload.run && !restart) return payload;
  const run = await startLesson(client, lessonId, pathId);
  // A new run starts with no attempts; the payload's attempts belonged to the previous (completed) run.
  return { ...payload, run, attempts: run.id === payload.run?.id ? payload.attempts : [] };
}

interface LoadState {
  status: LessonRunApi['status'];
  error: string | null;
}

/** Spec 2 §7: lesson run state for the lesson screen (steps, `?buoc=`, cursor, submits, offline outbox, completion). */
export function useLessonRun(lessonId: string): LessonRunApi {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { currentId: pathId, status: pathsStatus } = useLearningPaths();
  const waitingForPath = !pathId && pathsStatus === 'loading';
  const client = getSupabase();
  const online = useOnline();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, dispatch] = useReducer(playerReducer, initialPlayerState);
  const [load, setLoad] = useState<LoadState>({ status: 'loading', error: null });
  const [loadAttempt, setLoadAttempt] = useState(0);

  // Latest values for callbacks that must stay stable.
  const latest = useRef({ state, searchParams, setSearchParams, online, client });
  useLayoutEffect(() => {
    latest.current = { state, searchParams, setSearchParams, online, client };
  });

  const runIdRef = useRef<string | null>(null);
  /** Cache key of the loaded run; null while (re)loading so a stale payload is never written under a new key. */
  const cacheKeyRef = useRef<string | null>(null);
  /** Queue entries with a submit in flight (guards double submits before React re-renders). */
  const submittingRef = useRef(new Set<string>());
  /** Outbox results that arrived before the run was loaded; applied right after loading. */
  const earlyResults = useRef<Array<{ outcome: OutboxOutcome; entry: OutboxEntry }>>([]);
  const savedCursor = useRef(0);
  const wantedCursor = useRef(0);
  /** Lesson the learner asked to study again ("Học lại"); the next load starts a new run for it. */
  const restartFor = useRef<string | null>(null);
  // `?buoc=` the load just asked for; until the URL shows it, the old value (e.g. a restarted run's summary) is stale.
  const pendingStepParam = useRef<string | null>(null);

  /** Outbox entries whose result this tab applied: their removal from the outbox is not a vanish (below). */
  const appliedFromOutbox = useRef(new Set<string>());

  const applyOutcome = useCallback(
    (outcome: OutboxOutcome, entry: OutboxEntry) => {
      if (entry.args.p_run_id !== runIdRef.current) return;
      const ref: EntryRef = { exerciseId: entry.args.p_exercise_id, queueIndex: entry.queueIndex };
      appliedFromOutbox.current.add(`${entry.args.p_run_id}:${entryKey(ref.exerciseId, ref.queueIndex)}`);
      if ('result' in outcome) {
        dispatch({ type: 'graded', ...ref, result: outcome.result });
      } else {
        dispatch({ type: 'failed', ...ref });
        toast.show({ tone: 'error', message: lessonErrorMessage(outcome.error) });
      }
    },
    [toast],
  );

  const onOutboxResult = useCallback(
    (_key: string, outcome: OutboxOutcome, entry: OutboxEntry) => {
      if (runIdRef.current === null) earlyResults.current.push({ outcome, entry });
      else applyOutcome(outcome, entry);
    },
    [applyOutcome],
  );

  // The provider (mounted for every signed-in screen) replays the outbox; this lesson only listens to its results.
  const { pendingCount, subscribe } = useOutboxSyncContext();
  useEffect(() => subscribe(onOutboxResult), [subscribe, onOutboxResult]);

  // ---- outbox entries that vanish (another tab sent them, or they expired after 7 days) ------------------
  useEffect(() => {
    if (!userId || !client || !pathId) return;
    const key = outboxKey(userId);
    let timer: number | undefined;
    let active = true;
    const check = () => {
      const applied = appliedFromOutbox.current;
      appliedFromOutbox.current = new Set();
      const runId = runIdRef.current;
      if (!runId) return;
      const queued = new Set(
        createOutbox(userId)
          .list()
          .filter((e) => e.args.p_run_id === runId)
          .map((e) => entryKey(e.args.p_exercise_id, e.queueIndex)),
      );
      const vanished: EntryRef[] = [];
      for (const [k, status] of Object.entries(latest.current.state.local)) {
        if (status !== 'pending_sync' || queued.has(k)) continue;
        // Sent by this tab: its result was (or is being) applied through the provider.
        if (applied.has(`${runId}:${k}`)) continue;
        const at = k.lastIndexOf('#');
        vanished.push({ exerciseId: k.slice(0, at), queueIndex: Number(k.slice(at + 1)) });
      }
      if (vanished.length === 0) return;
      // Never leave them pending forever; the refetch then shows whatever the server graded.
      dispatch({ type: 'outboxCleared', entries: vanished });
      getLesson(client, lessonId, pathId)
        .then((payload) => {
          if (!active || runIdRef.current !== runId || payload.run?.id !== runId) return;
          dispatch({ type: 'attemptsSynced', attempts: payload.attempts, queue: payload.run.queue });
        })
        .catch(() => {
          // Offline: the entries are idle again and can be answered; the next load brings the server state.
        });
    };
    // Deferred: in this tab the drain removes an entry just before it hands over the result.
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(check, 0);
    };
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail;
      if (!detail || detail.key === key) schedule();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === key) schedule();
    };
    window.addEventListener(OUTBOX_CHANGE_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener(OUTBOX_CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, [userId, client, pathId, lessonId]);

  // ---- loading -------------------------------------------------------------------------------------------
  useEffect(() => {
    runIdRef.current = null;
    cacheKeyRef.current = null;
    if (!userId) return;
    if (!client) {
      setLoad({ status: 'error', error: lessonErrorMessage(new Error('supabase_unavailable')) });
      return;
    }
    if (!pathId) {
      setLoad(
        waitingForPath
          ? { status: 'loading', error: null }
          : { status: 'error', error: lessonErrorMessage({ message: 'path_not_found' }) },
      );
      return;
    }
    let active = true;
    setLoad({ status: 'loading', error: null });
    const restart = restartFor.current === lessonId;
    loadPayload(client, userId, lessonId, pathId, restart)
      .then((payload) => {
        if (!active) return;
        if (restart) restartFor.current = null;
        const run = payload.run!;
        const steps = buildSteps(payload, run.queue);
        const { searchParams: params, setSearchParams: setParams } = latest.current;
        const cursorIndex = Math.min(Math.max(run.cursor, 0), Math.max(steps.length - 1, 0));
        // A completed run opens on its summary; a restarted one from its (new) cursor, not the old ?buoc=.
        const stepIndex =
          run.status === 'completed'
            ? steps.findIndex((s) => s.kind === 'summary')
            : ((restart ? null : parseStepParam(params.get(STEP_PARAM), steps.length)) ?? cursorIndex);
        const pending = createOutbox(userId)
          .list()
          .filter((e) => e.args.p_run_id === run.id)
          .map((e) => ({ exerciseId: e.args.p_exercise_id, queueIndex: e.queueIndex }));
        runIdRef.current = run.id;
        cacheKeyRef.current = lessonCacheKey(userId, pathId, lessonId);
        savedCursor.current = run.cursor;
        wantedCursor.current = run.cursor;
        dispatch({ type: 'loaded', payload, run, stepIndex, pending });
        setLoad({ status: 'ready', error: null });
        pendingStepParam.current = null;
        if (params.get(STEP_PARAM) !== String(stepIndex + 1)) {
          pendingStepParam.current = String(stepIndex + 1);
          setParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              next.set(STEP_PARAM, String(stepIndex + 1));
              return next;
            },
            { replace: true },
          );
        }
        const early = earlyResults.current;
        earlyResults.current = [];
        for (const { outcome, entry } of early) applyOutcome(outcome, entry);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoad({ status: 'error', error: lessonErrorMessage(error) });
      });
    return () => {
      active = false;
    };
  }, [client, userId, pathId, waitingForPath, lessonId, loadAttempt, applyOutcome]);

  const ready = load.status === 'ready';

  // ---- offline cache -------------------------------------------------------------------------------------
  useEffect(() => {
    // Keyed by the run that is loaded, not by the current params: right after the lesson/path changes the state
    // still holds the previous payload (the loading effect has already cleared the key).
    const key = cacheKeyRef.current;
    if (!ready || !key || !userId || !state.payload || !state.run) return;
    writeLessonCache(userId, key, { ...state.payload, run: state.run, attempts: state.attempts });
  }, [ready, userId, state.payload, state.run, state.attempts]);

  // ---- ?buoc= ↔ step index (browser back/forward walk the steps) ------------------------------------------
  useEffect(() => {
    if (!ready) return;
    const value = searchParams.get(STEP_PARAM);
    if (pendingStepParam.current !== null) {
      if (value !== pendingStepParam.current) return;
      pendingStepParam.current = null;
    }
    const { state: current } = latest.current;
    const index = parseStepParam(value, current.steps.length);
    if (index !== null && index !== current.stepIndex) dispatch({ type: 'goto', index });
  }, [ready, searchParams]);

  const goTo = useCallback((index: number) => {
    const { state: current, setSearchParams: setParams } = latest.current;
    if (current.steps.length === 0) return;
    const target = Math.min(Math.max(Math.trunc(index), 0), current.steps.length - 1);
    dispatch({ type: 'goto', index: target });
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set(STEP_PARAM, String(target + 1));
        return next;
      },
      { replace: target === current.stepIndex },
    );
  }, []);

  const next = useCallback(() => goTo(latest.current.state.stepIndex + 1), [goTo]);
  const back = useCallback(() => goTo(latest.current.state.stepIndex - 1), [goTo]);

  // ---- cursor (debounced, only ever increases) ------------------------------------------------------------
  const runId = state.run?.id ?? null;
  const runActive = state.run?.status === 'in_progress';

  const flushCursor = useCallback(() => {
    const { client: c } = latest.current;
    const id = runIdRef.current;
    const target = wantedCursor.current;
    if (!c || !id || target <= savedCursor.current) return;
    savedCursor.current = target;
    saveCursor(c, id, target).catch(() => {
      // Best effort: the cursor only restores the position; the server keeps the max anyway.
    });
  }, []);

  useEffect(() => {
    if (!runId || !runActive) return;
    wantedCursor.current = Math.max(wantedCursor.current, state.stepIndex);
    if (wantedCursor.current <= savedCursor.current) return;
    const timer = window.setTimeout(flushCursor, CURSOR_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [runId, runActive, state.stepIndex, flushCursor]);

  useEffect(() => () => flushCursor(), [flushCursor]);

  // ---- submit --------------------------------------------------------------------------------------------
  const submit = useCallback(
    async (exerciseId: string, queueIndex: number, response: ExerciseResponse, meta: SubmitMeta) => {
      const { state: current, client: c, online: isOnline } = latest.current;
      const run = current.run;
      const exercise = current.payload?.exercises.find((e) => e.id === exerciseId);
      if (!run || run.status !== 'in_progress' || !exercise || !userId) return;
      const ref: EntryRef = { exerciseId, queueIndex };
      // One answer at a time per queue entry, and none once it is resolved: a second (double-click) submit would be
      // graded as attempt 2 (revealing the answer), and one after the reveal would count as the re-check.
      const key = `${run.id}:${entryKey(exerciseId, queueIndex)}`;
      const known = exerciseStateFor(current, exerciseId, queueIndex);
      if (submittingRef.current.has(key) || known.status === 'submitting' || known.status === 'pending_sync') return;
      if (known.lastResult?.final) return;
      submittingRef.current.add(key);
      const args: SubmitArgs = {
        p_run_id: run.id,
        p_exercise_id: exerciseId,
        p_exercise_version: exercise.version,
        p_idempotency_key: crypto.randomUUID(),
        p_response: response as Record<string, unknown>,
        p_confidence: meta.confidence,
        p_response_ms: Math.max(0, Math.round(meta.responseMs)),
        p_hint_count: Math.max(0, Math.round(meta.hintCount)),
        p_client_at: new Date().toISOString(),
      };
      /** The answer belongs to the run on screen (the learner may have moved to another lesson meanwhile). */
      const sameRun = () => runIdRef.current === run.id;
      const fail = (error: unknown) => {
        if (!sameRun()) return;
        dispatch({ type: 'failed', ...ref });
        toast.show({ tone: 'error', message: lessonErrorMessage(error) });
      };
      const queueOffline = () => {
        if (!createOutbox(userId).add({ args, queueIndex })) {
          // Storage full/blocked: nothing would ever sync it, so do not show it as waiting. The answer stays on
          // screen (the entry goes back to idle) so the learner can send it again once the network is back.
          fail(new Error('outbox_unavailable'));
          return;
        }
        if (sameRun()) dispatch({ type: 'pending', ...ref });
      };
      dispatch({ type: 'submitting', ...ref });
      try {
        if (!c) {
          fail(new Error('supabase_unavailable'));
          return;
        }
        if (!isOnline) {
          queueOffline();
          return;
        }
        try {
          const result = await submitExercise(c, args);
          if (sameRun()) dispatch({ type: 'graded', ...ref, result });
        } catch (error) {
          // Timed out or failed on the server before grading: resend later under the same idempotency key.
          if (isUnansweredError(error)) queueOffline();
          else fail(error);
        }
      } finally {
        submittingRef.current.delete(key);
      }
    },
    [userId, toast],
  );

  // ---- completion ----------------------------------------------------------------------------------------
  const inFlight = Object.keys(state.local).length > 0;
  // complete_lesson refuses a run with an unanswered queue entry; checking here keeps the summary from waiting forever.
  const unresolved = useMemo(() => (ready ? unresolvedSteps(state) : NO_INDEXES), [ready, state]);
  const canComplete = ready && !!state.run && pendingCount === 0 && !inFlight && unresolved.length === 0;
  const canCompleteRef = useRef(canComplete);
  useLayoutEffect(() => {
    canCompleteRef.current = canComplete;
  });

  const complete = useCallback(async (): Promise<CompleteResult | null> => {
    const { state: current, client: c } = latest.current;
    if (current.completeResult) return current.completeResult;
    if (!c || !current.run || !canCompleteRef.current) return null;
    try {
      const result = await completeLesson(c, current.run.id);
      dispatch({ type: 'completed', result });
      return result;
    } catch (error) {
      toast.show({ tone: 'error', message: lessonErrorMessage(error) });
      return null;
    }
  }, [toast]);

  const retry = useCallback(() => setLoadAttempt((n) => n + 1), []);

  const restart = useCallback(() => {
    restartFor.current = lessonId;
    setLoadAttempt((n) => n + 1);
  }, [lessonId]);

  const exerciseState = useCallback(
    (exerciseId: string, queueIndex: number): ExerciseUiState => exerciseStateFor(state, exerciseId, queueIndex),
    [state],
  );

  const exercises = useMemo(() => {
    const map: Record<string, PublicExercise> = {};
    for (const e of state.payload?.exercises ?? []) map[e.id] = e;
    return map;
  }, [state.payload]);

  const steps = ready ? state.steps : NO_STEPS;
  const stepIndex = ready ? state.stepIndex : 0;

  return {
    status: load.status,
    error: load.error,
    lesson: ready ? (state.payload?.lesson ?? null) : null,
    items: ready ? (state.payload?.items ?? NO_ITEMS) : NO_ITEMS,
    exercises: ready ? exercises : NO_EXERCISES,
    steps,
    stepIndex,
    step: steps[stepIndex] ?? null,
    goTo,
    next,
    back,
    exerciseState,
    submit,
    pendingCount,
    unresolved,
    canComplete,
    complete,
    completeResult: state.completeResult,
    runId: ready ? (state.run?.id ?? null) : null,
    runStatus: ready ? (state.run?.status ?? null) : null,
    retry,
    restart,
  };
}
