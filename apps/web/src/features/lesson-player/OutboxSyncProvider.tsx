import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CompleteResult } from '@linguo/shared';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthProvider';
import { PERSONAL_OUTBOX_CHANNEL, type PersonalOutboxResultHandler } from '@/features/personal-vocab/outbox';
import { REVIEW_OUTBOX_CHANNEL, type ReviewOutboxResultHandler } from '@/features/reviews/outbox';
import { getSupabase } from '@/lib/supabase';
import type { LessonDropInfo, LessonRunEvent } from './lesson-sync';
import {
  addSyncReport,
  dismissSyncReport,
  readSyncReports,
  SYNC_REPORT_CHANGE_EVENT,
  syncReportKey,
  syncReportMessage,
  type SyncReportEntry,
  type SyncReportKind,
} from './sync-report';
import { useOutboxChannelSync, useOutboxSync, type OutboxResultHandler } from './useOutboxSync';

interface ChannelSyncValue {
  /** Entries waiting in this outbox for the signed-in user. */
  pendingCount: number;
  /** Sends every queued entry now (ignoring backoff). */
  flush: () => Promise<void>;
  /** An entry already failed to send and is retried with backoff. */
  failing: boolean;
  /** A replay is running right now. */
  syncing: boolean;
  /** Entries older than 5 days (they are dropped after 7). */
  expiringCount: number;
}

export interface ReviewOutboxSyncValue extends ChannelSyncValue {
  /** Registers a handler for replayed grades (the review session on screen); returns the unsubscribe function. */
  subscribe: (handler: ReviewOutboxResultHandler) => () => void;
}

export interface PersonalOutboxSyncValue extends ChannelSyncValue {
  /** Registers a handler for replayed grades (the personal review on screen); returns the unsubscribe function. */
  subscribe: (handler: PersonalOutboxResultHandler) => () => void;
}

/** Everything the global sync status chip needs, aggregated over the four outboxes. */
export interface SyncStatus {
  pending: number;
  failing: boolean;
  syncing: boolean;
  expiring: number;
}

export interface OutboxSyncContextValue extends ChannelSyncValue {
  /** Registers a handler for replayed results (the lesson on screen); returns the unsubscribe function. */
  subscribe: (handler: OutboxResultHandler) => () => void;
  /**
   * Per run id: queued entries that must reach the server before the run can complete (its start and its answers).
   * `pendingByRun[runId] ?? 0` is what the lesson screen waits for, not the global `pendingCount`.
   */
  pendingByRun: Record<string, number>;
  /** Run ids that have a `complete_lesson` queued in the outbox. */
  completingRuns: string[];
  /** `complete_lesson` results received for replayed completions during this session, by run id. */
  completions: Record<string, CompleteResult>;
  /**
   * Run lifecycle events from the replay: started, remapped (the server already held an open run: the run id changed),
   * completed, complete_failed, dropped. Returns the unsubscribe function.
   */
  subscribeRunEvents: (handler: (event: LessonRunEvent) => void) => () => void;
  /** Spec 3: the review-grade outbox, replayed by the same provider. */
  reviews: ReviewOutboxSyncValue;
  /** The personal vocabulary grade outbox, replayed by the same provider. */
  personalVocab: PersonalOutboxSyncValue;
  /** Totals over all four outboxes (lesson answers + run start/completion, reviews, personal vocabulary). */
  status: SyncStatus;
  /** Replays every outbox now. */
  flushAll: () => Promise<void>;
  /** Work that was dropped for good (refused by the server or expired) and not yet dismissed, oldest first. */
  reports: SyncReportEntry[];
  dismissReport: (id: string) => void;
}

export const OutboxSyncContext = createContext<OutboxSyncContextValue | null>(null);

/** A set of result handlers fanned out from one sync hook. */
function useHandlers<H extends (...args: never[]) => void>() {
  const handlers = useRef(new Set<H>());
  const dispatch = useCallback((...args: Parameters<H>) => {
    for (const handler of handlers.current) handler(...args);
  }, []);
  const subscribe = useCallback((handler: H) => {
    handlers.current.add(handler);
    return () => {
      handlers.current.delete(handler);
    };
  }, []);
  const hasSubscribers = useCallback(() => handlers.current.size > 0, []);
  return { dispatch, subscribe, hasSubscribers };
}

