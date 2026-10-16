import { ClipboardCheck } from 'lucide-react';
import { useDiagnosticStatus } from '@/features/diagnostic/useDiagnosticStatus';
import { ActionCard } from './ActionCard';

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
    <ActionCard
      icon={ClipboardCheck}
      titleId="diagnostic-card-title"
      title={resume ? 'Tiếp tục bài kiểm tra' : 'Kiểm tra trình độ'}
      description={
        resume
          ? 'Bài kiểm tra đang dừng giữa chừng. Làm tiếp từ câu đang chờ.'
          : 'Khoảng 12 phút, để lộ trình sát trình độ của bạn.'
      }
      to={`/app/kiem-tra/${pathId}`}
      label={resume ? 'Làm tiếp' : 'Làm bài kiểm tra'}
    />
  );
}
