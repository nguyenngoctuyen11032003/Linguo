import { useId } from 'react';
import { History } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { STAFF_ROLE_LABELS_VI } from '@/features/admin/service';
import { describeHistoryEntry } from '@/features/admin/staff';
import { useAdminStaffHistory } from '@/features/admin/useAdminStaff';

const formatTime = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
};

/**
 * "Lịch sử cấp quyền" on /quan-tri/nhan-su: who granted or revoked which role or teacher status and when, newest first,
 * a page at a time (admin_staff_history). `refreshKey` changes after each change made on the page.
 */
export function HistorySection({ refreshKey }: { refreshKey: number }) {
  const titleId = useId();
  const history = useAdminStaffHistory(refreshKey);
  const { status, entries, total, error, loadingMore, hasMore, loadMore, reload } = history;

  return (
    <section aria-labelledby={titleId} className="space-y-3">
      <div className="space-y-1">
        <h2 id={titleId} className="text-lg font-semibold">
          Lịch sử cấp quyền
        </h2>
        <p className="text-[15px] text-muted">Ai đã cấp hoặc thu hồi vai trò và quyền giáo viên, vào lúc nào. Bản đầy đủ mọi thao tác nằm ở trang Nhật ký.</p>
      </div>
      {status === 'error' && entries.length === 0 ? (
        <ErrorState title="Không tải được lịch sử" description={error ?? undefined} onRetry={reload} headingLevel="h3" />
      ) : status === 'loading' && entries.length === 0 ? (
        <div role="status" aria-label="Đang tải lịch sử cấp quyền" className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <EmptyState icon={History} title="Chưa có thay đổi nào" description="Mỗi lần cấp hoặc thu hồi vai trò và quyền giáo viên sẽ được ghi lại ở đây." />
      ) : (
        <>
          <ol aria-label="Lịch sử cấp quyền" aria-busy={status === 'loading' || undefined} className="rounded-3xl border border-border bg-surface-solid">
            {entries.map((entry) => (
              <li key={entry.id} className="space-y-0.5 border-t border-border px-4 py-3 first:border-t-0">
                <p className="break-words text-[15px]">{describeHistoryEntry(entry, (role) => STAFF_ROLE_LABELS_VI[role])}</p>
                <p className="text-sm text-muted">
                  <time dateTime={entry.created_at}>{formatTime(entry.created_at)}</time>
                </p>
              </li>
            ))}
          </ol>
          {error && (
            <p role="alert" className="text-[15px] text-error-text">
              {error}
            </p>
          )}
          <p className="px-1 text-sm text-muted">
            Đang hiện {entries.length} trên {total} thay đổi.
          </p>
          {hasMore && (
            <Button variant="ghost" block loading={loadingMore} onClick={loadMore}>
              Xem thêm
            </Button>
          )}
        </>
      )}
    </section>
  );
}
