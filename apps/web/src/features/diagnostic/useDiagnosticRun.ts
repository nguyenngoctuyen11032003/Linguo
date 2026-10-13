import { useCallback, useContext, useEffect, useLayoutEffect, useReducer, useRef } from 'react';
import type {
  DiagnosticItem,
  DiagnosticMode,
  DiagnosticProgress,
  DiagnosticReport,
  DiagnosticSkill,
  DiagnosticStep,
  PlacementResult,
} from '@linguo/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { LearningPathsContext } from '@/features/learning-paths/LearningPathsProvider';
import { getSupabase } from '@/lib/supabase';
import { diagnosticErrorCode, diagnosticErrorMessage } from './error-map';
import {
  acceptPlacement,
  answerDiagnostic,
  diagnosticStatus,
  finishDiagnostic,
  skipDiagnosticSkill,
  startDiagnostic,
  type SkipReason,
} from './service';

export type DiagnosticRunStatus = 'loading' | 'intro' | 'question' | 'submitting' | 'finishing' | 'report' | 'error';

export interface DiagnosticRunOptions {
  /** Mode of a new attempt (a resumed attempt keeps its own). Default 'full'. */
  mode?: DiagnosticMode;
  /** Report screen: show the latest completed attempt's report even when a retake is already allowed. */
  preferReport?: boolean;
}

export interface DiagnosticRunApi {
  status: DiagnosticRunStatus;
  mode: DiagnosticMode | null;
  attemptId: string | null;
  /** The item waiting for an answer (kept while submitting and in the error state after a failed answer). */
  item: DiagnosticItem | null;
  progress: DiagnosticProgress | null;
  /** Vietnamese message: the error state, or a failed accept() while the report stays on screen. */
  error: string | null;
  /** An attempt is in progress on the server: start() resumes it at the pending item. */
  resumable: boolean;
  /** From diagnostic_status: when a new attempt is allowed (null: now). */
  retakeAfter: string | null;
  report: DiagnosticReport | null;
  /** Starts a new attempt or resumes the one in progress. */
  start: (mode?: DiagnosticMode) => void;
  /** `choice` null = "Tôi không biết". */
  answer: (choice: string | null) => void;
  skip: (skill: DiagnosticSkill, reason: SkipReason) => void;
  /** Back to the intro; answers are already on the server, start() resumes. */
  pause: () => void;
  /** Ends the test now (early finish) and loads the report. */
  finish: () => void;
  /** Applies the suggested level to the path; null when it failed (see `error`). */
  accept: () => Promise<PlacementResult | null>;
  /** Re-runs what failed: the same answer for the same item, the skip, finish, or the initial load. */
  retry: () => void;
}

type Failed =
  | { kind: 'load' }
  | { kind: 'start'; mode: DiagnosticMode }
  | { kind: 'resync' }
  | { kind: 'answer'; attemptId: string; itemId: string; choice: string | null }
  | { kind: 'skip'; attemptId: string; skill: DiagnosticSkill; reason: SkipReason }
  | { kind: 'finish'; attemptId: string };

interface RunState {
  status: DiagnosticRunStatus;
  mode: DiagnosticMode | null;
  attemptId: string | null;
  item: DiagnosticItem | null;
  progress: DiagnosticProgress | null;
  report: DiagnosticReport | null;
  error: string | null;
  resumable: boolean;
  retakeAfter: string | null;
  failed: Failed | null;
}

const initialState: RunState = {
  status: 'loading',
  mode: null,
  attemptId: null,
  item: null,
  progress: null,
  report: null,
  error: null,
  resumable: false,
  retakeAfter: null,
  failed: null,
};

type Action = { type: 'reset' } | { type: 'patch'; patch: Partial<RunState> };

function reducer(state: RunState, action: Action): RunState {
  return action.type === 'reset' ? initialState : { ...state, ...action.patch };
}

/** These mean the pending item moved on (e.g. an answer that timed out did land): fetch the current one. */
const RESYNC_CODES = new Set(['item_mismatch', 'already_answered']);

/**
 * Spec 4 §5: one diagnostic run for a learning path. Loads `diagnostic_status`, resumes an attempt in progress
 * (start_diagnostic returns the same pending item), sends each answer and moves to the next item the server picks,
 * then finishes and shows the report. Answers are never queued offline: the next item depends on the server, so a
 * failed answer shows the error state and retry() resends the same answer for the same item.
 */
