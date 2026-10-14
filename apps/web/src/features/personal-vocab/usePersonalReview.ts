import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from 'react';
import type { PersonalGradeResult, PersonalQueue, Rating, ReviewCard } from '@linguo/shared';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthProvider';
import { getSupabase } from '@/lib/supabase';
import { isUnansweredError, personalVocabErrorMessage } from './error-map';
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
  /** Words graded in this session. */
  graded: PersonalGradeResult[];
  retry: () => void;
}

interface State {
  status: PersonalReviewApi['status'];
  error: string | null;
  cards: ReviewCard[];
  position: number;
  cardState: PersonalCardState;
  graded: PersonalGradeResult[];
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
  | { type: 'skipped' };

const initial: State = { status: 'loading', error: null, cards: [], position: 0, cardState: 'front', graded: [], totals: null };

function advance(state: State, graded: PersonalGradeResult[]): State {
  const position = Math.min(state.position + 1, state.cards.length);
  return { ...state, graded, position, cardState: 'front', status: position >= state.cards.length ? 'finished' : state.status };
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
      return advance(state, [...state.graded, action.result]);
    case 'skipped':
      return advance(state, state.graded);
  }
}

/**
 * A review session over one personal list (spec P2): loads the due words as flashcards, flips and grades them with
 * the shared FSRS scheduler on the server. A grade that gets no answer (offline, timeout) keeps its idempotency key,
 * so pressing the rating again resends the same grade instead of grading twice.
 */
export function usePersonalReview(listId: string | null, { limit }: { limit?: number } = {}): PersonalReviewApi {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const client = getSupabase();
  const toast = useToast();
  const [state, dispatch] = useReducer(reducer, initial);
  const [attempt, retry] = useReducer((n: number) => n + 1, 0);

  const latest = useRef({ state, client });
  useLayoutEffect(() => {
    latest.current = { state, client };
  });
  /** Bumped on every (re)load: work started for an older session must not touch the new one. */
  const session = useRef(0);
  const keys = useRef(new Map<string, string>());
  const busy = useRef(false);

  useEffect(() => {
    session.current += 1;
    const mine = session.current;
    keys.current = new Map();
    busy.current = false;
    if (!userId || !listId) return;
    if (!client) {
      dispatch({ type: 'failed', error: personalVocabErrorMessage(new Error('supabase_unavailable')) });
      return;
    }
    dispatch({ type: 'loading' });
    getPersonalQueue(client, listId, limit)
      .then((queue) => {
        if (session.current === mine) dispatch({ type: 'loaded', queue });
      })
      .catch((error: unknown) => {
        if (session.current === mine) dispatch({ type: 'failed', error: personalVocabErrorMessage(error) });
      });
  }, [client, userId, listId, limit, attempt]);

  const flip = useCallback(() => dispatch({ type: 'flip' }), []);

  const grade = useCallback(
    async (rating: Rating) => {
      const { state: current, client: c } = latest.current;
      const card = current.status === 'ready' ? current.cards[current.position] : undefined;
      if (!card || current.cardState !== 'back' || busy.current) return;
      busy.current = true;
      const mine = session.current;
      const wordId = card.card_id;
      const keyId = `${wordId}:${rating}`;
      let key = keys.current.get(keyId);
      if (!key) {
        key = crypto.randomUUID();
        keys.current.set(keyId, key);
      }
      dispatch({ type: 'submitting' });
      try {
        if (!c) throw new Error('supabase_unavailable');
        const result = await gradePersonalWord(c, { wordId, rating, idempotencyKey: key });
        if (session.current !== mine) return;
        keys.current.delete(keyId);
        dispatch({ type: 'graded', result });
      } catch (error) {
        if (session.current !== mine) return;
        const code = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
        if (code === 'word_not_found' || code === 'word_not_due') {
          keys.current.delete(keyId);
          toast.show({ tone: 'info', message: personalVocabErrorMessage(error) });
          dispatch({ type: 'skipped' });
        } else {
          // Unanswered requests keep their key: the next press replays the same grade.
          if (!isUnansweredError(error)) keys.current.delete(keyId);
          dispatch({ type: 'reverted' });
          toast.show({ tone: 'error', message: personalVocabErrorMessage(error) });
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
    retry,
  };
}
