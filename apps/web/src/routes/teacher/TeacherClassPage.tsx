import { useRef, useState } from 'react';
import { Archive, ArchiveRestore, ArrowLeft, Pencil } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Button, buttonClasses } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { SolidCard } from '@/components/ui/SolidCard';
import { useToast } from '@/components/ui/Toast';
import { CLASS_LANGUAGE_LABELS, formatDay } from '@/features/teacher/format';
import { useClassRoster } from '@/features/teacher/useClassRoster';
import { AssignmentSection } from './AssignmentSection';
import { ClassFormDialog } from './ClassFormDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { InviteSection } from './InviteSection';
import { RosterSection } from './RosterSection';

/** /giao-vien/lop/:classId: invites, assignments with completion, and the roster (aggregates only). */
export function TeacherClassPage() {
  const { classId = '' } = useParams();
  const api = useClassRoster(classId);
  const toast = useToast();
  const [renaming, setRenaming] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const renameRef = useRef<HTMLButtonElement>(null);
  const archiveRef = useRef<HTMLButtonElement>(null);

  const back = (
    <Link to="/giao-vien" className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-text/5 pl-3 pr-4 text-[14px] font-semibold text-muted transition-[background-color,color,scale] hover:bg-text/10 hover:text-text active:scale-95">
      <ArrowLeft aria-hidden className="size-4" />
      Tất cả lớp
    </Link>
  );

  if (api.status === 'loading') {
    return (
      <div className="space-y-4">
        {back}
        <div role="status" className="space-y-3">
          <span className="sr-only">Đang tải lớp…</span>
          <Skeleton className="block h-10 w-2/3 rounded-2xl" />
          <Skeleton className="block h-32 w-full rounded-3xl" />
          <Skeleton className="block h-48 w-full rounded-3xl" />
        </div>
      </div>
    );
  }
  if (api.status === 'not_found') {
    return (
      <div className="space-y-4">
        {back}
        <SolidCard className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <h1 className="page-title text-[clamp(2rem,9vw,2.5rem)]">Không tìm thấy lớp</h1>
          <p className="text-[15px] text-muted">Lớp này không tồn tại hoặc không thuộc về bạn.</p>
          <Link to="/giao-vien" className={buttonClasses('primary')}>
            Xem các lớp của tôi
          </Link>
        </SolidCard>
      </div>
    );
  }
  if (!api.roster) {
    return (
      <div className="space-y-4">
        {back}
        <h1 className="sr-only">Lớp học</h1>
        <ErrorState title="Không tải được lớp" description={api.error ?? undefined} onRetry={api.reload} />
      </div>
    );
  }

  const { roster } = api;
  const cls = roster.class;
  const archived = cls.archived_at !== null;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        {back}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="break-words page-title">{cls.name}</h1>
            <p className="mt-1 text-[15px] text-muted">
              {CLASS_LANGUAGE_LABELS[cls.language_code]} · {cls.member_count} học viên · tạo ngày {formatDay(cls.created_at)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button ref={renameRef} variant="ghost" onClick={() => setRenaming(true)}>
              <Pencil aria-hidden className="size-4" />
              Đổi tên
            </Button>
            <Button ref={archiveRef} variant="ghost" onClick={() => setArchiving(true)}>
              {archived ? <ArchiveRestore aria-hidden className="size-4" /> : <Archive aria-hidden className="size-4" />}
              {archived ? 'Khôi phục lớp' : 'Lưu trữ lớp'}
            </Button>
          </div>
        </div>
        {api.status === 'error' && (
          <p role="alert" className="rounded-2xl bg-error/10 px-4 py-3 text-[15px] text-error-text ring-1 ring-error/40 ring-inset">
            {api.error}{' '}
            <button type="button" onClick={api.reload} className="min-h-11 font-semibold underline">
              Thử lại
            </button>
          </p>
        )}
        {archived && (
          <p className="rounded-2xl bg-warn/10 px-4 py-3 text-[15px] ring-1 ring-warn/35 ring-inset">
            Lớp đã được lưu trữ ngày {formatDay(cls.archived_at ?? '')}. Học viên không còn thấy lớp; bạn không thể tạo mã mời hay giao bài mới cho
            tới khi khôi phục.
          </p>
        )}
      </div>

      <InviteSection cls={cls} archived={archived} api={api} />
      <AssignmentSection roster={roster} archived={archived} api={api} />
      <RosterSection roster={roster} api={api} />

      <ClassFormDialog
        open={renaming}
        mode="rename"
        initialName={cls.name}
        triggerRef={renameRef}
        onClose={() => setRenaming(false)}
        onSubmit={async (name) => {
          await api.rename(name);
          toast.show({ tone: 'success', message: 'Đã đổi tên lớp.' });
        }}
      />
      <ConfirmDialog
        open={archiving}
        title={archived ? 'Khôi phục lớp này?' : 'Lưu trữ lớp này?'}
        description={
          archived
            ? 'Lớp sẽ hoạt động trở lại và học viên lại thấy lớp cùng các bài đã giao.'
            : 'Học viên sẽ không còn thấy lớp và các mã mời tạm ngừng hoạt động. Dữ liệu lớp được giữ lại và bạn có thể khôi phục bất cứ lúc nào.'
        }
        confirmLabel={archived ? 'Khôi phục' : 'Lưu trữ'}
        tone={archived ? 'primary' : 'danger'}
        triggerRef={archiveRef}
        onClose={() => setArchiving(false)}
        onConfirm={async () => {
          await api.setArchived(!archived);
          toast.show({ tone: 'success', message: archived ? 'Đã khôi phục lớp.' : 'Đã lưu trữ lớp.' });
        }}
      />
    </div>
  );
}
