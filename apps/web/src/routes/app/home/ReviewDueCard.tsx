import { Layers } from 'lucide-react';
import { Link } from 'react-router';
import { buttonClasses } from '@/components/ui/Button';
import { SolidCard } from '@/components/ui/SolidCard';
import { useReviewDue } from '@/features/reviews/useReviewDue';

/** Home "Ôn tập hôm nay: N thẻ": hidden while loading or with nothing due; a load error leaves only a small retry. */
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
  if (status !== 'ready' || count <= 0) return null;

  return (
    <SolidCard>
      <section aria-labelledby="review-due-title" className="flex flex-wrap items-center gap-4">
        <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
          <Layers aria-hidden className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="review-due-title" className="text-lg font-bold tracking-[-0.02em]">
            Ôn tập hôm nay: {count} thẻ
          </h2>
          <p className="text-sm text-muted">Ôn trước khi học bài mới để nhớ lâu hơn.</p>
        </div>
        <Link to="/app/on-tap" className={buttonClasses('primary', 'md')}>
          Ôn ngay
        </Link>
      </section>
    </SolidCard>
  );
}
