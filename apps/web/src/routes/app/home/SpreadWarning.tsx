import { AlertTriangle } from 'lucide-react';
import type { LearningPath } from '@/features/learning-paths/service';
import { activeLanguageCount, needsSpreadWarning } from './spread';

export function SpreadWarning({ paths }: { paths: readonly LearningPath[] }) {
  if (!needsSpreadWarning(paths)) return null;
  return (
    <div role="note" className="flex items-start gap-3 rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3 text-[15px]">
      <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-warn" />
      <p>
        Bạn đang học {activeLanguageCount(paths)} ngôn ngữ với ít thời gian cho mỗi ngôn ngữ. Tập trung một ngôn ngữ hoặc tăng thời lượng sẽ giúp tiến bộ rõ hơn.
      </p>
    </div>
  );
}
