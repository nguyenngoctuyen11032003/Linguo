import { useMemo, useRef, useState } from 'react';
import { ClipboardList, Download, Lock, LockOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { TEACHER_LIMITS as L, type TeacherAssignment, type TeacherRoster } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { SolidCard } from '@/components/ui/SolidCard';
import { useToast } from '@/components/ui/Toast';
import { buildAssignmentsCsv, exportFileName } from '@/features/teacher/export';
import {
  ASSIGNMENT_KIND_LABELS,
  assignmentStatusLabel,
  assignmentTitle,
  completionPercent,
  examModeLabel,
  formatDay,
} from '@/features/teacher/format';
import type { ClassRosterApi } from '@/features/teacher/useClassRoster';
import { cn } from '@/lib/cn';
import { downloadTextFile } from '@/lib/download';
import { AssignmentDialog } from './AssignmentDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { EditAssignmentDialog } from './EditAssignmentDialog';

type Show = 'open' | 'closed' | 'all';

/** Assignments shown at first and added by each "Hiện thêm". */
export const ASSIGNMENT_PAGE_SIZE = 20;

const ICON_BUTTON = 'inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-text/5 hover:text-text disabled:cursor-not-allowed disabled:opacity-50';

/** Assignments of a class with per-assignment completion; create, edit, close or reopen, delete, and export. */
export function AssignmentSection({ roster, archived, api }: { roster: TeacherRoster; archived: boolean; api: ClassRosterApi }) {
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TeacherAssignment | null>(null);
  const [deleting, setDeleting] = useState<TeacherAssignment | null>(null);
  const [toggling, setToggling] = useState<TeacherAssignment | null>(null);
  const [show, setShow] = useState<Show>('open');
  const [limit, setLimit] = useState(ASSIGNMENT_PAGE_SIZE);
  const createRef = useRef<HTMLButtonElement>(null);
  const rowTrigger = useRef<HTMLElement | null>(null);
  const atLimit = roster.assignments.length >= L.maxAssignmentsPerClass;

  const closedCount = roster.assignments.filter((a) => a.closed_at !== null).length;
  const openCount = roster.assignments.length - closedCount;
  // With nothing closed there is only one list: skip the switch.
  const effectiveShow: Show = closedCount === 0 ? 'all' : show;
  const shown = useMemo(
    () => roster.assignments.filter((a) => effectiveShow === 'all' || (effectiveShow === 'closed') === (a.closed_at !== null)),
    [roster.assignments, effectiveShow],
  );
  const visible = shown.slice(0, limit);

  return (
    <section aria-labelledby="assignments-title" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="assignments-title" className="text-xl font-extrabold tracking-[-0.02em]">
            Bài đã giao ({roster.assignments.length})
          </h2>
          <p className="text-[15px] text-muted">Hoàn thành được tính tự động từ việc học của học viên trong Linguo.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {roster.assignments.length > 0 && (
            <Button
              variant="ghost"
              onClick={() => {
                downloadTextFile(buildAssignmentsCsv(roster.assignments), exportFileName(roster.class.name, 'bai-giao'), 'text/csv;charset=utf-8');
                toast.show({ tone: 'success', message: 'Đã tải bảng tổng hợp bài giao ra file CSV.' });
              }}
            >
              <Download aria-hidden className="size-4" />
              Xuất CSV
            </Button>
          )}
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
      </div>

      {closedCount > 0 && (
        <div role="radiogroup" aria-label="Lọc bài giao" className="flex flex-wrap gap-2">
          {(
            [
              { value: 'open', label: `Đang mở (${openCount})` },
              { value: 'closed', label: `Đã đóng (${closedCount})` },
              { value: 'all', label: `Tất cả (${roster.assignments.length})` },
            ] as const
          ).map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={effectiveShow === o.value}
              onClick={() => {
                setShow(o.value);
                setLimit(ASSIGNMENT_PAGE_SIZE);
              }}
              className={cn(
                'inline-flex min-h-11 items-center rounded-full border px-4 text-[15px] font-bold',
                effectiveShow === o.value ? 'border-primary bg-primary text-on-primary' : 'border-border bg-text/[0.03] text-text',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {roster.assignments.length === 0 ? (
        <SolidCard className="flex items-center gap-3 px-5 py-4 text-[15px] text-muted">
          <ClipboardList aria-hidden className="size-5 shrink-0" />
          Chưa giao bài nào cho lớp này.
        </SolidCard>
      ) : shown.length === 0 ? (
        <SolidCard className="flex items-center gap-3 px-5 py-4 text-[15px] text-muted">
          <ClipboardList aria-hidden className="size-5 shrink-0" />
          {effectiveShow === 'open' ? 'Không còn bài nào đang mở. Xem mục “Đã đóng” để xem lại các bài trước.' : 'Chưa có bài nào đã đóng.'}
        </SolidCard>
      ) : (
        <ul className="space-y-3">
          {visible.map((a) => {
            const percent = completionPercent(a.completed_count, a.member_count);
            const status = assignmentStatusLabel(a);
            const title = assignmentTitle(a);
            const closed = a.closed_at !== null;
            return (
              <li key={a.id}>
                <SolidCard className={cn('space-y-3 p-5', closed && 'opacity-90')}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="eyebrow">
                        {ASSIGNMENT_KIND_LABELS[a.kind]}
                        {a.kind === 'exam' && <span className="normal-case tracking-normal"> · {examModeLabel(a)}</span>}
                      </p>
                      <h3 className="mt-0.5 break-words text-[17px] font-bold leading-snug">{title}</h3>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 font-semibold',
                            status.tone === 'overdue' && 'bg-error/10 text-error-text',
                            status.tone === 'closed' && 'bg-text/10 text-text',
                            status.tone === 'open' && 'bg-success/10 text-success-text',
                          )}
                        >
                          {status.text}
                        </span>
                        <span>{a.due_at ? `Hạn ${formatDay(a.due_at)}` : 'Không đặt hạn'}</span>
                        <span>· giao ngày {formatDay(a.created_at)}</span>
                        {a.closed_at && <span>· đóng ngày {formatDay(a.closed_at)}</span>}
                      </p>
                      {a.note && <p className="mt-2 whitespace-pre-line break-words text-[15px]">{a.note}</p>}
                    </div>
                    <div className="-mr-2 -mt-1 flex shrink-0 flex-wrap justify-end">
                      <button
                        type="button"
                        aria-label={`Sửa bài giao ${title}`}
                        disabled={archived}
                        onClick={(e) => {
                          rowTrigger.current = e.currentTarget;
                          setEditing(a);
                        }}
                        className={ICON_BUTTON}
                      >
                        <Pencil aria-hidden className="size-5" />
                      </button>
                      <button
                        type="button"
                        aria-label={closed ? `Mở lại bài giao ${title}` : `Đóng bài giao ${title}`}
                        disabled={archived}
                        onClick={(e) => {
                          rowTrigger.current = e.currentTarget;
                          setToggling(a);
                        }}
                        className={ICON_BUTTON}
                      >
                        {closed ? <LockOpen aria-hidden className="size-5" /> : <Lock aria-hidden className="size-5" />}
                      </button>
                      <button
                        type="button"
                        aria-label={`Xoá bài giao ${title}`}
                        onClick={(e) => {
                          rowTrigger.current = e.currentTarget;
                          setDeleting(a);
                        }}
                        className={cn(ICON_BUTTON, 'hover:bg-error/10 hover:text-error')}
                      >
                        <Trash2 aria-hidden className="size-5" />
                      </button>
                    </div>
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
                        <div
                          className={cn('h-full rounded-full bg-gradient-to-r', percent === 100 ? 'from-success to-[#7ee2ae]' : 'from-primary-strong to-primary')}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </SolidCard>
              </li>
            );
          })}
        </ul>
      )}
      {shown.length > visible.length && (
        <Button variant="ghost" block onClick={() => setLimit((n) => n + ASSIGNMENT_PAGE_SIZE)}>
          Hiện thêm {Math.min(ASSIGNMENT_PAGE_SIZE, shown.length - visible.length)} bài
        </Button>
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
      <EditAssignmentDialog
        assignment={editing}
        triggerRef={rowTrigger}
        onClose={() => setEditing(null)}
        onSubmit={async (assignment, input) => {
          await api.updateAssignment(assignment.id, input);
          toast.show({ tone: 'success', message: 'Đã lưu bài giao.' });
        }}
      />
      <ConfirmDialog
        open={toggling !== null}
        title={toggling?.closed_at ? 'Mở lại bài giao này?' : 'Đóng bài giao này?'}
        description={
          toggling?.closed_at
            ? 'Học viên lại thấy bài là việc cần làm, và việc làm từ lúc giao bài được tính lại.'
            : 'Học viên không còn thấy bài là việc cần làm và không bị tính quá hạn. Việc học viên làm sau khi đóng không được tính. Bạn có thể mở lại bất cứ lúc nào.'
        }
        confirmLabel={toggling?.closed_at ? 'Mở lại' : 'Đóng bài'}
        tone="primary"
        triggerRef={rowTrigger}
        onClose={() => setToggling(null)}
        onConfirm={async () => {
          if (!toggling) return;
          const reopening = toggling.closed_at !== null;
          await api.updateAssignment(toggling.id, { note: toggling.note, closed: !reopening });
          toast.show({ tone: 'success', message: reopening ? 'Đã mở lại bài giao.' : 'Đã đóng bài giao.' });
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        title="Xoá bài giao này?"
        description="Bài giao biến mất khỏi danh sách của học viên. Kết quả học của họ vẫn được giữ nguyên."
        confirmLabel="Xoá bài giao"
        triggerRef={rowTrigger}
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
