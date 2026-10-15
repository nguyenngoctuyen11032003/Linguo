import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExamAttempt, ExamResult } from '@linguo/shared';
import { getSupabase } from '@/lib/supabase';
import { examErrorCode, examErrorMessage, isUnansweredError } from './error-map';
import { getExamAttempt, saveExamAnswer, submitExam } from './service';

// Spec 9 §4. The runner's data: the clock follows the server (deadline_at vs server_now, not the device clock),
// answers autosave 800 ms after the last edit of a question, saves that never reached the server stay queued and
// are resent (same idempotency key) when the browser is back online, on pagehide and before submitting. A save or
// auto-submit that got no answer while the browser still reports itself online (timeout, 5xx) has no `online`
// event to wait for, so it is retried on a backoff timer instead.

export const EXAM_SAVE_DEBOUNCE_MS = 800;
/** First retry delay after an unanswered save / auto-submit; doubles up to EXAM_RETRY_MAX_MS. */
export const EXAM_RETRY_BASE_MS = 5000;
export const EXAM_RETRY_MAX_MS = 30_000;
const TICK_MS = 1000;

export type ExamRunStatus = 'loading' | 'running' | 'submitting' | 'finished' | 'error';
export type ExamSaveState = 'idle' | 'saving' | 'saved' | 'offline' | 'error';

export interface ExamAttemptRun {
  status: ExamRunStatus;
  attempt: ExamAttempt | null;
  result: ExamResult | null;
  /** Vietnamese message: the load failure, or the last failed save / submit while running. */
  error: string | null;
  /** Time left by the server clock; null = untimed. */
  remainingMs: number | null;
  saveState: ExamSaveState;
  /** Updates the local answer at once; saved after 800 ms without another edit of that question. */
  setAnswer(questionId: string, answer: string | null): void;
  /** Flips the flag and saves at once. */
  toggleFlag(questionId: string): void;
  /** Flushes pending saves, then grades; called automatically when the clock reaches 0. */
  submit(): Promise<void>;
}

interface Controller {
  setAnswer(questionId: string, answer: string | null): void;
  toggleFlag(questionId: string): void;
  submit(): Promise<void>;
}

interface PendingSave {
  answer: string | null;
  flagged: boolean;
  /** Same payload → same idempotency key, so a resend is replayed instead of conflicting. */
  payload: string;
  key: string;
}

function browserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function useExamAttempt(attemptId: string): ExamAttemptRun {
  const client = getSupabase();
  const [status, setStatus] = useState<ExamRunStatus>('loading');
  const [attempt, setAttempt] = useState<ExamAttempt | null>(null);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<ExamSaveState>('idle');
  const controller = useRef<Controller | null>(null);

  useEffect(() => {
    setStatus('loading');
    setAttempt(null);
    setResult(null);
    setError(null);
    setRemainingMs(null);
    setSaveState('idle');
    controller.current = null;
    if (!client) {
      setStatus('error');
      setError(examErrorMessage(new Error('supabase_unavailable')));
      return;
    }

    let alive = true;
    let running = false;
    let finished = false;
    let offsetMs = 0;
    let deadlineMs: number | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;
    let autoSubmitted = false;
    let submitting: Promise<void> | null = null;
    let closing: Promise<void> | null = null;
    let offline = false;
    let lastOutcome: ExamSaveState = 'idle';
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = EXAM_RETRY_BASE_MS;
    const local = new Map<string, { answer: string | null; flagged: boolean }>();
    const pending = new Map<string, PendingSave>();
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const inflight = new Map<string, Promise<void>>();

    const serverNow = () => Date.now() + offsetMs;

    function refreshSaveState() {
      if (!alive || finished) return;
      if (inflight.size > 0) setSaveState('saving');
      else if (pending.size > 0) setSaveState(offline ? 'offline' : 'saving');
      else setSaveState(lastOutcome);
    }

    function stopClock() {
      if (interval !== null) clearInterval(interval);
      interval = null;
    }

    function clearTimers() {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    }

    function clearRetry() {
      if (retryTimer !== null) clearTimeout(retryTimer);
      retryTimer = null;
    }

    /**
     * Retries queued saves (and a failed auto-submit) later. Skipped while the browser is offline: the `online`
     * event resends then. Saves still waiting on their debounce go out on their own.
     */
    function scheduleRetry() {
      if (!alive || finished || retryTimer !== null) return;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        if (!alive || finished || browserOffline()) return;
        retryDelay = Math.min(retryDelay * 2, EXAM_RETRY_MAX_MS);
        const due = [...pending.keys()].filter((id) => !timers.has(id));
        void Promise.all(due.map((id) => sendOne(id))).then(() => {
          if (autoSubmitted && !finished && !submitting) void submit();
        });
      }, retryDelay);
    }

    function finish(r: ExamResult) {
      if (finished) return;
      finished = true;
      running = false;
      stopClock();
      clearTimers();
      clearRetry();
      pending.clear();
      if (!alive) return;
      setResult(r);
      setError(null);
      setStatus('finished');
    }

    /** The server closed the attempt (deadline + grace passed, or submitted elsewhere): show its result. */
    function closeFromServer(): Promise<void> {
      if (finished) return Promise.resolve();
      closing ??= (async () => {
        try {
          const state = await getExamAttempt(client!, attemptId);
          finish(state.kind === 'result' ? state.result : await submitExam(client!, attemptId));
        } catch (e) {
          if (alive) setError(examErrorMessage(e));
        } finally {
          closing = null;
        }
      })();
      return closing;
    }

    async function sendOne(questionId: string): Promise<void> {
      while (inflight.has(questionId)) await inflight.get(questionId);
      const entry = pending.get(questionId);
      if (!entry || finished) return;
      if (browserOffline()) {
        offline = true;
        refreshSaveState();
        return;
      }
      const run = (async () => {
        try {
          const res = await saveExamAnswer(client!, {
            attemptId,
            questionId,
            answer: entry.answer,
            flagged: entry.flagged,
            idempotencyKey: entry.key,
          });
          if (pending.get(questionId)?.key === entry.key) pending.delete(questionId);
          offline = false;
          retryDelay = EXAM_RETRY_BASE_MS;
          if (!res.saved || res.status !== 'in_progress') {
            await closeFromServer();
            return;
          }
          lastOutcome = 'saved';
        } catch (e) {
          if (isUnansweredError(e)) {
            offline = true;
            scheduleRetry();
            return;
          }
          if (pending.get(questionId)?.key === entry.key) pending.delete(questionId);
          if (examErrorCode(e) === 'attempt_closed') {
            await closeFromServer();
            return;
          }
          lastOutcome = 'error';
          if (alive) setError(examErrorMessage(e));
        }
      })();
      inflight.set(questionId, run);
      refreshSaveState();
      try {
        await run;
      } finally {
        inflight.delete(questionId);
        refreshSaveState();
      }
    }

    /** Sends every queued save now; resolves once each has an outcome. */
    async function flushAll(): Promise<void> {
      clearTimers();
      await Promise.all([...pending.keys()].map((id) => sendOne(id)));
      await Promise.all([...inflight.values()]);
    }

    function queue(questionId: string) {
      const value = local.get(questionId)!;
      const payload = JSON.stringify([value.answer, value.flagged]);
      const prev = pending.get(questionId);
      const key = prev && prev.payload === payload ? prev.key : crypto.randomUUID();
      pending.set(questionId, { ...value, payload, key });
    }

    function updateLocal(questionId: string, patch: { answer?: string | null; flagged?: boolean }) {
      const value = { ...local.get(questionId)!, ...patch };
      local.set(questionId, value);
      if (alive) {
        setAttempt((prev) =>
          prev && {
            ...prev,
            questions: prev.questions.map((q) => (q.question_id === questionId ? { ...q, ...value } : q)),
          },
        );
      }
    }

    function submit(): Promise<void> {
      if (finished || !running) return submitting ?? Promise.resolve();
      submitting ??= (async () => {
        if (alive) {
          setStatus('submitting');
          setError(null);
        }
        await flushAll();
        if (finished) return;
        if (pending.size > 0) {
          if (alive) {
            setStatus('running');
            setError(examErrorMessage(new Error('answers_unsaved')));
          }
          if (autoSubmitted) scheduleRetry();
          return;
        }
        try {
          finish(await submitExam(client!, attemptId));
        } catch (e) {
          if (examErrorCode(e) === 'attempt_closed') {
            await closeFromServer();
            if (finished) return;
          }
          if (alive) {
            setStatus('running');
            setError(examErrorMessage(e));
          }
          // The clock already ran out: keep trying to hand the attempt in while the server does not answer.
          if (autoSubmitted && isUnansweredError(e)) scheduleRetry();
        }
      })().finally(() => {
        submitting = null;
      });
      return submitting;
    }

    function tick() {
      if (deadlineMs === null || finished) return;
      const left = Math.max(0, deadlineMs - serverNow());
      if (alive) setRemainingMs(left);
      if (left === 0) {
        stopClock();
        if (!autoSubmitted) {
          autoSubmitted = true;
          void submit();
        }
      }
    }

    controller.current = {
      setAnswer(questionId, answer) {
        if (!running || submitting || !local.has(questionId)) return;
        updateLocal(questionId, { answer });
        queue(questionId);
        const prev = timers.get(questionId);
        if (prev !== undefined) clearTimeout(prev);
        timers.set(
          questionId,
          setTimeout(() => {
            timers.delete(questionId);
            void sendOne(questionId);
          }, EXAM_SAVE_DEBOUNCE_MS),
        );
        refreshSaveState();
      },
      toggleFlag(questionId) {
        if (!running || submitting || !local.has(questionId)) return;
        updateLocal(questionId, { flagged: !local.get(questionId)!.flagged });
        queue(questionId);
        const prev = timers.get(questionId);
        if (prev !== undefined) clearTimeout(prev);
        timers.delete(questionId);
        void sendOne(questionId);
      },
      submit,
    };

    const onOnline = () => {
      offline = false;
      refreshSaveState();
      void flushAll().then(() => {
        // An auto-submit that could not go out while offline is retried now.
        if (autoSubmitted && !finished && !submitting) void submit();
      });
    };
    const onPageHide = () => {
      void flushAll();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('pagehide', onPageHide);

    getExamAttempt(client, attemptId)
      .then((state) => {
        if (!alive) return;
        if (state.kind === 'result') {
          finish(state.result);
          return;
        }
        const a = state.attempt;
        offsetMs = Date.parse(a.server_now) - Date.now();
        deadlineMs = a.deadline_at ? Date.parse(a.deadline_at) : null;
        for (const q of a.questions) local.set(q.question_id, { answer: q.answer, flagged: q.flagged });
        running = true;
        setAttempt(a);
        setStatus('running');
        if (deadlineMs !== null) {
          interval = setInterval(tick, TICK_MS);
          tick();
        }
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setStatus('error');
        setError(examErrorMessage(e));
      });

    return () => {
      alive = false;
      stopClock();
      clearRetry();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('pagehide', onPageHide);
      // Unsaved edits still go out after the runner unmounts.
      if (!finished) void flushAll();
      controller.current = null;
    };
  }, [client, attemptId]);

  const setAnswer = useCallback((questionId: string, answer: string | null) => controller.current?.setAnswer(questionId, answer), []);
  const toggleFlag = useCallback((questionId: string) => controller.current?.toggleFlag(questionId), []);
  const submit = useCallback(() => controller.current?.submit() ?? Promise.resolve(), []);

  return { status, attempt, result, error, remainingMs, saveState, setAnswer, toggleFlag, submit };
}
