import { Check, Minus } from 'lucide-react';
import { motion } from 'motion/react';
import type { DiagnosticProgress } from '@linguo/shared';
import { EASE_OUT } from '@/design/motion';
import { cn } from '@/lib/cn';
import { useMotionPrefs } from '@/providers/MotionProvider';
import { SKILL_LABELS } from './labels';

type SkillRow = DiagnosticProgress['skills'][number];

const STATUS_TEXT: Record<SkillRow['status'], string> = {
  pending: 'chưa làm',
  active: 'đang làm',
  done: 'xong',
  skipped: 'đã bỏ qua',
};

/** Announcement for screen readers: which skill is being tested (never a question count). */
function progressAnnouncement(progress: DiagnosticProgress): string {
  const active = progress.skills.find((s) => s.status === 'active');
  const base = active ? `Đang kiểm tra ${SKILL_LABELS[active.skill].toLowerCase()}` : 'Đang kiểm tra';
  return progress.near_end ? `${base}. Sắp xong.` : `${base}.`;
}

/**
 * One segment per skill. The fill shows how settled the estimate is, not how many questions are left:
 * the test adapts, so a count would be misleading. Status is also given as text and icon, never colour only.
 */
export function SkillProgress({ progress }: { progress: DiagnosticProgress }) {
  const { reduceMotion } = useMotionPrefs();
  return (
    <div className="min-w-0 flex-1">
      <ol aria-label="Tiến độ theo kỹ năng" className="grid grid-cols-3 gap-2">
        {progress.skills.map((row) => {
          const fill = row.status === 'done' ? 1 : row.status === 'skipped' ? 0 : row.fill;
          return (
            <li key={row.skill} className="min-w-0" aria-current={row.status === 'active' ? 'step' : undefined}>
              <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-text/10">
                <motion.div
                  className={cn('h-full rounded-full', row.status === 'active' ? 'bg-primary' : 'bg-primary/60')}
                  initial={false}
                  animate={{ width: `${Math.round(fill * 100)}%` }}
                  transition={reduceMotion ? { duration: 0 } : { duration: 0.3, ease: EASE_OUT }}
                />
              </div>
              <p
                className={cn(
                  'mt-1 flex items-center gap-1 truncate text-xs',
                  row.status === 'active' ? 'font-semibold text-text' : 'font-medium text-muted',
                )}
              >
                {row.status === 'done' && <Check aria-hidden className="size-3.5 shrink-0" />}
                {row.status === 'skipped' && <Minus aria-hidden className="size-3.5 shrink-0" />}
                <span className="truncate">{SKILL_LABELS[row.skill]}</span>
                <span className="sr-only">: {STATUS_TEXT[row.status]}</span>
              </p>
            </li>
          );
        })}
      </ol>
      <p aria-live="polite" className="sr-only">
        {progressAnnouncement(progress)}
      </p>
    </div>
  );
}
