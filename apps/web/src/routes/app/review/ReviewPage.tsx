import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarCheck, CloudOff, Info } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import type { Rating } from '@linguo/shared';
import { Flashcard, RatingBar } from '@/components/flashcard';
import { Button, buttonClasses } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import type { Confidence } from '@/features/reviews/types';
import { useReviewSession } from '@/features/reviews/useReviewSession';
import { RecallConfidence } from './RecallConfidence';
import { hasMoreCards } from './more';
import { ReviewSummaryView } from './ReviewSummaryView';

const TITLE = 'Ôn tập';

/** Keys typed into a form control are never review shortcuts. */
function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('input, textarea, select, [contenteditable="true"]');
}

function Heading() {
  return <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">{TITLE}</h1>;
}

/** /app/on-tap: the daily flashcard review (spec 3 §6). Scheduling stays on the server; this screen only rates. */
export function ReviewPage() {
  const session = useReviewSession();
  const toast = useToast();
  const navigate = useNavigate();
  const { status, card, cardState, position, total, totals, pendingCount } = session;

  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [postponing, setPostponing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const shownAt = useRef(0);
  const flippedAt = useRef<number | null>(null);
  const rating = useRef(false);
  const cardHeadingRef = useRef<HTMLHeadingElement>(null);
  const summaryFocused = useRef(false);
  const cardKey = card ? `${card.card_id}:${position}` : null;
  const latestStatus = useRef(status);
  latestStatus.current = status;
  const liveCardKey = useRef(cardKey);
  liveCardKey.current = cardKey;

  // A new card: reset the per-card inputs, restart the response timer and move focus to the card heading so
  // screen readers announce it and Space/1–4 work without hunting for focus.
  useEffect(() => {
    setConfidence(null);
    shownAt.current = Date.now();
    flippedAt.current = null;
    if (cardKey) cardHeadingRef.current?.focus();
  }, [cardKey]);

  useEffect(() => {
    if (status !== 'finished') {
      summaryFocused.current = false;
      return;
    }
    if (summaryFocused.current) return;
    summaryFocused.current = true;
    document.getElementById('review-summary-title')?.focus();
  }, [status]);

  const front = cardState.status === 'front';
  const back = cardState.status === 'back';

  const flip = useCallback(() => {
    if (!front || flippedAt.current !== null) return;
    flippedAt.current = Date.now();
    session.flip();
  }, [front, session]);

  const rate = useCallback(
    async (value: Rating) => {
      // Rate a card once, even if a click and a key press land before the next render.
      if (!back || rating.current) return;
      rating.current = true;
      const ratedKey = liveCardKey.current;
      const answeredAt = flippedAt.current ?? Date.now();
      try {
        await session.grade(value, {
          confidence: card?.direction === 'recall' ? confidence : null,
          responseMs: Math.max(0, answeredAt - shownAt.current),
          hintCount: 0,
        });
        // The session moves on once the grade is saved or queued; a refused grade keeps the card on screen.
        if (liveCardKey.current !== ratedKey || latestStatus.current === 'finished') setReviewedCount((n) => n + 1);
      } finally {
        rating.current = false;
      }
    },
    [back, card, confidence, session],
  );

  const postpone = useCallback(
    async (all = false) => {
      if (postponing) return;
      setPostponing(true);
      try {
        // The session reports refusals (limit reached, offline) itself; the next card or the summary shows success.
        await session.postpone(all);
      } catch {
        toast.show({ tone: 'error', message: 'Chưa hoãn được. Kiểm tra mạng rồi thử lại.' });
      } finally {
        setPostponing(false);
      }
    },
    [postponing, session, toast],
  );

  async function more() {
    setLoadingMore(true);
    try {
      await session.loadMore();
    } finally {
      setLoadingMore(false);
    }
  }

  // Space/Enter (flip) and 1–4 (rate) live in Flashcard and RatingBar; the page only adds P (postpone).
  const hasCard = status === 'ready' && !!card;
  useEffect(() => {
    if (!hasCard) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'p' && event.key !== 'P') return;
      if (event.repeat || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isTypingTarget(event.target)) return;
      event.preventDefault();
      void postpone();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasCard, postpone]);

  if (status === 'loading') {
    return (
      <div className="space-y-6">
        <Heading />
        <div role="status" className="space-y-4">
          <span className="sr-only">Đang tải thẻ ôn…</span>
          <Skeleton className="block h-5 w-32" />
          <Skeleton className="block h-64 w-full rounded-3xl" />
          <Skeleton className="block h-12 w-full rounded-full" />
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="space-y-6">
        <Heading />
        <ErrorState title="Không tải được thẻ ôn" description={session.error ?? undefined} onRetry={session.retry} />
      </div>
    );
  }

  if (status === 'empty') {
    return (
      <div className="space-y-6">
        <Heading />
        <EmptyState
          icon={CalendarCheck}
          title="Hôm nay không có thẻ cần ôn"
          description="Học bài mới để có thêm thẻ, hoặc quay lại vào ngày mai."
          action={
            <div className="flex w-full max-w-xs flex-col gap-3">
              <Link to="/app/hoc-tap" className={buttonClasses('accent', 'lg', true)}>
                Học bài mới
              </Link>
              {hasMoreCards(totals) && (
                <Button variant="ghost" size="lg" block loading={loadingMore} onClick={() => void more()}>
                  +10 thẻ nữa
                </Button>
              )}
            </div>
          }
        />
      </div>
    );
  }

  if (status === 'finished' || !card) {
    return (
      <div className="space-y-6">
        <Heading />
        <ReviewSummaryView
          reviewedCount={reviewedCount}
          graded={session.graded}
          pendingCount={pendingCount}
          summary={session.summary}
          totals={totals}
          loadingMore={loadingMore}
          onMore={() => void more()}
          onDone={() => navigate('/app')}
        />
      </div>
    );
  }

  const flipped = cardState.status !== 'front';
  const showConfidence = card.direction === 'recall' && front;
  const counter = `Thẻ ${Math.min(position + 1, Math.max(total, 1))}/${Math.max(total, 1)}`;

  return (
    <div className="space-y-5">
      <Heading />

      {totals?.recovery_mode && (
        <p role="note" className="flex gap-2 rounded-2xl bg-primary/10 px-4 py-3 text-[15px]">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            Bạn có nhiều thẻ tồn đọng. Mình chia đều {totals.backlog_remaining} thẻ cho mấy ngày tới, hôm nay chỉ ôn những
            thẻ cần nhất.
          </span>
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 ref={cardHeadingRef} tabIndex={-1} className="text-sm font-semibold text-muted focus:outline-none">
          {counter}
        </h2>
        {pendingCount > 0 && (
          <span
            role="status"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-solid px-3 py-1 text-sm font-medium"
          >
            <CloudOff aria-hidden className="size-4 shrink-0 text-muted" />
            Đang chờ đồng bộ {pendingCount} thẻ
          </span>
        )}
      </div>
      <div
        role="progressbar"
        aria-label="Tiến độ phiên ôn"
        aria-valuemin={0}
        aria-valuemax={Math.max(total, 1)}
        aria-valuenow={Math.min(position, total)}
        className="h-2 overflow-hidden rounded-full bg-text/10"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${total ? (Math.min(position, total) / total) * 100 : 0}%` }} />
      </div>

      <Flashcard key={cardKey} card={card} flipped={flipped} onFlip={flip} disabled={cardState.status === 'submitting'} />

      {showConfidence && <RecallConfidence value={confidence} onChange={setConfidence} />}

      <RatingBar
        previews={card.previews}
        revealed={flipped}
        submitting={cardState.status === 'submitting'}
        onRate={(value) => void rate(value)}
      />

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" disabled={postponing} onClick={() => void postpone()}>
            Hoãn sang mai
          </Button>
          {total - position > 1 && (
            <Button variant="ghost" disabled={postponing} onClick={() => void postpone(true)}>
              Hoãn tất cả
            </Button>
          )}
        </div>
        <p className="hidden text-sm text-muted sm:block">Phím tắt: Space lật · 1–4 chấm · P hoãn</p>
      </div>
    </div>
  );
}
