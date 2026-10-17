import type { SyncStatus } from '@/features/lesson-player/OutboxSyncProvider';

/** The line of the strip for what is waiting to sync; null when nothing is. Exported for tests. */
export function syncStatusText(status: SyncStatus, online: boolean): string | null {
  if (status.pending <= 0) return null;
  if (status.syncing) return `Đang đồng bộ ${status.pending} mục…`;
  if (status.failing && online) return `Chưa gửi được ${status.pending} mục, sẽ tự thử lại`;
  if (!online) return `${status.pending} mục sẽ được gửi khi có mạng`;
  return `Đang chờ đồng bộ ${status.pending} mục`;
}
