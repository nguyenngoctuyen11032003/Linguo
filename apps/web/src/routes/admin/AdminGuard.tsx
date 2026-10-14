import { useContext, type ReactNode } from 'react';
import type { StaffRole } from '@linguo/shared';
import { FullScreenLoader } from '@/components/layout/FullScreenLoader';
import { ErrorState } from '@/components/ui/ErrorState';
import { hasStaffRole } from '@/features/admin/service';
import { StaffRoleContext, useStaffRole } from '@/features/admin/useStaffRole';
import { isNetworkError } from '@/lib/network-error';
import { NotFoundPage } from '@/routes/NotFoundPage';

interface AdminGuardProps {
  children: ReactNode;
  /** Pages limited to a higher role (e.g. 'admin' for Nhật ký). */
  minRole?: StaffRole;
}

/**
 * Spec 11 §4: the admin area exists only for signed-in staff. Everyone else gets the ordinary 404 page, so the
 * route never reveals itself. Nested inside another guard (minRole pages), the role already verified is reused.
 */
export function AdminGuard({ children, minRole }: AdminGuardProps) {
  const outerRole = useContext(StaffRoleContext);
  const nested = outerRole !== null;
  const state = useStaffRole(!nested);

  if (nested) {
    if (minRole && !hasStaffRole(outerRole, minRole)) return <AdminForbidden />;
    return <>{children}</>;
  }

  if (state.status === 'loading') return <FullScreenLoader />;
  if (state.status === 'error' && isNetworkError(state.error)) {
    return (
      <main id="main" className="mx-auto w-full max-w-md px-safe py-10">
        <ErrorState onRetry={state.reload} />
      </main>
    );
  }
  const role = state.status === 'ready' ? state.role : null;
  if (!role || (minRole && !hasStaffRole(role, minRole))) return <NotFoundPage />;
  return <StaffRoleContext.Provider value={role}>{children}</StaffRoleContext.Provider>;
}

/** A staff member opened a page reserved for a higher role: they already know the admin area exists. */
function AdminForbidden() {
  return (
    <section aria-labelledby="admin-forbidden-title" className="rounded-3xl border border-border bg-surface-solid p-6 text-center">
      <h1 id="admin-forbidden-title" className="text-xl font-bold">
        Trang này chỉ dành cho quản trị viên
      </h1>
      <p className="mt-2 text-[15px] text-muted">Vai trò hiện tại của bạn chưa đủ quyền để xem nội dung này.</p>
    </section>
  );
}
