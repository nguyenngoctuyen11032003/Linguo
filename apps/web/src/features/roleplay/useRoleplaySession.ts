import { useCallback, useMemo, useRef, useState } from 'react';
import { AI_OUTPUT_SCHEMAS, findRoleplayScenario, type AiError, type AiRequestInput, type RoleplayScenario } from '@linguo/shared';
import { useAiTutor, type AiTutorStatus } from '@/features/ai-tutor/useAiTutor';
import {
  addLearnerMessage,
  applyReply,
  isOver,
  newSession,
  openingRequest,
  removeMessage,
  setMessageStatus,
  turnRequest,
  type RoleplaySession,
} from './session';
import { clearSession, loadSession, saveSession } from './storage';

export interface RoleplayApi {
  session: RoleplaySession | null;
  scenario: RoleplayScenario | null;
  /** Status of the turn in flight or of the last failed turn. */
  state: AiTutorStatus;
  error: AiError | null;
  /** The last answer was not a usable role-play turn (shown like a failed turn, with retry). */
  badAnswer: boolean;
  /** A turn (the opening line or a reply) is waiting for retry: nothing new can be sent until it goes through. */
  stalled: boolean;
  /** The learner message whose turn failed, if any. */
  failedMessage: { id: number; text: string } | null;
  start: (scenario: RoleplayScenario) => void;
  /** Sends a learner message; false when it was not sent (empty, in flight, over, or a turn is waiting for retry). */
  send: (text: string) => boolean;
  /** Sends the stalled turn again without adding the learner message a second time. */
  retry: () => void;
  /** Takes the failed message back out of the conversation so the learner can edit it; returns its text. */
  takeBackFailed: () => string | null;
  /** Drops the session and its saved copy. */
  discard: () => void;
  /** Removes the saved copy only (the recap keeps the session on screen). */
  forgetSaved: () => void;
}

interface Pending {
  request: AiRequestInput;
  learnerId: number | null;
}

/**
 * One role-play conversation: the turns live in React state (and this tab's sessionStorage), every turn is one
 * `roleplay_turn` request, a failed turn can be retried without duplicating the learner message, and a late answer
 * is dropped on unmount (useAiTutor).
 */
export function useRoleplaySession(userId: string | null, language: string | null, level: string | null): RoleplayApi {
  const ai = useAiTutor();
  const aiRun = ai.run;
  const aiReset = ai.reset;
  const [session, setSession] = useState<RoleplaySession | null>(() => (userId && language ? loadSession(userId, language) : null));
  const [badAnswer, setBadAnswer] = useState(false);
  const sessionRef = useRef(session);
  const pending = useRef<Pending | null>(null);
  const busy = useRef(false);

  const commit = useCallback(
    (next: RoleplaySession | null) => {
      sessionRef.current = next;
      setSession(next);
      if (!userId) return;
      if (next) saveSession(userId, next);
      else clearSession(userId);
    },
    [userId],
  );

  const run = useCallback(
    async (p: Pending) => {
      const current = sessionRef.current;
      if (!current || busy.current) return;
      const scenario = findRoleplayScenario(current.language, current.scenarioKey);
      if (!scenario) return;
      busy.current = true;
      pending.current = p;
      setBadAnswer(false);
      const outcome = await aiRun(p.request);
      busy.current = false;
      if (!outcome) return; // unmounted or reset: the answer is dropped
      const latest = sessionRef.current;
      if (!latest) return;
      const parsed = outcome.ok ? AI_OUTPUT_SCHEMAS.roleplay_turn.safeParse(outcome.data.data) : null;
      if (outcome.ok && parsed?.success) {
        pending.current = null;
        commit(applyReply(latest, scenario, parsed.data, outcome.data.response_id, p.learnerId));
        return;
      }
      if (outcome.ok) setBadAnswer(true);
      commit(p.learnerId !== null ? setMessageStatus(latest, p.learnerId, 'failed') : latest);
    },
    [aiRun, commit],
  );

  const start = useCallback(
    (scenario: RoleplayScenario) => {
      if (busy.current || !language || !level || scenario.language !== language) return;
      const next = newSession(scenario, level, Date.now());
      pending.current = null;
      commit(next);
      void run({ request: openingRequest(next), learnerId: null });
    },
    [commit, run, language, level],
  );

  const send = useCallback(
    (text: string): boolean => {
      const current = sessionRef.current;
      const message = text.trim();
      if (!current || !message || busy.current || pending.current || isOver(current)) return false;
      const request = turnRequest(current, message);
      const { session: next, id } = addLearnerMessage(current, message);
      commit(next);
      void run({ request, learnerId: id });
      return true;
    },
    [commit, run],
  );

  const retry = useCallback(() => {
    const p = pending.current;
    const current = sessionRef.current;
    if (!p || !current || busy.current) return;
    if (p.learnerId !== null) commit(setMessageStatus(current, p.learnerId, 'sending'));
    void run(p);
  }, [commit, run]);

  const takeBackFailed = useCallback((): string | null => {
    const current = sessionRef.current;
    const failed = current?.messages.find((m) => m.status === 'failed');
    if (!current || !failed || busy.current) return null;
    pending.current = null;
    setBadAnswer(false);
    aiReset();
    commit(removeMessage(current, failed.id));
    return failed.text;
  }, [aiReset, commit]);

  const discard = useCallback(() => {
    pending.current = null;
    busy.current = false;
    setBadAnswer(false);
    aiReset();
    commit(null);
  }, [aiReset, commit]);

  const forgetSaved = useCallback(() => {
    if (userId) clearSession(userId);
  }, [userId]);

  const scenario = useMemo(() => (session ? (findRoleplayScenario(session.language, session.scenarioKey) ?? null) : null), [session]);
  const failed = session?.messages.find((m) => m.status === 'failed');
  return {
    session,
    scenario,
    state: ai.state,
    error: ai.error,
    badAnswer,
    stalled: pending.current !== null && ai.state !== 'loading',
    failedMessage: failed ? { id: failed.id, text: failed.text } : null,
    start,
    send,
    retry,
    takeBackFailed,
    discard,
    forgetSaved,
  };
}
