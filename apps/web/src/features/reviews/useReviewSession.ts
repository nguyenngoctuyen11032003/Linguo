import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from 'react';
import type { Rating, ReviewCard, ReviewGradeArgs, ReviewGradeResult, ReviewQueue, ReviewSummary } from '@linguo/shared';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthProvider';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { useOutboxSyncContext } from '@/features/lesson-player/OutboxSyncProvider';
import { getSupabase } from '@/lib/supabase';
import { useOnline } from '@/lib/useOnline';
import { isUnansweredError, reviewErrorMessage } from './error-map';
import { createReviewOutbox, type ReviewOutboxOutcome } from './outbox';
import { dropCardFromReviewQueueCache, readReviewQueueCache } from './queueCache';
import { getReviewQueue, getReviewSummary, gradeReview, postponeReviews, REVIEW_EXTRA_LIMIT, REVIEW_QUEUE_LIMIT } from './service';
import type { CardUiState, GradeMeta, ReviewSessionApi } from './types';

/** Postponing and extra cards are decided by the server, so they wait for a connection. */
const OFFLINE_NEEDS_NETWORK = 'Cần có mạng để làm việc này. Thẻ đang ôn vẫn được chấm và lưu để gửi sau.';

type Status = ReviewSessionApi['status'];

interface SessionState {
  status: Status;
  error: string | null;
  cards: ReviewCard[];
  position: number;
  cardStates: Record<string, CardUiState>;
  graded: ReviewGradeResult[];
  /** Cards whose queued grade the server later dropped (and that have no accepted grade since). */
  syncFailed: string[];
  totals: ReviewQueue['totals'] | null;
  summary: ReviewSummary | null;
  /** The queue is the copy saved on this device (the server could not be reached). */
  fromCache: boolean;
}

type Action =
  | { type: 'loading' }
  | { type: 'loaded'; cards: ReviewCard[]; totals: ReviewQueue['totals']; fromCache?: boolean }
  | { type: 'failed'; error: string }
  | { type: 'flip' }
  | { type: 'submitting'; cardId: string }
  /** The grade is in the outbox: move on, its result arrives later. */
  | { type: 'pending'; cardId: string }
  | { type: 'graded'; cardId: string; result: ReviewGradeResult; advance: boolean }
  /** The grade was refused (or could not be queued): the card is answerable again. */
  | { type: 'reverted'; cardId: string }
  /** A queued grade was dropped by the server. */
  | { type: 'syncFailed'; cardId: string }
  | { type: 'postponed'; cardId: string }
  | { type: 'postponedAll' }
  | { type: 'appended'; cards: ReviewCard[]; totals: ReviewQueue['totals'] }
  | { type: 'summary'; summary: ReviewSummary | null };

const FRONT: CardUiState = { status: 'front' };

const initialState: SessionState = {
  status: 'loading',
  error: null,
  cards: [],
  position: 0,
  cardStates: {},
  graded: [],
  syncFailed: [],
  totals: null,
  summary: null,
  fromCache: false,
};

