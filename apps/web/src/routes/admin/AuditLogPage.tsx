import { ScrollText } from 'lucide-react';
import type { StaffRole } from '@linguo/shared';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { ADMIN_KIND_LABELS_VI, STAFF_ROLE_LABELS_VI } from '@/features/admin/service';
import { useAdminAudit } from '@/features/admin/useAdminAudit';

// Every action written through admin_private.audit in supabase/migrations; unknown ones fall back to the raw code.
const ACTION_LABELS: Record<string, string> = {
  set_status: 'Chuyển trạng thái',
  resolve_reports: 'Xử lý báo lỗi',
  read_answers: 'Xem đáp án',
  grant_role: 'Cấp vai trò',
  revoke_role: 'Thu hồi vai trò',
  list_staff: 'Xem danh sách nhân sự',
  find_user: 'Tìm người dùng',
  grant_teacher: 'Cấp quyền giáo viên',
  revoke_teacher: 'Thu hồi quyền giáo viên',
  list_teachers: 'Xem danh sách giáo viên',
  list_staff_history: 'Xem lịch sử cấp quyền',
};

const TARGET_LABELS: Record<string, string> = {
  ...ADMIN_KIND_LABELS_VI,
  content_report: 'Báo lỗi nội dung',
  user: 'Người dùng',
  staff: 'Nhân sự',
  teacher: 'Giáo viên',
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'medium' });
};

const roleLabel = (role: string | null) => (role ? (STAFF_ROLE_LABELS_VI[role as StaffRole] ?? role) : '—');

function detailText(detail: Record<string, unknown>): string {
  const entries = Object.entries(detail);
  if (entries.length === 0) return '—';
  return entries.map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' · ');
}

/** Spec 11 §4 "Nhật ký": recent admin_audit_log rows (admin only, enforced by the route guard and the RPC). */
export function AuditLogPage() {
  const { status, data, error, reload } = useAdminAudit();

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-[-0.02em]">Nhật ký quản trị</h1>
      {status === 'error' && !data ? (
        <ErrorState description={error ?? undefined} onRetry={reload} />
      ) : !data ? (
        <div role="status" aria-label="Đang tải nhật ký" className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <EmptyState icon={ScrollText} title="Chưa có thao tác nào" description="Các thao tác thay đổi dữ liệu của quản trị viên sẽ xuất hiện ở đây." />
      ) : (
        <div tabIndex={0} role="region" aria-label="Các thao tác gần đây" className="overflow-x-auto rounded-3xl border border-border bg-surface-solid focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40">
          {/* Focusable so keyboard users can scroll the wide table (axe scrollable-region-focusable). */}
          <table className="w-full min-w-[640px] text-left text-[15px]">
            <caption className="px-4 pt-4 text-left font-semibold">Các thao tác gần đây</caption>
            <thead className="text-sm text-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Thời gian
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Thao tác
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Người thực hiện
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Đối tượng
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Chi tiết
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((entry) => (
                <tr key={entry.id} className="border-t border-border align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    <time dateTime={entry.created_at}>{formatDate(entry.created_at)}</time>
                  </td>
                  <th scope="row" className="px-4 py-3 font-medium">
                    {ACTION_LABELS[entry.action] ?? entry.action}
                  </th>
                  <td className="px-4 py-3">
                    {roleLabel(entry.actor_role)}
                    {entry.actor && <span className="block font-mono text-xs text-muted">{entry.actor.slice(0, 8)}</span>}
                  </td>
                  <td className="px-4 py-3">
                    {entry.target_kind ? (TARGET_LABELS[entry.target_kind] ?? entry.target_kind) : '—'}
                    {entry.target_id && <span className="block break-all font-mono text-xs text-muted">{entry.target_id}</span>}
                  </td>
                  <td className="max-w-md break-words px-4 py-3 text-sm text-muted">{detailText(entry.detail)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
