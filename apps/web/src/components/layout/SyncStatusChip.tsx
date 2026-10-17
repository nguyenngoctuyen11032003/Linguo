import { useContext } from 'react';
import { CircleAlert, CloudOff, RefreshCw, TriangleAlert } from 'lucide-react';
import { OutboxSyncContext, type SyncStatus } from '@/features/lesson-player/OutboxSyncProvider';
import { syncReportMessage, type SyncReportEntry } from '@/features/lesson-player/sync-report';
import { useOnline } from '@/lib/useOnline';

const STRIP =
  'flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-border px-3 py-1.5 text-sm leading-snug';
const ACTION =
  '-my-1 inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 font-semibold text-primary underline-offset-4 hover:underline disabled:opacity-60';

/** The line of the strip for what is waiting to sync; null when nothing is. Exported for tests. */
export function syncStatusText(status: SyncStatus, online: boolean): string | null {
  if (status.pending <= 0) return null;
  if (status.syncing) return `Đang đồng bộ ${status.pending} mục…`;
  if (status.failing && online) return `Chưa gửi được ${status.pending} mục, sẽ tự thử lại`;
  if (!online) return `${status.pending} mục sẽ được gửi khi có mạng`;
  return `Đang chờ đồng bộ ${status.pending} mục`;
}

function Report({ report, onDismiss }: { report: SyncReportEntry; onDismiss: () => void }) {
  return (
    <div role="alert" className={`${STRIP} bg-error/10 text-error-text`}>
      <span className="inline-flex items-center gap-1.5">
        <CircleAlert aria-hidden className="size-4 shrink-0" />
        {syncReportMessage(report)}
      </span>
      <button type="button" onClick={onDismiss} className={ACTION}>
        Đã hiểu
      </button>
    </div>
  );
}

/**
 * Global sync status in the app shell (one strip in the document flow, nothing when everything is synced): how many
 * queued items (lesson answers, run start/completion, review grades, personal vocabulary grades) still wait for the
 * server, a "Đồng bộ ngay" action, the failing state, a warning for items close to the 7-day expiry, and the persisted
 * report of work the server refused or that expired. Renders nothing outside OutboxSyncProvider.
 */
export function SyncStatusChip() {
  const sync = useContext(OutboxSyncContext);
  const online = useOnline();
  if (!sync) return null;
  const { status, flushAll, reports, dismissReport } = sync;
  const text = syncStatusText(status, online);
  const report = reports[reports.length - 1];

  if (!text && status.expiring <= 0 && !report) return null;
  return (
    <div data-testid="sync-status">
      {report && <Report report={report} onDismiss={() => dismissReport(report.id)} />}
      {text && (
        <div role="status" aria-live="polite" className={`${STRIP} ${status.failing && online ? 'bg-warn/15 text-text' : 'bg-text/[0.04] text-muted'}`}>
          <span className="inline-flex items-center gap-1.5">
            {online ? <RefreshCw aria-hidden className={`size-4 shrink-0 ${status.syncing ? 'animate-spin' : ''}`} /> : <CloudOff aria-hidden className="size-4 shrink-0" />}
            {text}
          </span>
          {online && !status.syncing && (
            <button type="button" onClick={() => void flushAll()} className={ACTION}>
              Đồng bộ ngay
            </button>
          )}
        </div>
      )}
      {status.expiring > 0 && (
        <div role="status" className={`${STRIP} bg-warn/15 text-text`}>
          <span className="inline-flex items-center gap-1.5">
            <TriangleAlert aria-hidden className="size-4 shrink-0" />
            {status.expiring} câu sắp hết hạn gửi. Hãy kết nối mạng sớm để không mất kết quả.
          </span>
        </div>
      )}
    </div>
  );
}
