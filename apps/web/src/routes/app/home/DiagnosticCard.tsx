import { ClipboardCheck } from 'lucide-react';
import { Link } from 'react-router';
import { buttonClasses } from '@/components/ui/Button';
import { SolidCard } from '@/components/ui/SolidCard';
import { useDiagnosticStatus } from '@/features/diagnostic/useDiagnosticStatus';

/**
 * Home entry to the placement test (spec 4 §5): "Kiểm tra trình độ" while the path has no completed test and a new
 * one may start, "Tiếp tục bài kiểm tra" while one is in progress. Hidden otherwise, while loading and on errors.
 */
export function DiagnosticCard({ pathId }: { pathId: string }) {
  const { status, data } = useDiagnosticStatus(pathId);
  if (status !== 'ready' || !data) return null;

  const resume = data.status === 'in_progress';
  const offer = !resume && data.can_start && data.status !== 'completed' && !data.completed_at;
  if (!resume && !offer) return null;

  return (
    <SolidCard>
      <section aria-labelledby="diagnostic-card-title" className="flex flex-wrap items-center gap-4">
        <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
          <ClipboardCheck aria-hidden className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="diagnostic-card-title" className="text-lg font-bold tracking-[-0.02em]">
            {resume ? 'Tiếp tục bài kiểm tra' : 'Kiểm tra trình độ'}
          </h2>
          <p className="text-sm text-muted">
            {resume
              ? 'Bài kiểm tra đang dừng giữa chừng. Làm tiếp từ câu đang chờ.'
              : 'Khoảng 12 phút, câu hỏi thay đổi theo câu trả lời của bạn. Kết quả giúp đặt trình độ lộ trình sát hơn.'}
          </p>
        </div>
        <Link to={`/app/kiem-tra/${pathId}`} className={buttonClasses('primary', 'md')}>
          {resume ? 'Làm tiếp' : 'Bắt đầu kiểm tra'}
        </Link>
      </section>
    </SolidCard>
  );
}
