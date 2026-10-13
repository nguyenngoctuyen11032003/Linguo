import { Link } from 'react-router';
import { GOAL_LABELS, LANGUAGES, LEVEL_INFO, type LevelCode } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { SolidCard } from '@/components/ui/SolidCard';
import { EstimateSummary } from '@/features/learning-paths/components/EstimateSummary';
import { formatMinutes } from '@/features/learning-paths/components/schedule';
import type { LearningPath } from '@/features/learning-paths/service';
import { weekdayIndex } from '@/lib/dates';

interface Props {
  path: LearningPath;
  timeZone: string;
  onResume: () => void;
  resuming: boolean;
}

export function PathSummaryCard({ path, timeZone, onResume, resuming }: Props) {
  const from = LEVEL_INFO[path.currentLevel as LevelCode].label;
  const to = LEVEL_INFO[path.targetLevel as LevelCode].label;
  const todayMinutes = path.weeklyMinutes[weekdayIndex(timeZone)] ?? 0;
  return (
    <SolidCard className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">Lộ trình của bạn</p>
          <h2 className="text-xl font-bold tracking-[-0.02em]">
            {LANGUAGES[path.language].nameVi} · {GOAL_LABELS[path.goalType]}
          </h2>
        </div>
        {path.status === 'paused' && (
          <span className="shrink-0 rounded-full bg-warn/15 px-3 py-1 text-sm font-semibold">Đang tạm dừng</span>
        )}
      </div>
      <p className="text-lg font-semibold">
        <span className="sr-only">Từ trình độ hiện tại tới mục tiêu: </span>
        {from} → {to}
      </p>
      <EstimateSummary estimate={path.estimate} compact />
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-muted">Hôm nay</dt>
          <dd className="font-semibold">{todayMinutes > 0 ? `${formatMinutes(todayMinutes)} theo lịch` : 'Ngày nghỉ theo lịch'}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Kỹ năng</dt>
          <dd className="font-semibold">Chưa đủ dữ liệu (tự đánh giá)</dd>
        </div>
      </dl>
      {path.status === 'paused' ? (
        <Button variant="primary" size="lg" block loading={resuming} onClick={onResume}>
          Tiếp tục lộ trình
        </Button>
      ) : (
        <div className="space-y-2">
          <Button variant="accent" size="lg" block disabled aria-describedby="session-soon">
            Bắt đầu phiên học
          </Button>
          <p id="session-soon" className="text-center text-sm text-muted">
            Sắp ra mắt trong bản cập nhật tới.
          </p>
        </div>
      )}
      <Link to="/app/cai-dat#lo-trinh" className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
        Sửa kế hoạch
      </Link>
    </SolidCard>
  );
}
