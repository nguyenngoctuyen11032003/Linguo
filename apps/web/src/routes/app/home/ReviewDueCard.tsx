import { Layers } from 'lucide-react';
import { Link } from 'react-router';
import { buttonClasses } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { SolidCard } from '@/components/ui/SolidCard';
import { useReviewDue } from '@/features/reviews/useReviewDue';

/**
 * Home "Ôn tập hôm nay: N thẻ" as a big-number tile: a skeleton holds its place while loading so the cards below do
 * not jump; hidden with nothing due; a load error leaves only a small retry.
 */
export function ReviewDueCard() {
  const { status, count, reload } = useReviewDue();

  if (status === 'error') {
    return (
      <p className="text-sm text-muted">
        Chưa tải được số thẻ cần ôn.{' '}
        <button
          type="button"
          onClick={reload}
          className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline"
        >
          Tải lại thẻ ôn
        </button>
      </p>
    );
  }
  if (status === 'loading') {
    return (
      <SolidCard className="min-h-44 sm:min-h-30">
        <div role="status">
          <span className="sr-only">Đang tải số thẻ cần ôn…</span>
          <Skeleton className="block h-12 w-full" />
        </div>
      </SolidCard>
    );
  }
  if (count <= 0) return null;

  return (
    <SolidCard className="relative overflow-hidden p-4">
      <section aria-labelledby="review-due-title" className="flex items-center gap-4">
        {/* Stacked-cards motif behind the number. */}
        <div aria-hidden="true" className="relative grid size-[4.5rem] shrink-0 place-items-center">
          <span className="absolute inset-0 translate-x-1.5 -translate-y-1 rotate-6 rounded-2xl bg-accent/20" />
          <span className="absolute inset-0 rounded-2xl bg-gradient-to-br from-accent to-accent-depth shadow-[0_8px_20px_-8px_var(--accent)]" />
          <span className="stat-num relative text-[40px] text-on-accent">{count > 99 ? '99+' : count}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="review-due-title" className="text-[17px] font-bold leading-snug tracking-[-0.02em]">
            <span className="sr-only">Ôn tập hôm nay: {count} thẻ</span>
            <span aria-hidden="true">Thẻ cần ôn</span>
          </h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted">
            <Layers aria-hidden className="size-3.5" />
            Ôn trước, học mới sau
          </p>
        </div>
        <Link to="/app/on-tap" className={buttonClasses('ghost', 'md')}>
          Ôn ngay
        </Link>
      </section>
    </SolidCard>
  );
}
