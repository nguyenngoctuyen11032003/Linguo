import { BookOpen, GraduationCap, RotateCcw, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import type { AssignmentKind, LearnerAssignment, LearnerClass } from '@linguo/shared';
import { Button, buttonClasses } from '@/components/ui/Button';
import { SolidCard } from '@/components/ui/SolidCard';
import {
  ASSIGNMENT_KIND_LABELS,
  CLASS_LANGUAGE_LABELS,
  assignmentAction,
  assignmentLink,
  assignmentStatus,
  assignmentTitle,
  formatDue,
  formatJoined,
} from '@/features/classes/labels';
import { cn } from '@/lib/cn';

const KIND_ICONS: Record<AssignmentKind, LucideIcon> = { lesson: BookOpen, exam: GraduationCap, review: RotateCcw };

const STATE_CLASSES: Record<LearnerAssignment['state'], string> = {
  done: 'bg-success/12 text-success-text',
  overdue: 'bg-error/12 text-error-text',
  pending: 'bg-text/6 text-muted',
};

export interface ClassCardProps {
  klass: LearnerClass;
  assignments: LearnerAssignment[];
  timeZone: string;
  /** Language of the learner's current path, to warn when the class is about another language. */
  currentLanguage: string | null;
  onLeave: (trigger: HTMLButtonElement) => void;
  leaveDisabled?: boolean;
}

/** One class: who teaches it, its assignments with due date and state, and "Rời lớp". */
export function ClassCard({ klass, assignments, timeZone, currentLanguage, onLeave, leaveDisabled }: ClassCardProps) {
  const titleId = `class-${klass.id}-title`;
  const language = CLASS_LANGUAGE_LABELS[klass.language_code];
  const inline = language.replace('Tiếng', 'tiếng');
  const open = assignments.filter((a) => a.state !== 'done').length;
  return (
    <SolidCard>
      <section aria-labelledby={titleId} className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="min-w-0 flex-1 break-words">
              <h2 id={titleId} className="text-[19px] font-extrabold leading-snug tracking-[-0.02em]">
                {klass.name}
              </h2>
              <p className="mt-0.5 text-[13px] text-muted">
                {language} · Giáo viên: {klass.teacher_name?.trim() || 'chưa đặt tên'} · Vào lớp {formatJoined(klass.joined_at, timeZone)}
              </p>
            </div>
            {assignments.length > 0 && (
              <span aria-hidden="true" className="flex shrink-0 flex-col items-end">
                <span className={cn('stat-num text-[44px]', open > 0 ? 'text-accent-text' : 'text-success-text')}>{open}</span>
                <span className="eyebrow mt-1">còn lại</span>
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            onClick={(e) => onLeave(e.currentTarget)}
            disabled={leaveDisabled}
            aria-label={`Rời lớp ${klass.name}`}
            className="w-full sm:w-auto sm:shrink-0"
          >
            Rời lớp
          </Button>
        </div>
        {currentLanguage !== null && currentLanguage !== klass.language_code && assignments.length > 0 && (
          <p className="rounded-2xl bg-warn/10 px-4 py-3 text-[15px] ring-1 ring-warn/40 ring-inset">
            Lớp này học {inline}, khác lộ trình bạn đang mở. Bài giao chỉ được tính khi bạn học trên lộ trình {inline}.
          </p>
        )}
        <div className="space-y-2">
          <h3 className="eyebrow">
            {assignments.length === 0 ? 'Bài được giao' : open > 0 ? `Bài được giao · còn ${open} bài` : 'Bài được giao · đã xong hết'}
          </h3>
          {assignments.length === 0 ? (
            <p className="text-[15px] text-muted">Giáo viên chưa giao bài nào. Khi có bài mới, bài sẽ hiện ở đây.</p>
          ) : (
            <ul className="space-y-2">
              {assignments.map((a) => (
                <AssignmentRow key={a.id} assignment={a} timeZone={timeZone} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </SolidCard>
  );
}

function AssignmentRow({ assignment: a, timeZone }: { assignment: LearnerAssignment; timeZone: string }) {
  const Icon = KIND_ICONS[a.kind];
  const title = assignmentTitle(a);
  const action = assignmentAction(a);
  const done = a.state === 'done';
  return (
    <li className={cn('flex flex-col gap-3 rounded-2xl p-4 ring-1 ring-inset sm:flex-row sm:items-center', a.state === 'overdue' ? 'bg-error/[0.04] ring-error/25' : 'bg-text/[0.03] ring-border')}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className={cn('inline-flex size-10 shrink-0 items-center justify-center rounded-full', done ? 'bg-success/15 text-success-text' : 'bg-primary/12 text-primary')}>
          <Icon aria-hidden className="size-5" />
        </span>
        <div className="min-w-0 flex-1 break-words">
          <p className="eyebrow">{ASSIGNMENT_KIND_LABELS[a.kind]}</p>
          <p className={cn('mt-0.5 font-bold leading-snug', done && 'text-muted line-through decoration-1')}>{title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className={cn('rounded-full px-2.5 py-0.5 text-[13px] font-semibold', STATE_CLASSES[a.state])}>{assignmentStatus(a)}</span>
            <span className="text-muted">{formatDue(a.due_at, timeZone)}</span>
          </p>
          {a.note && (
            <p className="mt-2 whitespace-pre-line text-[15px]">
              <span className="text-muted">Lời nhắn của giáo viên: </span>
              {a.note}
            </p>
          )}
        </div>
      </div>
      <Link
        to={assignmentLink(a)}
        aria-label={`${action}: ${title}`}
        className={cn(buttonClasses('ghost', 'md'), 'w-full sm:w-auto sm:shrink-0')}
      >
        {action}
      </Link>
    </li>
  );
}
