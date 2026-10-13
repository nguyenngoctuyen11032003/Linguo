import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  lessonPayloadSchema,
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
import { createOutbox, type OutboxEntry } from './outbox';
import { buildSteps, entryKey, exerciseStateFor, initialPlayerState, playerReducer, type EntryRef } from './playerMachine';
import { completeLesson, getLesson, saveCursor, startLesson, submitExercise } from './service';
import type { ExerciseUiState, LessonRunApi, LessonStep, SubmitMeta } from './types';
import { useOutboxSync, type OutboxOutcome } from './useOutboxSync';

export const LESSON_CACHE_PREFIX = 'linguo-lesson-v1:';
export const CURSOR_DEBOUNCE_MS = 500;
const STEP_PARAM = 'buoc';
const NO_ITEMS: LessonItem[] = [];
const NO_EXERCISES: Record<string, PublicExercise> = {};
const NO_STEPS: LessonStep[] = [];

/** Scoped per user and path: a run belongs to one learning path, so another path must never reuse it offline. */
export function lessonCacheKey(userId: string, pathId: string, lessonId: string): string {
  return `${LESSON_CACHE_PREFIX}${userId}:${pathId}:${lessonId}`;
}

/** Text-only payload of the lesson being studied, so it can be reopened offline (spec 2 §7.4). */
function readCache(key: string): LessonPayload | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = lessonPayloadSchema.safeParse(JSON.parse(raw));
    // A completed run cannot take new answers; reopening it needs start_lesson, which needs the network.
    return parsed.success && parsed.data.run?.status === 'in_progress' ? parsed.data : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, payload: LessonPayload): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Offline reopen simply won't be available.
  }
}

/** `?buoc=` is 1-based; returns a 0-based index clamped to the steps, or null when absent/invalid. */
function parseStepParam(value: string | null, stepCount: number): number | null {
  if (value === null || !/^\d+$/.test(value) || stepCount === 0) return null;
  return Math.min(Math.max(Number(value), 1), stepCount) - 1;
}

async function loadPayload(client: AppSupabaseClient, userId: string, lessonId: string, pathId: string): Promise<LessonPayload> {
  let payload: LessonPayload;
  try {
    payload = await getLesson(client, lessonId, pathId);
  } catch (error) {
    const cached = isNetworkError(error) ? readCache(lessonCacheKey(userId, pathId, lessonId)) : null;
    if (!cached) throw error;
    return cached;
  }
  if (payload.run?.status === 'in_progress') return payload;
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

  const applyOutcome = useCallback(
    (outcome: OutboxOutcome, entry: OutboxEntry) => {
      if (entry.args.p_run_id !== runIdRef.current) return;
      const ref: EntryRef = { exerciseId: entry.args.p_exercise_id, queueIndex: entry.queueIndex };
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

  const { pendingCount } = useOutboxSync(client, userId, onOutboxResult);

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
    loadPayload(client, userId, lessonId, pathId)
      .then((payload) => {
        if (!active) return;
        const run = payload.run!;
        const steps = buildSteps(payload, run.queue);
        const { searchParams: params, setSearchParams: setParams } = latest.current;
        const stepIndex = parseStepParam(params.get(STEP_PARAM), steps.length) ?? Math.min(Math.max(run.cursor, 0), Math.max(steps.length - 1, 0));
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
        if (params.get(STEP_PARAM) !== String(stepIndex + 1)) {
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
    if (!ready || !key || !state.payload || !state.run) return;
    writeCache(key, { ...state.payload, run: state.run, attempts: state.attempts });
  }, [ready, state.payload, state.run, state.attempts]);

  // ---- ?buoc= ↔ step index (browser back/forward walk the steps) ------------------------------------------
  useEffect(() => {
    if (!ready) return;
    const { state: current } = latest.current;
    const index = parseStepParam(searchParams.get(STEP_PARAM), current.steps.length);
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
      if (!run || !exercise || !userId) return;
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
          // Storage full/blocked: nothing would ever sync it, so do not show it as waiting.
          fail(new TypeError('Failed to fetch'));
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
  const canComplete = ready && !!state.run && pendingCount === 0 && !inFlight;
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
    canComplete,
    complete,
    completeResult: state.completeResult,
    retry,
  };
}
