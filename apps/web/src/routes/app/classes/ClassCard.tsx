import { BookOpen, GraduationCap, LogOut, RotateCcw, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import type { MouseEvent } from 'react';
import type { AssignmentKind, LearnerAssignment, LearnerClass } from '@linguo/shared';
import type { LearningPath } from '@/features/learning-paths/service';
import { buttonClasses } from '@/components/ui/Button';
import { SolidCard } from '@/components/ui/SolidCard';
import {
  ASSIGNMENT_KIND_LABELS,
  CLASS_LANGUAGE_LABELS,
  assignmentAction,
  assignmentLink,
  assignmentStatus,
  assignmentTitle,
  examModeText,
  formatDue,
  formatJoined,
} from '@/features/classes/labels';
import { cn } from '@/lib/cn';

const KIND_ICONS: Record<AssignmentKind, LucideIcon> = { lesson: BookOpen, exam: GraduationCap, review: RotateCcw };

const STATE_CLASSES: Record<LearnerAssignment['state'], string> = {
  done: 'bg-success/12 text-success-text',
  overdue: 'bg-error/12 text-error-text',
  closed: 'bg-text/10 text-text',
  pending: 'bg-text/6 text-muted',
};

export interface ClassCardProps {
  klass: LearnerClass;
  assignments: LearnerAssignment[];
  timeZone: string;
  /** Language of the learner's current path, to warn when the class is about another language. */
  currentLanguage: string | null;
  /** The learner's own path in the class language (null when there is none): opening an assignment switches to it. */
  classPath?: LearningPath | null;
  /** Called before an assignment link is followed; may switch the current path first (see ClassesPage). */
  onOpen?: (assignment: LearnerAssignment, event: MouseEvent<HTMLAnchorElement>) => void;
  onLeave: (trigger: HTMLButtonElement) => void;
  leaveDisabled?: boolean;
}

/** One class: who teaches it, its assignments with due date and state, and "Rời lớp". */
export function ClassCard({ klass, assignments, timeZone, currentLanguage, classPath = null, onOpen, onLeave, leaveDisabled }: ClassCardProps) {
  const titleId = `class-${klass.id}-title`;
  const language = CLASS_LANGUAGE_LABELS[klass.language_code];
  const inline = language.replace('Tiếng', 'tiếng');
  // Closed assignments no longer ask for work.
  const open = assignments.filter((a) => a.state === 'pending' || a.state === 'overdue').length;
  return (
    <SolidCard className="p-4 sm:p-5">
      <section aria-labelledby={titleId} className="space-y-4">
        <div className="flex min-w-0 items-start gap-3">
            <div className="min-w-0 flex-1 break-words">
              <h2 id={titleId} className="text-[17px] font-extrabold leading-snug sm:text-[19px] tracking-[-0.02em]">
                {klass.name}
              </h2>
              <p className="mt-0.5 text-[13px] text-muted">
                {language} · Giáo viên: {klass.teacher_name?.trim() || 'chưa đặt tên'} · Vào lớp {formatJoined(klass.joined_at, timeZone)}
              </p>
            </div>
            {assignments.length > 0 && (
              <span aria-hidden="true" className="flex shrink-0 flex-col items-end">
                <span className={cn('stat-num text-[34px] leading-none sm:text-[44px]', open > 0 ? 'text-accent-text' : 'text-success-text')}>{open}</span>
                <span className="eyebrow mt-1">còn lại</span>
              </span>
            )}
        </div>
        {currentLanguage !== null && currentLanguage !== klass.language_code && assignments.length > 0 && (
          <p className="rounded-2xl bg-warn/10 px-4 py-3 text-[15px] ring-1 ring-warn/40 ring-inset">
            {classPath ? (
              <>
                Lớp này học {inline}, khác lộ trình bạn đang mở. Khi bạn bấm vào một bài giao, Linguo sẽ chuyển sang lộ trình {inline} của bạn; muốn quay lại thì đổi lộ trình ở Cài đặt.
              </>
            ) : (
              <>
                Lớp này học {inline} nhưng bạn chưa có lộ trình {inline}, nên bài giao chưa làm được.{' '}
                <Link to={`/app/bat-dau?lang=${klass.language_code}`} className="font-semibold underline">
                  Tạo lộ trình {inline}
                </Link>
              </>
            )}
          </p>
        )}
        <div className="space-y-2">
          <h3 className="eyebrow">
            {assignments.length === 0 ? 'Bài được giao' : open > 0 ? `Bài được giao · còn ${open} bài` : 'Bài được giao · đã xong hết'}
          </h3>
          {assignments.length === 0 ? (
            <p className="text-[15px] text-muted">Giáo viên chưa giao bài nào. Khi có bài mới, bài sẽ hiện ở đây.</p>
          ) : (
            <ul className="-mx-1 divide-y divide-border">
              {assignments.map((a) => (
                <AssignmentRow key={a.id} assignment={a} timeZone={timeZone} onOpen={onOpen} />
              ))}
            </ul>
          )}
        </div>
        <div className="-mb-2 flex justify-end border-t border-border pt-1">
          <button
            type="button"
            onClick={(e) => onLeave(e.currentTarget)}
            disabled={leaveDisabled}
            aria-label={`Rời lớp ${klass.name}`}
            className="-mr-2 inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-[14px] font-semibold text-muted transition-[background-color,color,scale] duration-150 not-disabled:hover:bg-error/10 not-disabled:hover:text-error-text not-disabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LogOut aria-hidden className="size-4" />
            Rời lớp
          </button>
        </div>
      </section>
    </SolidCard>
  );
}

function AssignmentRow({ assignment: a, timeZone, onOpen }: { assignment: LearnerAssignment; timeZone: string; onOpen?: ClassCardProps['onOpen'] }) {
  const Icon = KIND_ICONS[a.kind];
  const title = assignmentTitle(a);
  const action = assignmentAction(a);
  const done = a.state === 'done';
  const modeText = examModeText(a);
  return (
    <li className="flex flex-col gap-3 px-1 py-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Icon
          aria-hidden
          strokeWidth={1.75}
          className={cn('mt-0.5 size-5 shrink-0', done ? 'text-success-text' : a.state === 'overdue' ? 'text-error-text' : 'text-primary')}
        />
        <div className="min-w-0 flex-1 break-words">
          <p className="eyebrow">
            {ASSIGNMENT_KIND_LABELS[a.kind]}
            {modeText && <span className="normal-case tracking-normal"> · {modeText}</span>}
          </p>
          <p className={cn('mt-0.5 font-bold leading-snug', done && 'text-muted line-through decoration-1')}>{title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className={cn('whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-semibold', STATE_CLASSES[a.state])}>{assignmentStatus(a)}</span>
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
        onClick={onOpen ? (event) => onOpen(a, event) : undefined}
        aria-label={`${action}: ${title}`}
        className={cn(buttonClasses('ghost', 'md'), 'ml-8 self-start sm:ml-0 sm:self-auto sm:shrink-0')}
      >
        {action}
      </Link>
    </li>
  );
}
