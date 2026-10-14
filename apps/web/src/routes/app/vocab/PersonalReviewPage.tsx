import { useCallback, useEffect, useRef } from 'react';
import { ArrowLeft, CalendarCheck, PartyPopper } from 'lucide-react';
import { Link, useParams } from 'react-router';
import type { Rating } from '@linguo/shared';
import { Flashcard, RatingBar } from '@/components/flashcard';
import { Button, buttonClasses } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { SolidCard } from '@/components/ui/SolidCard';
import { usePersonalLists } from '@/features/personal-vocab/usePersonalLists';
import { usePersonalReview } from '@/features/personal-vocab/usePersonalReview';

/** /app/tu-vung-cua-toi/:listId/on-tap: flashcard review of one personal list (scheduling stays on the server). */
export function PersonalReviewPage() {
  const { listId = null } = useParams();
  const session = usePersonalReview(listId);
  const lists = usePersonalLists();
  const list = lists.lists.find((l) => l.id === listId) ?? null;
  const { status, card, cardState, position, total, graded } = session;
  const cardHeadingRef = useRef<HTMLHeadingElement>(null);
  const summaryRef = useRef<HTMLHeadingElement>(null);
  const cardKey = card ? `${card.card_id}:${position}` : null;
  const listUrl = listId ? `/app/tu-vung-cua-toi/${listId}` : '/app/tu-vung-cua-toi';

  useEffect(() => {
    if (cardKey) cardHeadingRef.current?.focus();
  }, [cardKey]);
  useEffect(() => {
    if (status === 'finished') summaryRef.current?.focus();
  }, [status]);

  const { flip: flipCard, grade } = session;
  const flip = useCallback(() => flipCard(), [flipCard]);
  const rate = useCallback((value: Rating) => void grade(value), [grade]);

  const heading = (
    <div className="space-y-1">
      <Link to={listUrl} className="inline-flex min-h-11 items-center gap-1.5 text-[15px] font-medium text-muted hover:text-text">
        <ArrowLeft aria-hidden className="size-4" />
        {list ? list.name : 'Danh sách của tôi'}
      </Link>
      <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">Ôn từ vựng của tôi</h1>
    </div>
  );

  if (status === 'loading') {
    return (
      <div className="space-y-6">
        {heading}
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
        {heading}
        <ErrorState title="Không tải được thẻ ôn" description={session.error ?? undefined} onRetry={session.retry} />
      </div>
    );
  }

  if (status === 'empty') {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          icon={CalendarCheck}
          title="Chưa có từ nào cần ôn lúc này"
          description="Bạn đã ôn xong những từ đến hạn. Thêm từ mới hoặc quay lại sau nhé, Linguo sẽ xếp lịch cho bạn."
          action={
            <Link to={listUrl} className={buttonClasses('accent', 'lg', true)}>
              Về danh sách
            </Link>
          }
        />
      </div>
    );
  }

  if (status === 'finished' || !card) {
    return (
      <div className="space-y-6">
        {heading}
        <SolidCard className="flex flex-col items-center gap-4 px-6 py-10 text-center">
          <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <PartyPopper aria-hidden className="size-7" />
          </span>
          <h2 ref={summaryRef} tabIndex={-1} className="text-xl font-bold tracking-[-0.02em] focus:outline-none">
            Xong phiên ôn
          </h2>
          <p role="status" className="max-w-sm text-[15px] text-muted">
            {graded.length > 0 ? `Bạn vừa ôn ${graded.length} từ. Lần ôn tiếp theo đã được xếp lịch rồi.` : 'Không có từ nào được chấm trong phiên này.'}
          </p>
          <div className="flex w-full max-w-xs flex-col gap-3">
            <Button variant="accent" size="lg" block onClick={session.retry}>
              Ôn tiếp nếu còn từ
            </Button>
            <Link to={listUrl} className={buttonClasses('ghost', 'lg', true)}>
              Về danh sách
            </Link>
          </div>
        </SolidCard>
      </div>
    );
  }

  const flipped = cardState !== 'front';
  return (
    <div className="space-y-5">
      {heading}
      <h2 ref={cardHeadingRef} tabIndex={-1} className="text-sm font-semibold text-muted focus:outline-none">
        Thẻ {Math.min(position + 1, Math.max(total, 1))}/{Math.max(total, 1)}
      </h2>
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

      <Flashcard key={cardKey} card={card} flipped={flipped} onFlip={flip} disabled={cardState === 'submitting'} />

      <RatingBar previews={card.previews} revealed={flipped} submitting={cardState === 'submitting'} onRate={rate} />
      <p className="hidden text-sm text-muted sm:block">Phím tắt: Space lật · 1–4 chấm</p>
    </div>
  );
}