function advance(state: SessionState): SessionState {
  const position = Math.min(state.position + 1, state.cards.length);
  return { ...state, position, status: position >= state.cards.length ? 'finished' : state.status };
}

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case 'loading':
      return { ...initialState };
    case 'loaded':
      return {
        ...initialState,
        status: action.cards.length === 0 ? 'empty' : 'ready',
        cards: action.cards,
        totals: action.totals,
        fromCache: action.fromCache ?? false,
      };
    case 'failed':
      return { ...initialState, status: 'error', error: action.error };
    case 'flip': {
      const card = state.status === 'ready' ? state.cards[state.position] : undefined;
      if (!card || (state.cardStates[card.card_id] ?? FRONT).status !== 'front') return state;
      return { ...state, cardStates: { ...state.cardStates, [card.card_id]: { status: 'back' } } };
    }
    case 'submitting':
      return { ...state, cardStates: { ...state.cardStates, [action.cardId]: { status: 'submitting' } } };
    case 'pending': {
      const next = { ...state, cardStates: { ...state.cardStates, [action.cardId]: { status: 'pending_sync' as const } } };
      return state.cards[state.position]?.card_id === action.cardId ? advance(next) : next;
    }
    case 'graded': {
      const graded = [...state.graded.filter((g) => g.card_id !== action.cardId), action.result];
      const next = {
        ...state,
        graded,
        syncFailed: state.syncFailed.filter((id) => id !== action.cardId),
        cardStates: { ...state.cardStates, [action.cardId]: { status: 'graded' as const, result: action.result } },
      };
      return action.advance && state.cards[state.position]?.card_id === action.cardId ? advance(next) : next;
    }
    case 'reverted':
      return { ...state, cardStates: { ...state.cardStates, [action.cardId]: { status: 'back' } } };
    case 'syncFailed': {
      const cardStates = { ...state.cardStates };
      delete cardStates[action.cardId];
      const syncFailed = state.syncFailed.includes(action.cardId) ? state.syncFailed : [...state.syncFailed, action.cardId];
      return { ...state, cardStates, syncFailed };
    }
    case 'postponed': {
      const index = state.cards.findIndex((c) => c.card_id === action.cardId);
      if (index < state.position || index === -1) return state;
      const cards = state.cards.filter((_, i) => i !== index);
      return { ...state, cards, status: state.position >= cards.length ? 'finished' : state.status };
    }
    case 'postponedAll': {
      const cards = state.cards.slice(0, state.position);
      return { ...state, cards, position: cards.length, status: 'finished' };
    }
    case 'appended': {
      const cards = [...state.cards, ...action.cards];
      const more = action.cards.length > 0;
      return {
        ...state,
        cards,
        totals: action.totals,
        status: more ? 'ready' : state.status,
        summary: more ? null : state.summary,
      };
    }
    case 'summary':
      return { ...state, summary: action.summary };
  }
}

/** Cards graded offline (any session) and still waiting: never serve them again before their grade lands. */
function queuedCardIds(userId: string): Set<string> {
  return new Set(
    createReviewOutbox(userId)
      .list()
      .map((e) => e.args.p_card_id),
  );
}

/**
 * Spec 3 §6: a review session for the current learning path. Loads the queue, flips and grades cards (each grade
 * has its own idempotency key; offline or unanswered grades go to the review outbox and the session moves on),
 * postpones, serves "+10 thẻ nữa" and loads the summary after the last card.
 *
 * `limit` caps the batch (spec 6: a review activity of a study session takes at most its review_limit cards; the
 * server serves at most 100 per call). Default: REVIEW_QUEUE_LIMIT.
 */
