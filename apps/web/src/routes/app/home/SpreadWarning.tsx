import { AlertTriangle } from 'lucide-react';
import type { LearningPath } from '@/features/learning-paths/service';

const MIN_AVERAGE_MINUTES = 15;

/** PRD 2.1E: two active languages, each averaging under 15 minutes a day. */
export function needsSpreadWarning(paths: readonly LearningPath[]): boolean {
  const active = paths.filter((p) => p.status === 'active');
  return active.length >= 2 && active.every((p) => p.weeklyMinutes.reduce((s, m) => s + m, 0) / 7 < MIN_AVERAGE_MINUTES);
}

export function SpreadWarning({ paths }: { paths: readonly LearningPath[] }) {
  if (!needsSpreadWarning(paths)) return null;
  return (
    <div role="note" className="flex items-start gap-3 rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3 text-[15px]">
      <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-warn" />
      <p>
        Bạn đang học 2 ngôn ngữ với ít thời gian cho mỗi ngôn ngữ. Tập trung một ngôn ngữ hoặc tăng thời lượng sẽ giúp tiến bộ rõ hơn.
      </p>
    </div>
  );
}
