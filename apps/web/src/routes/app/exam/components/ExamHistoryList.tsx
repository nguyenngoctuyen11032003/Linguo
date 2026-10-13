import { Link } from 'react-router';
import { CheckCircle2, ChevronRight, PlayCircle, TimerOff } from 'lucide-react';
import type { ExamHistoryEntry } from '@linguo/shared';
import { cn } from '@/lib/cn';
import {
  FAMILY_LABELS,
  MODE_LABELS,
  SECTION_LABELS,
  examResultHref,
  examRunnerHref,
  formatDate,
  formatScore,
  levelLabel,
} from './labels';

export interface ExamHistoryListProps {
  entries: ExamHistoryEntry[];
  /** Denser rows for the "Tiến độ" card: family instead of the full form title. */
  compact?: boolean;
}

const STATUS_UI = {
  submitted: { icon: CheckCircle2, label: 'Đã nộp', tone: 'text-success-text' },
  expired: { icon: TimerOff, label: 'Hết giờ', tone: 'text-muted' },
  in_progress: { icon: PlayCircle, label: 'Đang làm', tone: 'text-primary' },
} as const;

/** Recent exam attempts, newest first. Closed attempts link to their result, an open one to the runner. */
export function ExamHistoryList({ entries, compact = false }: ExamHistoryListProps) {
  if (entries.length === 0) {
    return <p className="text-[15px] text-muted">Chưa có lượt thi thử nào.</p>;
  }

  return (
    <ul className={cn('min-w-0', compact ? 'divide-y divide-border' : 'grid gap-2')}>
      {entries.map((entry) => {
        const status = STATUS_UI[entry.status];
        const Icon = status.icon;
        const open = entry.status === 'in_progress';
        const mode = entry.section ? `${MODE_LABELS[entry.mode]} · ${SECTION_LABELS[entry.section]}` : MODE_LABELS[entry.mode];
        const score = entry.total !== null && entry.max !== null ? `${formatScore(entry.total)}/${formatScore(entry.max)} điểm` : null;
        return (
          <li
            key={entry.attempt_id}
            className={cn('flex min-w-0 items-center gap-3', compact ? 'py-2' : 'rounded-2xl border border-border bg-surface-solid px-4 py-3')}
          >
            <div className="min-w-0 flex-1">
              <p className={cn('font-semibold break-words', compact ? 'text-[15px]' : 'text-base')}>
                {compact ? `${FAMILY_LABELS[entry.family]} · ${mode}` : entry.form_title_vi}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted">
                {!compact && <span>{mode}</span>}
                <span>{formatDate(entry.submitted_at ?? entry.started_at)}</span>
                <span className={cn('inline-flex items-center gap-1 font-medium', status.tone)}>
                  <Icon aria-hidden className="size-4" />
                  {status.label}
                </span>
              </p>
              {(score || entry.estimated_level_code) && (
                <p className="mt-0.5 text-sm">
                  {score && <span className="font-semibold">{score}</span>}
                  {score && entry.estimated_level_code && ' · '}
                  {entry.estimated_level_code && <span>{levelLabel(entry.estimated_level_code)} (tham khảo)</span>}
                </p>
              )}
            </div>
            <Link
              to={open ? examRunnerHref(entry.attempt_id) : examResultHref(entry.attempt_id)}
              className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-semibold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
            >
              {open ? 'Làm tiếp' : 'Xem kết quả'}
              <span className="sr-only">: {entry.form_title_vi}</span>
              <ChevronRight aria-hidden className="size-4" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
