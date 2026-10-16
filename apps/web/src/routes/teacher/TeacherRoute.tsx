import { ArrowLeft, Presentation } from 'lucide-react';
import { Link, Outlet } from 'react-router';
import { buttonClasses } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { SolidCard } from '@/components/ui/SolidCard';
import { Spinner } from '@/components/ui/Spinner';
import { RequireAuth } from '@/features/auth/guards';
import { useIsTeacher } from '@/features/teacher/useIsTeacher';
import { asset } from '@/lib/asset';

/**
 * `/giao-vien` (PRD P2 "Công cụ giáo viên"): signed-in users with a teacher profile. Its own light shell (no learner
 * providers), loaded as a separate chunk so learners never download it.
 */
export function TeacherRoute() {
  return (
    <RequireAuth>
      <TeacherLayout />
    </RequireAuth>
  );
}

function TeacherLayout() {
  return (
    <div className="min-h-hero">
      <a href="#main" className="sr-only z-[100] rounded-full bg-primary px-4 py-2 text-on-primary focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Bỏ qua tới nội dung
      </a>
      <header className="glass sticky top-0 z-30 border-x-0 border-t-0 pt-safe">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-safe">
          <Link to="/giao-vien" className="inline-flex min-h-11 min-w-0 items-center gap-2 font-bold tracking-[-0.02em]">
            <img src={asset('brand/logo-mark.svg')} alt="" width={28} height={28} className="size-7 shrink-0" />
            <span>Linguo</span>
            <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-bold uppercase tracking-[0.08em] text-accent-text ring-1 ring-accent/30 ring-inset">Giáo viên</span>
          </Link>
          <Link to="/app" className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted hover:bg-text/5 hover:text-text">
            <ArrowLeft aria-hidden className="size-4" />
            <span>
              Về<span className="hidden sm:inline"> ứng dụng</span>
            </span>
          </Link>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl px-safe pb-16 pt-5">
        <TeacherGate />
      </main>
    </div>
  );
}

function TeacherGate() {
  const state = useIsTeacher();
  if (state.status === 'loading') {
    return (
      <div role="status" className="flex justify-center py-16">
        <Spinner />
        <span className="sr-only">Đang kiểm tra quyền giáo viên…</span>
      </div>
    );
  }
  if (state.status === 'error') {
    return <ErrorState title="Không kiểm tra được quyền giáo viên" onRetry={state.reload} headingLevel="h2" />;
  }
  if (!state.isTeacher) return <NotTeacher />;
  return <Outlet />;
}

/** Signed-in learner without a teacher profile: explain instead of a bare 404. */
function NotTeacher() {
  return (
    <SolidCard className="mx-auto flex max-w-lg flex-col items-center gap-3 px-6 py-10 text-center">
      <Presentation aria-hidden className="size-10 text-primary" />
      <h1 className="page-title text-[clamp(2rem,9vw,2.5rem)]">Khu vực dành cho giáo viên</h1>
      <p className="text-[15px] text-muted">
        Tài khoản của bạn chưa được cấp quyền giáo viên. Nếu bạn dạy học trên Linguo, hãy liên hệ đội ngũ Linguo để được mở quyền tạo lớp.
      </p>
      <Link to="/app" className={buttonClasses('primary')}>
        Về trang chủ
      </Link>
    </SolidCard>
  );
}