/** The toast API when a ToastProvider is mounted above, else null (the provider also works without one). */
function useOptionalToast(): ReturnType<typeof useToast> | null {
  try {
    return useToast();
  } catch {
    return null;
  }
}

const TOAST_DEBOUNCE_MS = 400;

/**
 * Spec 2 §7.4 / spec 3 §6: replays the offline outboxes (lesson answers with run start/completion, review grades,
 * personal vocabulary grades) on every signed-in screen, not only inside a lesson or a review session, so queued work
 * reaches the server as soon as the app is open and online. Work the server refuses for good, or that expires unsent,
 * is recorded as a persisted sync report and announced once with a toast.
 */
export function OutboxSyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const client = getSupabase();
  const toast = useOptionalToast();
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  });
  const lesson = useHandlers<OutboxResultHandler>();
  const review = useHandlers<ReviewOutboxResultHandler>();
  const personal = useHandlers<PersonalOutboxResultHandler>();
  const runEvents = useHandlers<(event: LessonRunEvent) => void>();

  // ---- dropped work: persisted report + one toast ------------------------------------------------------------
  const [reports, setReports] = useState<{ userId: string | null; list: SyncReportEntry[] }>(() => ({
    userId,
    list: userId ? readSyncReports(userId) : [],
  }));
  const reportsFor = reports.userId === userId ? reports.list : null;
  const currentReports = useMemo(() => reportsFor ?? (userId ? readSyncReports(userId) : NO_REPORTS), [reportsFor, userId]);
  useEffect(() => {
    if (!userId) return;
    const refresh = () => setReports({ userId, list: readSyncReports(userId) });
    refresh();
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail;
      if (!detail || detail.key === syncReportKey(userId)) refresh();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === syncReportKey(userId)) refresh();
    };
    window.addEventListener(SYNC_REPORT_CHANGE_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(SYNC_REPORT_CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, [userId]);

  const pendingToast = useRef<{ timer: number | undefined; reports: SyncReportEntry[] }>({ timer: undefined, reports: [] });
  const noteDropped = useCallback(
    (kind: SyncReportKind, info: LessonDropInfo, screenHandles: boolean) => {
      if (!userId || info.count < 1) return;
      addSyncReport(userId, { kind, reason: info.reason, count: info.count, runId: info.runId });
      // A lesson/review screen that is listening already tells the learner about a refused answer.
      if (screenHandles && info.reason !== 'expired') return;
      const bucket = pendingToast.current;
      bucket.reports.push({ id: '', at: '', kind, reason: info.reason, count: info.count, runId: info.runId });
      window.clearTimeout(bucket.timer);
      bucket.timer = window.setTimeout(() => {
        const batch = bucket.reports;
        bucket.reports = [];
        if (batch.length === 0) return;
        const total = batch.reduce((sum, r) => sum + r.count, 0);
        const message =
          batch.length === 1 && batch[0]
            ? syncReportMessage(batch[0])
            : `${total} mục chưa đồng bộ được vì đã quá hạn hoặc nội dung đã thay đổi. Xem chi tiết ở trạng thái đồng bộ.`;
        toastRef.current?.show({ tone: 'error', message });
      }, TOAST_DEBOUNCE_MS);
    },
    [userId],
  );
  useEffect(() => {
    const bucket = pendingToast.current;
    return () => window.clearTimeout(bucket.timer);
  }, []);

  const lessonHas = lesson.hasSubscribers;
  const reviewHas = review.hasSubscribers;
  const personalHas = personal.hasSubscribers;
  const onLessonDropped = useCallback((info: LessonDropInfo) => noteDropped('lesson', info, lessonHas()), [noteDropped, lessonHas]);
  const onReviewDropped = useCallback((info: LessonDropInfo) => noteDropped('review', info, reviewHas()), [noteDropped, reviewHas]);
  const onPersonalDropped = useCallback((info: LessonDropInfo) => noteDropped('personal', info, personalHas()), [noteDropped, personalHas]);

  // ---- completions replayed this session ------------------------------------------------------------------
  const [completionState, setCompletionState] = useState<{ userId: string | null; byRun: Record<string, CompleteResult> }>({ userId, byRun: {} });
  const dispatchRunEvent = runEvents.dispatch;
  const completions = completionState.userId === userId ? completionState.byRun : NO_COMPLETIONS;
  const onRunEvent = useCallback(
    (event: LessonRunEvent) => {
      if (event.type === 'completed') {
        setCompletionState((prev) => ({ userId, byRun: { ...(prev.userId === userId ? prev.byRun : {}), [event.runId]: event.result } }));
      }
      dispatchRunEvent(event);
    },
    [userId, dispatchRunEvent],
  );

  const lessonSync = useOutboxSync(client, userId, lesson.dispatch, { onDropped: onLessonDropped, onRunEvent });
  const reviewSync = useOutboxChannelSync(REVIEW_OUTBOX_CHANNEL, client, userId, review.dispatch, { onDropped: onReviewDropped });
  const personalSync = useOutboxChannelSync(PERSONAL_OUTBOX_CHANNEL, client, userId, personal.dispatch, { onDropped: onPersonalDropped });

  const reviews = useMemo(
    () => ({
      pendingCount: reviewSync.pendingCount,
      flush: reviewSync.flush,
      failing: reviewSync.failing,
      syncing: reviewSync.syncing,
      expiringCount: reviewSync.expiringCount,
      subscribe: review.subscribe,
    }),
    [reviewSync.pendingCount, reviewSync.flush, reviewSync.failing, reviewSync.syncing, reviewSync.expiringCount, review.subscribe],
  );
  const personalVocab = useMemo(
    () => ({
      pendingCount: personalSync.pendingCount,
      flush: personalSync.flush,
      failing: personalSync.failing,
      syncing: personalSync.syncing,
      expiringCount: personalSync.expiringCount,
      subscribe: personal.subscribe,
    }),
    [personalSync.pendingCount, personalSync.flush, personalSync.failing, personalSync.syncing, personalSync.expiringCount, personal.subscribe],
  );

  const { flush: flushLesson, pendingCount: lessonPending, pendingByRun, completingRuns } = lessonSync;
  const { flush: flushReviews } = reviewSync;
  const { flush: flushPersonal } = personalSync;
  const flushAll = useCallback(async () => {
    await Promise.all([flushLesson(), flushReviews(), flushPersonal()]);
  }, [flushLesson, flushReviews, flushPersonal]);
  const dismissReport = useCallback(
    (id: string) => {
      if (userId) dismissSyncReport(userId, id);
    },
    [userId],
  );

  const pending = lessonSync.pendingCount + reviewSync.pendingCount + personalSync.pendingCount;
  const failing = lessonSync.failing || reviewSync.failing || personalSync.failing;
  const syncing = lessonSync.syncing || reviewSync.syncing || personalSync.syncing;
  const expiring = lessonSync.expiringCount + reviewSync.expiringCount + personalSync.expiringCount;
  const status = useMemo<SyncStatus>(() => ({ pending, failing, syncing, expiring }), [pending, failing, syncing, expiring]);

  const value = useMemo<OutboxSyncContextValue>(
    () => ({
      pendingCount: lessonPending,
      flush: flushLesson,
      failing: lessonSync.failing,
      syncing: lessonSync.syncing,
      expiringCount: lessonSync.expiringCount,
      subscribe: lesson.subscribe,
      pendingByRun,
      completingRuns,
      completions,
      subscribeRunEvents: runEvents.subscribe,
      reviews,
      personalVocab,
      status,
      flushAll,
      reports: currentReports,
      dismissReport,
    }),
    [lessonPending, flushLesson, lessonSync.failing, lessonSync.syncing, lessonSync.expiringCount, pendingByRun, completingRuns, lesson.subscribe, completions, runEvents.subscribe, reviews, personalVocab, status, flushAll, currentReports, dismissReport],
  );
  return <OutboxSyncContext.Provider value={value}>{children}</OutboxSyncContext.Provider>;
}

const NO_COMPLETIONS: Record<string, CompleteResult> = {};
const NO_REPORTS: SyncReportEntry[] = [];

export function useOutboxSyncContext(): OutboxSyncContextValue {
  const ctx = useContext(OutboxSyncContext);
  if (!ctx) throw new Error('useOutboxSyncContext must be used inside OutboxSyncProvider');
  return ctx;
}