export function useDiagnosticRun(pathId: string | null | undefined, options: DiagnosticRunOptions = {}): DiagnosticRunApi {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const client = getSupabase();
  const paths = useContext(LearningPathsContext);
  const reloadPaths = paths?.reload;
  const defaultMode = options.mode ?? 'full';
  const preferReport = options.preferReport ?? false;
  const [state, dispatch] = useReducer(reducer, initialState);
  const [loadAttempt, reload] = useReducer((n: number) => n + 1, 0);

  const latest = useRef({ state, client, pathId, defaultMode, preferReport, reloadPaths });
  useLayoutEffect(() => {
    latest.current = { state, client, pathId, defaultMode, preferReport, reloadPaths };
  });

  /** Bumped on every (re)load and pause: results of older requests must not touch the screen. */
  const sessionRef = useRef(0);
  /** A request is in flight (guards double taps before React re-renders). */
  const busy = useRef(false);
  const accepting = useRef(false);

  const patch = useCallback((p: Partial<RunState>) => dispatch({ type: 'patch', patch: p }), []);

  /** Runs `work` for the current session; returns false when a newer session took over meanwhile. */
  const guarded = useCallback(async (work: (same: () => boolean) => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    const session = sessionRef.current;
    try {
      await work(() => sessionRef.current === session);
    } finally {
      if (sessionRef.current === session) busy.current = false;
    }
  }, []);

  const fail = useCallback(
    (error: unknown, failed: Failed | null) => {
      const message = diagnosticErrorMessage(error, { retakeAfter: latest.current.state.retakeAfter });
      patch({ status: 'error', error: message, failed });
    },
    [patch],
  );

  const finishAttempt = useCallback(
    async (attemptId: string, same: () => boolean) => {
      const c = latest.current.client;
      if (!c) return fail(new Error('supabase_unavailable'), null);
      patch({ status: 'finishing', error: null, failed: null, attemptId });
      try {
        const report = await finishDiagnostic(c, attemptId);
        if (same()) {
          patch({ status: 'report', report, item: null, resumable: false, retakeAfter: report.retake_after, mode: report.mode });
        }
      } catch (error) {
        if (same()) fail(error, { kind: 'finish', attemptId });
      }
    },
    [fail, patch],
  );

  const applyStep = useCallback(
    async (step: DiagnosticStep, same: () => boolean) => {
      if (!same()) return;
      const base = { attemptId: step.attempt_id, mode: step.mode, progress: step.progress, error: null, failed: null, resumable: true };
      if (step.done || !step.item) {
        patch({ ...base, item: null });
        await finishAttempt(step.attempt_id, same);
        return;
      }
      patch({ ...base, status: 'question', item: step.item });
    },
    [finishAttempt, patch],
  );

  /** start_diagnostic: a new attempt, or the pending item of the one in progress. */
  const startOrResume = useCallback(
    async (mode: DiagnosticMode, same: () => boolean, failed: Failed) => {
      const { client: c, pathId: p } = latest.current;
      if (!c) return fail(new Error('supabase_unavailable'), null);
      if (!p) return fail({ message: 'path_not_found' }, null);
      patch({ status: 'loading', error: null, failed: null });
      try {
        const step = await startDiagnostic(c, p, mode);
        await applyStep(step, same);
      } catch (error) {
        if (same()) fail(error, failed);
      }
    },
    [applyStep, fail, patch],
  );

  const load = useCallback(
    async (same: () => boolean) => {
      const { client: c, pathId: p, preferReport: wantReport, defaultMode: mode } = latest.current;
      if (!c) return fail(new Error('supabase_unavailable'), null);
      if (!p) return fail({ message: 'path_not_found' }, null);
      dispatch({ type: 'reset' });
      try {
        const status = await diagnosticStatus(c, p);
        if (!same()) return;
        patch({ retakeAfter: status.can_start ? null : status.retake_after, resumable: status.status === 'in_progress' });
        if (status.status === 'in_progress') {
          // Reload → continue where the learner left off.
          await startOrResume(mode, same, { kind: 'resync' });
        } else if (status.status === 'completed' && status.attempt_id && (wantReport || !status.can_start)) {
          await finishAttempt(status.attempt_id, same);
        } else {
          patch({ status: 'intro' });
        }
      } catch (error) {
        if (same()) fail(error, { kind: 'load' });
      }
    },
    [fail, finishAttempt, patch, startOrResume],
  );

  // ---- loading -------------------------------------------------------------------------------------------
  useEffect(() => {
    sessionRef.current += 1;
    busy.current = false;
    if (!userId) return;
    void guarded(load);
  }, [userId, client, pathId, loadAttempt, guarded, load]);

  // ---- server errors on a step ---------------------------------------------------------------------------
  const stepFailed = useCallback(
    async (error: unknown, failed: Failed, same: () => boolean) => {
      if (!same()) return;
      const code = diagnosticErrorCode(error);
      if (code && RESYNC_CODES.has(code)) {
        await startOrResume(latest.current.state.mode ?? latest.current.defaultMode, same, { kind: 'resync' });
      } else if (code === 'attempt_not_active') {
        // Finished or abandoned elsewhere: start over from diagnostic_status.
        reload();
      } else {
        fail(error, failed);
      }
    },
    [fail, startOrResume],
  );

  const sendAnswer = useCallback(
    async (attemptId: string, itemId: string, choice: string | null, same: () => boolean) => {
      const c = latest.current.client;
      if (!c) return fail(new Error('supabase_unavailable'), null);
      patch({ status: 'submitting', error: null, failed: null });
      try {
        await applyStep(await answerDiagnostic(c, attemptId, itemId, choice), same);
      } catch (error) {
        await stepFailed(error, { kind: 'answer', attemptId, itemId, choice }, same);
      }
    },
    [applyStep, fail, patch, stepFailed],
  );

  const sendSkip = useCallback(
    async (attemptId: string, skill: DiagnosticSkill, reason: SkipReason, same: () => boolean) => {
      const c = latest.current.client;
      if (!c) return fail(new Error('supabase_unavailable'), null);
      patch({ status: 'submitting', error: null, failed: null });
      try {
        await applyStep(await skipDiagnosticSkill(c, attemptId, skill, reason), same);
      } catch (error) {
        await stepFailed(error, { kind: 'skip', attemptId, skill, reason }, same);
      }
    },
    [applyStep, fail, patch, stepFailed],
  );

  // ---- actions -------------------------------------------------------------------------------------------
  const start = useCallback(
    (mode?: DiagnosticMode) => {
      const { state: s, defaultMode: fallback } = latest.current;
      if (s.status !== 'intro' && s.status !== 'error') return;
      const chosen = mode ?? fallback;
      void guarded((same) => startOrResume(chosen, same, { kind: 'start', mode: chosen }));
    },
    [guarded, startOrResume],
  );

  const answer = useCallback(
    (choice: string | null) => {
      const s = latest.current.state;
      if (s.status !== 'question' || !s.item || !s.attemptId) return;
      const { attemptId } = s;
      const itemId = s.item.id;
      void guarded((same) => sendAnswer(attemptId, itemId, choice, same));
    },
    [guarded, sendAnswer],
  );

  const skip = useCallback(
    (skill: DiagnosticSkill, reason: SkipReason) => {
      const s = latest.current.state;
      if (s.status !== 'question' || !s.attemptId) return;
      const { attemptId } = s;
      void guarded((same) => sendSkip(attemptId, skill, reason, same));
    },
    [guarded, sendSkip],
  );

  const pause = useCallback(() => {
    const s = latest.current.state;
    if (s.status !== 'question' && s.status !== 'submitting' && s.status !== 'error') return;
    if (!s.attemptId) return;
    sessionRef.current += 1;
    busy.current = false;
    patch({ status: 'intro', item: null, error: null, failed: null, resumable: true });
  }, [patch]);

  const finish = useCallback(() => {
    const s = latest.current.state;
    if ((s.status !== 'question' && s.status !== 'error') || !s.attemptId) return;
    const { attemptId } = s;
    void guarded((same) => finishAttempt(attemptId, same));
  }, [finishAttempt, guarded]);

  const accept = useCallback(async (): Promise<PlacementResult | null> => {
    const { state: s, client: c } = latest.current;
    if (s.status !== 'report' || !s.report || accepting.current) return null;
    if (!c) {
      patch({ error: diagnosticErrorMessage(new Error('supabase_unavailable')) });
      return null;
    }
    accepting.current = true;
    const session = sessionRef.current;
    const attemptId = s.report.attempt_id;
    patch({ error: null });
    try {
      const result = await acceptPlacement(c, attemptId);
      if (sessionRef.current === session && result.outcome === 'applied') {
        const report = latest.current.state.report;
        if (report) patch({ report: { ...report, applied_at: new Date().toISOString(), current_level: result.new_level } });
        latest.current.reloadPaths?.();
      }
      return result;
    } catch (error) {
      if (sessionRef.current === session) patch({ error: diagnosticErrorMessage(error) });
      return null;
    } finally {
      accepting.current = false;
    }
  }, [patch]);

  const retry = useCallback(() => {
    const { state: s, defaultMode: mode } = latest.current;
    if (s.status !== 'error') return;
    const failed = s.failed;
    if (!failed || failed.kind === 'load') {
      reload();
      return;
    }
    void guarded((same) => {
      switch (failed.kind) {
        case 'start':
          return startOrResume(failed.mode, same, failed);
        case 'resync':
          return startOrResume(s.mode ?? mode, same, failed);
        case 'answer':
          return sendAnswer(failed.attemptId, failed.itemId, failed.choice, same);
        case 'skip':
          return sendSkip(failed.attemptId, failed.skill, failed.reason, same);
        case 'finish':
          return finishAttempt(failed.attemptId, same);
      }
    });
  }, [finishAttempt, guarded, sendAnswer, sendSkip, startOrResume]);

  return {
    status: state.status,
    mode: state.mode,
    attemptId: state.attemptId,
    item: state.item,
    progress: state.progress,
    error: state.error,
    resumable: state.resumable,
    retakeAfter: state.retakeAfter,
    report: state.report,
    start,
    answer,
    skip,
    pause,
    finish,
    accept,
    retry,
  };
}
