import { ArrowRight, Layers } from 'lucide-react';
import { Link } from 'react-router';
import { buttonClasses } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { SolidCard } from '@/components/ui/SolidCard';
import { useReviewDue } from '@/features/reviews/useReviewDue';
import { cn } from '@/lib/cn';

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
    // Same box as the loaded tile (number block, two lines, button) so nothing below shifts.
    return (
      <SolidCard className="min-h-26 p-4">
        <div role="status" className="flex items-center gap-3 min-[380px]:gap-4">
          <span className="sr-only">Đang tải số thẻ cần ôn…</span>
          <Skeleton className="block size-16 shrink-0 rounded-2xl min-[380px]:size-[4.5rem]" />
          <span className="min-w-0 flex-1 space-y-2">
            <Skeleton className="block h-5 w-28 max-w-full" />
            <Skeleton className="block h-3.5 w-36 max-w-full" />
          </span>
          <Skeleton className="block size-11 shrink-0 rounded-full min-[380px]:w-24" />
        </div>
      </SolidCard>
    );
  }
  if (count <= 0) return null;

  return (
    <SolidCard className="relative overflow-hidden p-4">
      <section aria-labelledby="review-due-title" className="flex items-center gap-3 min-[380px]:gap-4">
        {/* Stacked-cards motif behind the number. */}
        <div aria-hidden="true" className="relative grid size-16 shrink-0 place-items-center min-[380px]:size-[4.5rem]">
          <span className="absolute inset-0 translate-x-1.5 -translate-y-1 rotate-6 rounded-2xl bg-accent/20" />
          <span className="absolute inset-0 rounded-2xl bg-gradient-to-br from-accent to-accent-depth shadow-[0_8px_20px_-8px_var(--accent)]" />
          <span className="stat-num relative text-[36px] text-on-accent min-[380px]:text-[40px]">{count > 99 ? '99+' : count}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="review-due-title" className="text-[17px] font-bold leading-snug tracking-[-0.02em]">
            <span className="sr-only">Ôn tập hôm nay: {count} thẻ</span>
            <span aria-hidden="true">Thẻ cần ôn</span>
          </h2>
          <p className="mt-0.5 flex items-start gap-1.5 text-[13px] leading-snug text-muted">
            <Layers aria-hidden className="mt-px size-3.5" />
            <span>Ôn trước, học mới sau</span>
          </p>
        </div>
        {/* Below 380px the label hides visually (it stays the link's name) and the button turns into a round arrow. */}
        <Link to="/app/on-tap" className={cn(buttonClasses('ghost', 'md'), 'shrink-0 max-[379px]:size-11 max-[379px]:px-0')}>
          <span className="max-[379px]:sr-only">Ôn ngay</span>
          <ArrowRight aria-hidden className="size-5 min-[380px]:hidden" />
        </Link>
      </section>
    </SolidCard>
  );
}
