import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from 'react';
import type { PersonalGradeResult, PersonalQueue, Rating, ReviewCard } from '@linguo/shared';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthProvider';
import { useOutboxSyncContext } from '@/features/lesson-player/OutboxSyncProvider';
import { getSupabase } from '@/lib/supabase';
import { useOnline } from '@/lib/useOnline';
import { isUnansweredError, personalVocabErrorMessage } from './error-map';
import { createPersonalOutbox, type PersonalGradeArgs, type PersonalOutboxOutcome } from './outbox';
import { getPersonalQueue, gradePersonalWord } from './service';

export type PersonalCardState = 'front' | 'back' | 'submitting';

export interface PersonalReviewApi {
  status: 'loading' | 'ready' | 'empty' | 'error' | 'finished';
  /** Vietnamese message when status is 'error'. */
  error: string | null;
  totals: PersonalQueue['totals'] | null;
  card: ReviewCard | null;
  /** 0-based position and the number of cards served in this session. */
  position: number;
  total: number;
  cardState: PersonalCardState;
  flip: () => void;
  grade: (rating: Rating) => Promise<void>;
  /** Words graded in this session and accepted by the server. */
  graded: PersonalGradeResult[];
  /** Words graded in this session whose grade still waits in the offline outbox. */
  queued: string[];
  /** Personal vocabulary grades waiting in the outbox (this session or an earlier one). */
  pendingCount: number;
  retry: () => void;
}

interface State {
  status: PersonalReviewApi['status'];
  error: string | null;
  cards: ReviewCard[];
  position: number;
  cardState: PersonalCardState;
  graded: PersonalGradeResult[];
  queued: string[];
  totals: PersonalQueue['totals'] | null;
}

type Action =
  | { type: 'loading' }
  | { type: 'loaded'; queue: PersonalQueue }
  | { type: 'failed'; error: string }
  | { type: 'flip' }
  | { type: 'submitting' }
  | { type: 'reverted' }
  | { type: 'graded'; result: PersonalGradeResult }
  /** The word was deleted or is no longer due: move on without a grade. */
  | { type: 'skipped' }
  /** The grade is in the outbox: move on, its result arrives later. */
  | { type: 'queued'; wordId: string }
  /** A queued grade reached the server. */
  | { type: 'synced'; wordId: string; result: PersonalGradeResult }
  /** A queued grade was dropped by the server. */
  | { type: 'dropped'; wordId: string };

const initial: State = { status: 'loading', error: null, cards: [], position: 0, cardState: 'front', graded: [], queued: [], totals: null };

function advance(state: State): State {
  const position = Math.min(state.position + 1, state.cards.length);
  return { ...state, position, cardState: 'front', status: position >= state.cards.length ? 'finished' : state.status };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'loading':
      return { ...initial };
    case 'loaded':
      return { ...initial, status: action.queue.cards.length === 0 ? 'empty' : 'ready', cards: action.queue.cards, totals: action.queue.totals };
    case 'failed':
      return { ...initial, status: 'error', error: action.error };
    case 'flip':
      return state.status === 'ready' && state.cardState === 'front' ? { ...state, cardState: 'back' } : state;
    case 'submitting':
      return { ...state, cardState: 'submitting' };
    case 'reverted':
      return { ...state, cardState: 'back' };
    case 'graded':
      return advance({ ...state, graded: [...state.graded, action.result] });
    case 'skipped':
      return advance(state);
    case 'queued':
      return advance({ ...state, queued: [...state.queued, action.wordId] });
    case 'synced':
      return {
        ...state,
        queued: state.queued.filter((id) => id !== action.wordId),
        graded: [...state.graded.filter((g) => g.word_id !== action.wordId), action.result],
      };
    case 'dropped':
      return { ...state, queued: state.queued.filter((id) => id !== action.wordId) };
  }
}

/**
 * A review session over one personal list (spec P2): loads the due words as flashcards, flips and grades them with
 * the shared FSRS scheduler on the server. A grade made offline or that gets no answer (timeout, 408/5xx) goes to the
 * personal outbox with its idempotency key and the session moves on; OutboxSyncProvider replays it FIFO once online.
 * While older grades still wait, new ones queue behind them so the server always sees them in order.
 */
