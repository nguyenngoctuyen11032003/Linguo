import { useRef, useState } from 'react';
import { ClipboardList, Plus, Trash2 } from 'lucide-react';
import { TEACHER_LIMITS as L, type TeacherAssignment, type TeacherRoster } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { SolidCard } from '@/components/ui/SolidCard';
import { useToast } from '@/components/ui/Toast';
import { ASSIGNMENT_KIND_LABELS, assignmentTitle, completionPercent, formatDay, isOverdue } from '@/features/teacher/format';
import type { ClassRosterApi } from '@/features/teacher/useClassRoster';
import { cn } from '@/lib/cn';
import { AssignmentDialog } from './AssignmentDialog';
import { ConfirmDialog } from './ConfirmDialog';

/** Assignments of a class with per-assignment completion; create and delete. */
export function AssignmentSection({ roster, archived, api }: { roster: TeacherRoster; archived: boolean; api: ClassRosterApi }) {
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<TeacherAssignment | null>(null);
  const createRef = useRef<HTMLButtonElement>(null);
  const deleteTrigger = useRef<HTMLElement | null>(null);
  const atLimit = roster.assignments.length >= L.maxAssignmentsPerClass;

  return (
    <section aria-labelledby="assignments-title" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="assignments-title" className="text-xl font-extrabold tracking-[-0.02em]">
            Bài đã giao ({roster.assignments.length})
          </h2>
          <p className="text-[15px] text-muted">Hoàn thành được tính tự động từ việc học của học viên trong Linguo.</p>
        </div>
        <Button
          ref={createRef}
          disabled={archived || atLimit}
          hint={archived ? 'Khôi phục lớp để giao bài.' : atLimit ? `Tối đa ${L.maxAssignmentsPerClass} bài giao mỗi lớp.` : undefined}
          onClick={() => setCreating(true)}
        >
          <Plus aria-hidden className="size-5" />
          Giao bài
        </Button>
      </div>
      {roster.assignments.length === 0 ? (
        <SolidCard className="flex items-center gap-3 px-5 py-4 text-[15px] text-muted">
          <ClipboardList aria-hidden className="size-5 shrink-0" />
          Chưa giao bài nào cho lớp này.
        </SolidCard>
      ) : (
        <ul className="space-y-3">
          {roster.assignments.map((a) => {
            const percent = completionPercent(a.completed_count, a.member_count);
            const overdue = isOverdue(a.due_at);
            const title = assignmentTitle(a);
            return (
              <li key={a.id}>
                <SolidCard className="space-y-3 p-5">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="eyebrow">{ASSIGNMENT_KIND_LABELS[a.kind]}</p>
                      <h3 className="mt-0.5 break-words text-[17px] font-bold leading-snug">{title}</h3>
                      <p className="mt-0.5 text-[13px] text-muted">
                        {a.due_at ? (
                          <>
                            Hạn {formatDay(a.due_at)}
                            {overdue && <span className="ml-1.5 rounded-full bg-error/10 px-2 py-0.5 font-semibold text-error-text">Đã quá hạn</span>}
                          </>
                        ) : (
                          'Không đặt hạn'
                        )}
                        {' · '}giao ngày {formatDay(a.created_at)}
                      </p>
                      {a.note && <p className="mt-2 whitespace-pre-line break-words text-[15px]">{a.note}</p>}
                    </div>
                    <button
                      type="button"
                      aria-label={`Xoá bài giao ${title}`}
                      onClick={(e) => {
                        deleteTrigger.current = e.currentTarget;
                        setDeleting(a);
                      }}
                      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-error/10 hover:text-error"
                    >
                      <Trash2 aria-hidden className="size-5" />
                    </button>
                  </div>
                  <div className="flex items-end gap-3">
                    <span aria-hidden="true" className={cn('stat-num shrink-0 text-[44px]', percent === 100 ? 'text-success-text' : 'text-text')}>
                      {percent}
                      <span className="text-[20px] text-muted">%</span>
                    </span>
                    <div className="min-w-0 flex-1 pb-1">
                      <p className="text-[13px] text-muted">
                        <span className="font-semibold text-text">
                          {a.completed_count}/{a.member_count}
                        </span>{' '}
                        học viên đã hoàn thành ({percent}%)
                      </p>
                      <div aria-hidden className="mt-1.5 h-2 overflow-hidden rounded-full bg-text/10">
                        <div className={cn('h-full rounded-full bg-gradient-to-r', percent === 100 ? 'from-success to-[#7ee2ae]' : 'from-primary-strong to-primary')} style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  </div>
                </SolidCard>
              </li>
            );
          })}
        </ul>
      )}
      <AssignmentDialog
        open={creating}
        language={roster.class.language_code}
        triggerRef={createRef}
        onClose={() => setCreating(false)}
        onSubmit={async (input) => {
          await api.createAssignment(input);
          toast.show({ tone: 'success', message: 'Đã giao bài cho lớp.' });
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        title="Xoá bài giao này?"
        description="Bài giao biến mất khỏi danh sách của học viên. Kết quả học của họ vẫn được giữ nguyên."
        confirmLabel="Xoá bài giao"
        triggerRef={deleteTrigger}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await api.deleteAssignment(deleting.id);
          toast.show({ tone: 'success', message: 'Đã xoá bài giao.' });
        }}
      />
    </section>
  );
}