export function useReviewSession({ limit }: { limit?: number } = {}): ReviewSessionApi {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { currentId: pathId, status: pathsStatus } = useLearningPaths();
  const waitingForPath = !pathId && pathsStatus === 'loading';
  const client = getSupabase();
  const online = useOnline();
  const toast = useToast();
  const { reviews } = useOutboxSyncContext();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [loadAttempt, retry] = useReducer((n: number) => n + 1, 0);

  const latest = useRef({ state, client, online, pathId, userId });
  useLayoutEffect(() => {
    latest.current = { state, client, online, pathId, userId };
  });

  /** Bumped on every (re)load: work started for an older session must not touch the new one. */
  const sessionRef = useRef(0);
  /** Idempotency key → card id for grades this session queued in the outbox. */
  const queuedKeys = useRef(new Map<string, string>());
  /** Cards with a grade in flight (guards double submits before React re-renders). */
  const busyCards = useRef(new Set<string>());
  const postponing = useRef(false);
  const loadingMore = useRef(false);

  // ---- loading -------------------------------------------------------------------------------------------
  useEffect(() => {
    sessionRef.current += 1;
    const session = sessionRef.current;
    queuedKeys.current = new Map();
    busyCards.current = new Set();
    if (!userId) return;
    if (!client) {
      dispatch({ type: 'failed', error: reviewErrorMessage(new Error('supabase_unavailable')) });
      return;
    }
    if (!pathId) {
      if (waitingForPath) dispatch({ type: 'loading' });
      else dispatch({ type: 'failed', error: reviewErrorMessage({ message: 'path_not_found' }) });
      return;
    }
    dispatch({ type: 'loading' });
    /** The saved queue (Home prefetches up to 100 cards): cards graded on this device are never in it, those still waiting in the outbox are filtered here. */
    const fromCache = (): boolean => {
      const cached = readReviewQueueCache(userId, pathId);
      if (!cached) return false;
      const queued = queuedCardIds(userId);
      const cards = cached.data.cards.filter((c) => !queued.has(c.card_id)).slice(0, limit ?? REVIEW_QUEUE_LIMIT);
      dispatch({ type: 'loaded', cards, totals: cached.data.totals, fromCache: true });
      return true;
    };
    // Offline with a saved queue: no request that can only fail (or hang until the timeout).
    if (navigator.onLine === false && fromCache()) return;
    getReviewQueue(client, pathId, limit ? { limit } : {})
      .then((queue) => {
        if (sessionRef.current !== session) return;
        const queued = queuedCardIds(userId);
        dispatch({ type: 'loaded', cards: queue.cards.filter((c) => !queued.has(c.card_id)), totals: queue.totals });
      })
      .catch((error: unknown) => {
        if (sessionRef.current !== session) return;
        if (isUnansweredError(error) && fromCache()) return;
        dispatch({ type: 'failed', error: reviewErrorMessage(error) });
      });
  }, [client, userId, pathId, waitingForPath, loadAttempt, limit]);

  // ---- summary (after the last card, or when there was nothing to review) ---------------------------------
  const summaryRequest = useRef(0);
  const refreshSummary = useCallback(() => {
    const { client: c, pathId: p } = latest.current;
    if (!c || !p) return;
    const session = sessionRef.current;
    summaryRequest.current += 1;
    const request = summaryRequest.current;
    getReviewSummary(c, p)
      .then((summary) => {
        if (sessionRef.current === session && summaryRequest.current === request) dispatch({ type: 'summary', summary });
      })
      .catch(() => {
        // Best effort: the summary screen still shows what this session graded.
      });
  }, []);

  const done = state.status === 'finished' || state.status === 'empty';
  const needsSummary = done && state.summary === null;
  useEffect(() => {
    if (needsSummary) refreshSummary();
  }, [needsSummary, refreshSummary]);

  // ---- replayed grades from the review outbox --------------------------------------------------------------
  const onOutboxResult = useCallback(
    (key: string, outcome: ReviewOutboxOutcome) => {
      const cardId = queuedKeys.current.get(key);
      if (cardId === undefined) return;
      queuedKeys.current.delete(key);
      if ('result' in outcome) {
        dispatch({ type: 'graded', cardId, result: outcome.result, advance: false });
      } else {
        dispatch({ type: 'syncFailed', cardId });
        toast.show({ tone: 'error', message: reviewErrorMessage(outcome.error) });
      }
      const { status } = latest.current.state;
      if (status === 'finished' || status === 'empty') refreshSummary();
    },
    [toast, refreshSummary],
  );
  const subscribe = reviews.subscribe;
  useEffect(() => subscribe(onOutboxResult), [subscribe, onOutboxResult]);

  // ---- actions -------------------------------------------------------------------------------------------
  const flip = useCallback(() => dispatch({ type: 'flip' }), []);

  const grade = useCallback(
    async (rating: Rating, meta: GradeMeta) => {
      const { state: current, client: c, online: isOnline, userId: uid, pathId: pathIdAtGrade } = latest.current;
      const card = current.status === 'ready' ? current.cards[current.position] : undefined;
      if (!card || !uid) return;
      const cardState = current.cardStates[card.card_id] ?? FRONT;
      if (busyCards.current.has(card.card_id) || (cardState.status !== 'front' && cardState.status !== 'back')) return;
      busyCards.current.add(card.card_id);
      const session = sessionRef.current;
      const same = () => sessionRef.current === session;
      const position = current.position;
      const args: ReviewGradeArgs = {
        p_card_id: card.card_id,
        p_rating: rating,
        p_confidence: meta.confidence,
        p_response_ms: Math.max(0, Math.round(meta.responseMs)),
        p_hint_count: Math.max(0, Math.round(meta.hintCount)),
        p_idempotency_key: crypto.randomUUID(),
        p_client_at: new Date().toISOString(),
      };
      const fail = (error: unknown) => {
        if (!same()) return;
        dispatch({ type: 'reverted', cardId: card.card_id });
        toast.show({ tone: 'error', message: reviewErrorMessage(error) });
      };
      const queueOffline = () => {
        // Registered before the write: the provider may replay it as soon as it lands in storage. A grade for an
        // older session is still queued (it must reach the server) but its result no longer belongs on screen.
        if (same()) queuedKeys.current.set(args.p_idempotency_key, card.card_id);
        if (!createReviewOutbox(uid).add({ args, queueIndex: position })) {
          queuedKeys.current.delete(args.p_idempotency_key);
          fail(new Error('outbox_unavailable'));
          return;
        }
        dropCardFromReviewQueueCache(uid, pathIdAtGrade, card.card_id);
        if (same()) dispatch({ type: 'pending', cardId: card.card_id });
      };
      dispatch({ type: 'submitting', cardId: card.card_id });
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
          const result = await gradeReview(c, args);
          dropCardFromReviewQueueCache(uid, pathIdAtGrade, card.card_id);
          if (same()) dispatch({ type: 'graded', cardId: card.card_id, result, advance: true });
        } catch (error) {
          // Timed out or failed before grading: resend later under the same idempotency key.
          if (isUnansweredError(error)) queueOffline();
          else fail(error);
        }
      } finally {
        busyCards.current.delete(card.card_id);
      }
    },
    [toast],
  );

  const postpone = useCallback(
    async (all = false) => {
      const { state: current, client: c, pathId: p, userId: uid, online: isOnline } = latest.current;
      const card = current.status === 'ready' ? current.cards[current.position] : undefined;
      if (!card || postponing.current) return;
      if (!isOnline) {
        toast.show({ tone: 'info', message: OFFLINE_NEEDS_NETWORK });
        return;
      }
      if (!c || !p) {
        toast.show({ tone: 'error', message: reviewErrorMessage(new Error('supabase_unavailable')) });
        return;
      }
      const cardState = current.cardStates[card.card_id] ?? FRONT;
      if (!all && cardState.status !== 'front' && cardState.status !== 'back') return;
      postponing.current = true;
      const session = sessionRef.current;
      try {
        // "Hoãn tất cả" names the cards left in this session, so it sends exactly those: a null list would also move
        // due cards this session never served (a study session takes only its review_limit) and cards whose
        // grade is still waiting in the outbox.
        const ids = all ? current.cards.slice(current.position).map((x) => x.card_id) : [card.card_id];
        const result = await postponeReviews(c, p, ids, crypto.randomUUID());
        if (uid && result.postponed > 0) for (const id of ids) dropCardFromReviewQueueCache(uid, p, id);
        if (sessionRef.current !== session) return;
        if (all) {
          dispatch({ type: 'postponedAll' });
          if (result.skipped > 0) {
            toast.show({ tone: 'info', message: `${result.skipped} thẻ đã được hoãn quá nhiều lần nên vẫn cần ôn hôm nay.` });
          }
        } else if (result.postponed > 0) {
          dispatch({ type: 'postponed', cardId: card.card_id });
        } else {
          toast.show({ tone: 'info', message: reviewErrorMessage({ message: 'postpone_limit' }) });
        }
      } catch (error) {
        if (sessionRef.current === session) toast.show({ tone: 'error', message: reviewErrorMessage(error) });
      } finally {
        postponing.current = false;
      }
    },
    [toast],
  );

  const loadMore = useCallback(async () => {
    const { state: current, client: c, pathId: p, userId: uid, online: isOnline } = latest.current;
    if (!c || !p || !uid || loadingMore.current) return;
    if (!isOnline) {
      toast.show({ tone: 'info', message: OFFLINE_NEEDS_NETWORK });
      return;
    }
    if (current.status === 'loading' || current.status === 'error') return;
    loadingMore.current = true;
    const session = sessionRef.current;
    try {
      const queue = await getReviewQueue(c, p, { limit: REVIEW_EXTRA_LIMIT, extra: true });
      if (sessionRef.current !== session) return;
      const known = new Set([...latest.current.state.cards.map((x) => x.card_id), ...queuedCardIds(uid)]);
      const fresh = queue.cards.filter((x) => !known.has(x.card_id));
      dispatch({ type: 'appended', cards: fresh, totals: queue.totals });
      if (fresh.length === 0) toast.show({ tone: 'info', message: 'Không còn thẻ nào để ôn thêm hôm nay.' });
    } catch (error) {
      if (sessionRef.current === session) toast.show({ tone: 'error', message: reviewErrorMessage(error) });
    } finally {
      loadingMore.current = false;
    }
  }, [toast]);

  const ready = state.status === 'ready';
  const card = ready ? (state.cards[state.position] ?? null) : null;

  return {
    status: state.status,
    error: state.error,
    totals: state.totals,
    card,
    position: Math.min(state.position, state.cards.length),
    total: state.cards.length,
    cardState: card ? (state.cardStates[card.card_id] ?? FRONT) : FRONT,
    flip,
    grade,
    postpone,
    graded: state.graded,
    syncFailed: state.syncFailed,
    pendingCount: reviews.pendingCount,
    summary: state.summary,
    fromCache: state.fromCache,
    loadMore,
    retry,
  };
}