export function usePersonalReview(listId: string | null, { limit }: { limit?: number } = {}): PersonalReviewApi {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const client = getSupabase();
  const online = useOnline();
  const toast = useToast();
  const { personalVocab } = useOutboxSyncContext();
  const [state, dispatch] = useReducer(reducer, initial);
  const [attempt, retry] = useReducer((n: number) => n + 1, 0);

  const latest = useRef({ state, client, online, userId, flush: personalVocab.flush });
  useLayoutEffect(() => {
    latest.current = { state, client, online, userId, flush: personalVocab.flush };
  });
  /** Bumped on every (re)load: work started for an older session must not touch the new one. */
  const session = useRef(0);
  /** Grades that could not be sent nor queued keep their key: pressing the rating again resends the same grade. */
  const keys = useRef(new Map<string, string>());
  /** Idempotency key → word id for grades this session queued in the outbox. */
  const queuedKeys = useRef(new Map<string, string>());
  const busy = useRef(false);

  useEffect(() => {
    session.current += 1;
    const mine = session.current;
    keys.current = new Map();
    queuedKeys.current = new Map();
    busy.current = false;
    if (!userId || !listId) return;
    if (!client) {
      dispatch({ type: 'failed', error: personalVocabErrorMessage(new Error('supabase_unavailable')) });
      return;
    }
    dispatch({ type: 'loading' });
    getPersonalQueue(client, listId, limit)
      .then((queue) => {
        if (session.current !== mine) return;
        // A word graded offline (any session) and still waiting must not be served again before its grade lands.
        const waiting = new Set(createPersonalOutbox(userId).list().map((e) => e.args.p_word_id));
        dispatch({ type: 'loaded', queue: waiting.size ? { ...queue, cards: queue.cards.filter((c) => !waiting.has(c.card_id)) } : queue });
      })
      .catch((error: unknown) => {
        if (session.current === mine) dispatch({ type: 'failed', error: personalVocabErrorMessage(error) });
      });
  }, [client, userId, listId, limit, attempt]);

  // ---- replayed grades from the personal outbox ------------------------------------------------------------
  const onOutboxResult = useCallback(
    (key: string, outcome: PersonalOutboxOutcome) => {
      const wordId = queuedKeys.current.get(key);
      queuedKeys.current.delete(key);
      if ('error' in outcome) {
        // The provider already dropped the entry; this screen is its only listener, so the learner hears it once.
        const code = outcome.error && typeof outcome.error === 'object' && 'message' in outcome.error ? String(outcome.error.message) : '';
        const gone = code === 'word_not_found' || code === 'word_not_due';
        toast.show({ tone: gone ? 'info' : 'error', message: personalVocabErrorMessage(outcome.error) });
        if (wordId !== undefined) dispatch({ type: 'dropped', wordId });
      } else if (wordId !== undefined) {
        dispatch({ type: 'synced', wordId, result: outcome.result });
      }
    },
    [toast],
  );
  const subscribe = personalVocab.subscribe;
  useEffect(() => subscribe(onOutboxResult), [subscribe, onOutboxResult]);

  const flip = useCallback(() => dispatch({ type: 'flip' }), []);

  const grade = useCallback(
    async (rating: Rating) => {
      const { state: current, client: c, online: isOnline, userId: uid, flush } = latest.current;
      const card = current.status === 'ready' ? current.cards[current.position] : undefined;
      if (!card || !uid || current.cardState !== 'back' || busy.current) return;
      busy.current = true;
      const mine = session.current;
      const same = () => session.current === mine;
      const wordId = card.card_id;
      const keyId = `${wordId}:${rating}`;
      let key = keys.current.get(keyId);
      if (!key) {
        key = crypto.randomUUID();
        keys.current.set(keyId, key);
      }
      const args: PersonalGradeArgs = { p_word_id: wordId, p_rating: rating, p_idempotency_key: key };
      const fail = (error: unknown, keepKey: boolean) => {
        if (!same()) return;
        if (!keepKey) keys.current.delete(keyId);
        dispatch({ type: 'reverted' });
        toast.show({ tone: 'error', message: personalVocabErrorMessage(error) });
      };
      /** False when the grade could not be stored (no storage, quota): the caller falls back to a plain error. */
      const queue = (): boolean => {
        // Registered before the write: the provider may replay it as soon as it lands in storage.
        if (same()) queuedKeys.current.set(args.p_idempotency_key, wordId);
        if (!createPersonalOutbox(uid).add({ args, queueIndex: current.position })) {
          queuedKeys.current.delete(args.p_idempotency_key);
          return false;
        }
        keys.current.delete(keyId);
        if (same()) dispatch({ type: 'queued', wordId });
        return true;
      };
      dispatch({ type: 'submitting' });
      try {
        if (!c) {
          fail(new Error('supabase_unavailable'), false);
          return;
        }
        if (!isOnline) {
          if (!queue()) fail(new Error('outbox_unavailable'), true);
          return;
        }
        // Older grades still waiting: queue behind them and flush, so the server sees every grade in order.
        if (createPersonalOutbox(uid).list().length > 0 && queue()) {
          void flush();
          return;
        }
        const result = await gradePersonalWord(c, { wordId, rating, idempotencyKey: key });
        if (!same()) return;
        keys.current.delete(keyId);
        dispatch({ type: 'graded', result });
      } catch (error) {
        if (!same()) return;
        const code = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
        if (code === 'word_not_found' || code === 'word_not_due') {
          keys.current.delete(keyId);
          toast.show({ tone: 'info', message: personalVocabErrorMessage(error) });
          dispatch({ type: 'skipped' });
        } else if (isUnansweredError(error)) {
          // No answer: resend later under the same idempotency key (or on the next press if storage is unavailable).
          if (!queue()) fail(error, true);
        } else {
          fail(error, false);
        }
      } finally {
        busy.current = false;
      }
    },
    [toast],
  );

  const ready = state.status === 'ready';
  const card = ready ? (state.cards[state.position] ?? null) : null;
  return {
    status: state.status,
    error: state.error,
    totals: state.totals,
    card,
    position: Math.min(state.position, state.cards.length),
    total: state.cards.length,
    cardState: card ? state.cardState : 'front',
    flip,
    grade,
    graded: state.graded,
    queued: state.queued,
    pendingCount: personalVocab.pendingCount,
    retry,
  };
}
