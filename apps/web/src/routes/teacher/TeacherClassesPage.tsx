import { useRef, useState } from 'react';
import { Archive, ChevronRight, Plus, Users } from 'lucide-react';
import { Link } from 'react-router';
import { TEACHER_LIMITS as L, type TeacherClass } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { CLASS_LANGUAGE_LABELS } from '@/features/teacher/format';
import { useTeacherClasses } from '@/features/teacher/useTeacherClasses';
import { ClassFormDialog } from './ClassFormDialog';

/** /giao-vien: the teacher's classes (PRD P2). */
export function TeacherClassesPage() {
  const api = useTeacherClasses();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const createRef = useRef<HTMLButtonElement>(null);
  const active = api.classes.filter((c) => c.archived_at === null);
  const archived = api.classes.filter((c) => c.archived_at !== null);
  const atLimit = active.length >= L.maxActiveClasses;

  let content;
  if (api.status === 'loading') {
    content = (
      <div role="status" className="space-y-3">
        <span className="sr-only">Đang tải danh sách lớp…</span>
        <Skeleton className="block h-24 w-full rounded-3xl" />
        <Skeleton className="block h-24 w-full rounded-3xl" />
      </div>
    );
  } else if (api.status === 'error' && api.classes.length === 0) {
    content = <ErrorState title="Không tải được danh sách lớp" description={api.error ?? undefined} onRetry={api.reload} />;
  } else if (api.classes.length === 0) {
    content = (
      <EmptyState
        icon={Users}
        title="Chưa có lớp nào"
        description="Tạo một lớp, gửi mã mời cho học viên, rồi giao bài học, đề luyện thi hoặc lượt ôn tập và theo dõi tiến độ chung của cả lớp."
        action={
          <Button variant="accent" onClick={() => setCreating(true)}>
            <Plus aria-hidden className="size-5" />
            Tạo lớp đầu tiên
          </Button>
        }
      />
    );
  } else {
    content = (
      <>
        {api.status === 'error' && (
          <p role="alert" className="rounded-2xl bg-error/10 px-4 py-3 text-[15px] text-error-text ring-1 ring-error/40 ring-inset">
            {api.error}{' '}
            <button type="button" onClick={api.reload} className="min-h-11 font-semibold underline">
              Thử lại
            </button>
          </p>
        )}
        {active.length > 0 ? (
          <section aria-labelledby="active-classes-title" className="space-y-3">
            <h2 id="active-classes-title" className="eyebrow px-1">
              Lớp đang hoạt động ({active.length})
            </h2>
            <ClassList classes={active} />
          </section>
        ) : (
          <p className="text-[15px] text-muted">Không có lớp nào đang hoạt động. Hãy tạo lớp mới hoặc khôi phục một lớp đã lưu trữ.</p>
        )}
        {archived.length > 0 && (
          <details className="group card">
            <summary className="flex min-h-13 cursor-pointer list-none items-center gap-2 rounded-3xl px-5 text-[15px] font-semibold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40 [&::-webkit-details-marker]:hidden">
              <Archive aria-hidden className="size-5 text-muted" />
              <span className="flex-1">Lớp đã lưu trữ ({archived.length})</span>
              <ChevronRight aria-hidden className="size-5 text-muted transition-transform group-open:rotate-90" />
            </summary>
            <div className="px-3 pb-3">
              <ClassList classes={archived} />
            </div>
          </details>
        )}
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title">Lớp học của tôi</h1>
          <p className="mt-2 max-w-prose text-[15px] text-muted">
            Bạn chỉ thấy số liệu tổng hợp của học viên. Câu trả lời, hội thoại với AI và từ vựng riêng của họ luôn được giữ kín.
          </p>
        </div>
        {api.classes.length > 0 && (
          <Button ref={createRef} disabled={atLimit} onClick={() => setCreating(true)}>
            <Plus aria-hidden className="size-5" />
            Tạo lớp
          </Button>
        )}
      </div>
      {atLimit && <p className="text-sm text-muted">Bạn đang có {L.maxActiveClasses} lớp hoạt động, mức tối đa. Hãy lưu trữ bớt một lớp để tạo mới.</p>}
      {content}
      <ClassFormDialog
        open={creating}
        mode="create"
        triggerRef={createRef}
        onClose={() => setCreating(false)}
        onSubmit={async (name, language) => {
          await api.create(name, language);
          toast.show({ tone: 'success', message: 'Đã tạo lớp. Mở lớp để tạo mã mời cho học viên nhé!' });
        }}
      />
    </div>
  );
}

function ClassList({ classes }: { classes: TeacherClass[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {classes.map((c) => (
        <li key={c.id} className="min-w-0">
          <div className="card">
            <Link
              to={`/giao-vien/lop/${c.id}`}
              className="group flex min-h-20 items-center gap-3.5 rounded-[1.75rem] py-3.5 pl-3.5 pr-3 transition-[background-color,scale] hover:bg-text/[0.03] active:scale-[0.99]"
            >
              <span aria-hidden="true" className="flex h-14 min-w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-primary/10 px-2 text-primary ring-1 ring-primary/20 ring-inset">
                <span className="stat-num text-[26px] leading-none">{c.member_count}</span>
                <span className="mt-0.5 text-[12px] font-semibold leading-none text-muted">học viên</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 break-words text-[16px] font-bold leading-snug tracking-[-0.01em]">{c.name}</span>
                <span className="mt-0.5 block text-[13px] text-muted">
                  {CLASS_LANGUAGE_LABELS[c.language_code]} · {c.member_count} học viên · {c.assignment_count} bài giao
                  {c.archived_at === null && c.invites.length > 0 ? ` · ${c.invites.length} mã mời` : ''}
                </span>
              </span>
              <ChevronRight aria-hidden className="size-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
