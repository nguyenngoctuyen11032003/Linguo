import { Layers } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { SolidCard } from '@/components/ui/SolidCard';
import { useReviewDue } from '@/features/reviews/useReviewDue';
import { ActionCard } from './ActionCard';

/**
 * Home "Ôn tập hôm nay: N thẻ": a skeleton holds its place while loading so the cards below do not jump; hidden with
 * nothing due; a load error leaves only a small retry.
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
    <ActionCard
      icon={Layers}
      titleId="review-due-title"
      title={`Ôn tập hôm nay: ${count} thẻ`}
      description="Ôn trước khi học bài mới để nhớ lâu hơn."
      to="/app/on-tap"
      label="Ôn ngay"
    />
  );
}
