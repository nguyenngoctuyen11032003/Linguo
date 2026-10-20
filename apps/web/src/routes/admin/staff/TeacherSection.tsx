import { useId, useMemo, useState } from 'react';
import type { AdminTeacher } from '@linguo/shared';
import { School } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { STAFF_LIST_PAGE_SIZE, STAFF_SEARCH_THRESHOLD, filterPeople, staffDisplayName, teacherClassesLabel } from '@/features/admin/staff';
import type { AdminTeachersState } from '@/features/admin/useAdminStaff';
import { PeopleSearch } from './PeopleSearch';
import { RevokeRoleDialog } from './RevokeRoleDialog';

type Message = { tone: 'ok' | 'error'; text: string };

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('vi-VN', { dateStyle: 'medium' });
};

function TeacherRow({ teacher, isSelf, saving, onRevoke }: { teacher: AdminTeacher; isSelf: boolean; saving: boolean; onRevoke(t: AdminTeacher): void }) {
  const name = staffDisplayName(teacher);
  const granted = teacher.granted_by_email
    ? `Cấp ngày ${formatDate(teacher.granted_at)} bởi ${teacher.granted_by_email}`
    : `Cấp ngày ${formatDate(teacher.granted_at)}`;
  return (
    <li className="flex flex-col gap-3 border-t border-border p-4 first:border-t-0 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="break-words font-semibold">
          {name}
          {isSelf && <span className="ml-2 rounded-full bg-primary/12 px-2 py-0.5 text-sm font-semibold">Bạn</span>}
        </p>
        {teacher.email && teacher.display_name && <p className="break-all text-sm text-muted">{teacher.email}</p>}
        <p className="text-sm text-muted">
          {granted} · {teacherClassesLabel(teacher.active_classes)}
        </p>
      </div>
      <Button variant="danger" disabled={saving} onClick={() => onRevoke(teacher)} aria-label={`Thu hồi quyền giáo viên của ${name}`} className="self-start sm:self-auto sm:shrink-0">
        Thu hồi
      </Button>
    </li>
  );
}

/**
 * Teachers on /quan-tri/nhan-su: who may open /giao-vien (admin_list_teachers), with a confirmed revoke
 * (grant_teacher_role false). Granting happens in the account search above. Teacher status is separate from staff
 * roles, so an admin may also revoke their own.
 */
export function TeacherSection({
  teachers,
  currentUserId,
  onChanged,
}: {
  teachers: AdminTeachersState;
  currentUserId: string | null;
  /** Called after a revoke succeeded (the history on the page refreshes). */
  onChanged?: () => void;
}) {
  const titleId = useId();
  const { status, data, error, reload, setTeacher, savingTeacherId } = teachers;
  const [revoking, setRevoking] = useState<AdminTeacher | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(STAFF_LIST_PAGE_SIZE);
  const saving = savingTeacherId !== null;
  const matches = useMemo(() => filterPeople(data ?? [], query), [data, query]);

  const confirmRevoke = async () => {
    const teacher = revoking;
    if (!teacher) return;
    setMessage(null);
    const outcome = await setTeacher(teacher.user_id, false);
    setRevoking(null);
    if (outcome.ok) onChanged?.();
    setMessage(
      outcome.ok ? { tone: 'ok', text: `Đã thu hồi quyền giáo viên của ${staffDisplayName(teacher)}.` } : { tone: 'error', text: outcome.message },
    );
  };

  return (
    <section aria-labelledby={titleId} className="space-y-3">
      <div className="space-y-1">
        <h2 id={titleId} className="text-lg font-semibold">
          Giáo viên
        </h2>
        <p className="text-[15px] text-muted">
          Giáo viên mở được khu Lớp học (giáo viên) để tạo lớp và giao bài. Quyền này tách khỏi vai trò quản trị; cấp bằng ô tìm
          tài khoản ở trên.
        </p>
      </div>
      {message && (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className={message.tone === 'error' ? 'text-[15px] text-error-text' : 'text-[15px] text-success-text'}>
          {message.text}
        </p>
      )}
      {status === 'error' && !data ? (
        <ErrorState title="Không tải được danh sách giáo viên" description={error ?? undefined} onRetry={reload} headingLevel="h3" />
      ) : !data ? (
        <div role="status" aria-label="Đang tải danh sách giáo viên" className="space-y-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <EmptyState icon={School} title="Chưa có giáo viên" description="Tìm một tài khoản ở trên để cấp quyền giáo viên đầu tiên." />
      ) : (
        <>
          {data.length > STAFF_SEARCH_THRESHOLD && (
            <PeopleSearch
              label="Tìm giáo viên"
              value={query}
              onChange={(value) => {
                setQuery(value);
                setLimit(STAFF_LIST_PAGE_SIZE);
              }}
              shown={matches.length}
              total={data.length}
            />
          )}
          {matches.length === 0 ? (
            <p role="status" className="px-1 text-[15px] text-muted">
              Không có giáo viên nào khớp.
            </p>
          ) : (
            <ul aria-label="Danh sách giáo viên" aria-busy={status === 'loading' || undefined} className="rounded-3xl border border-border bg-surface-solid">
              {matches.slice(0, limit).map((teacher) => (
                <TeacherRow key={teacher.user_id} teacher={teacher} isSelf={teacher.user_id === currentUserId} saving={saving} onRevoke={setRevoking} />
              ))}
            </ul>
          )}
          {matches.length > limit && (
            <Button variant="ghost" block onClick={() => setLimit((n) => n + STAFF_LIST_PAGE_SIZE)}>
              Hiện thêm {Math.min(STAFF_LIST_PAGE_SIZE, matches.length - limit)} giáo viên
            </Button>
          )}
        </>
      )}

      <RevokeRoleDialog
        name={revoking ? staffDisplayName(revoking) : null}
        roleLabel="giáo viên"
        title="Thu hồi quyền giáo viên?"
        consequence={
          revoking && revoking.active_classes > 0
            ? `sẽ không mở được khu giáo viên nữa. ${revoking.active_classes} lớp đang mở vẫn còn (học viên vẫn thấy lớp) và quay lại khi cấp lại quyền.`
            : 'sẽ không mở được khu giáo viên nữa.'
        }
        busy={revoking !== null && savingTeacherId === revoking.user_id}
        onConfirm={() => void confirmRevoke()}
        onCancel={() => {
          if (!saving) setRevoking(null);
        }}
      />
    </section>
  );
}
