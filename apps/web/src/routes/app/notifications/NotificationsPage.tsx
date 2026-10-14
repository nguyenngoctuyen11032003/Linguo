import { BarChart3, Bell, Layers, PlayCircle, Zap, type LucideIcon } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import type { AppNotification, NotificationKind } from '@linguo/shared';
import { Button, buttonClasses } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatRelativeTimeVi } from '@/features/notifications/format';
import { useNotifications } from '@/features/notifications/useNotifications';
import { cn } from '@/lib/cn';

const KIND_META: Record<NotificationKind, { icon: LucideIcon; label: string }> = {
  review_due: { icon: Layers, label: 'Ôn tập' },
  resume_lesson: { icon: PlayCircle, label: 'Học tiếp' },
  quick_check: { icon: Zap, label: 'Kiểm tra nhanh' },
  weekly_summary: { icon: BarChart3, label: 'Báo cáo tuần' },
};

/** action_url is always an internal /app/ path (contract); anything else falls back to Home. */
const safeTarget = (url: string) => (url.startsWith('/app/') && !url.startsWith('//') ? url : '/app');

function Title() {
  return <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">Thông báo</h1>;
}

function NotificationRow({ item, onOpen }: { item: AppNotification; onOpen: (item: AppNotification) => void }) {
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  const unread = !item.read_at;
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(item)}
        className={cn(
          'flex min-h-11 w-full items-start gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-text/5',
          'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/45',
          unread && 'bg-primary/8',
        )}
      >
        <span
          className={cn(
            'mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-xl',
            unread ? 'bg-primary/15 text-primary' : 'bg-text/8 text-muted',
          )}
        >
          <Icon aria-hidden className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className={cn('min-w-0 text-[15px] leading-snug', unread ? 'font-bold' : 'font-medium')}>{item.title_vi}</span>
            {unread && (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
                <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
                Chưa đọc
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-sm text-muted">{item.body_vi}</span>
          <span className="mt-1 block text-xs text-muted">
            <span className="sr-only">{meta.label} · </span>
            <time dateTime={item.created_at}>{formatRelativeTimeVi(item.created_at)}</time>
          </span>
        </span>
      </button>
    </li>
  );
}

/** /app/thong-bao: the in-app inbox (spec 10 §5). Opening a notification marks it clicked, then follows its action. */
export function NotificationsPage() {
  const { status, items, hasMore, loadingMore, error, loadMore, reload, markClicked } = useNotifications();
  const navigate = useNavigate();

  const open = (item: AppNotification) => {
    // The mark is optimistic: a slow or failed RPC never holds the learner back from the action.
    void markClicked(item.id);
    navigate(safeTarget(item.action_url));
  };

  if (status === 'loading') {
    return (
      <div className="space-y-6">
        <Title />
        <div role="status" className="space-y-3">
          <span className="sr-only">Đang tải thông báo…</span>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="block h-20 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="space-y-6">
        <Title />
        <ErrorState title="Không tải được thông báo" description={error ?? undefined} onRetry={reload} />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="space-y-6">
        <Title />
        <EmptyState
          icon={Bell}
          title="Chưa có thông báo nào"
          description="Khi đến giờ nhắc học hoặc có báo cáo tuần, Linguo sẽ báo cho bạn ở đây."
          action={
            <Link to="/app/cai-dat" className={buttonClasses('ghost')}>
              Cài đặt nhắc học
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Title />
      <ul aria-label="Danh sách thông báo" className="space-y-1 rounded-3xl border border-border bg-surface-solid p-2 shadow-[var(--shadow-card)]">
        {items.map((item) => (
          <NotificationRow key={item.id} item={item} onOpen={open} />
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-error-text">
          {error}
        </p>
      )}
      {hasMore && (
        <div className="flex justify-center">
          <Button variant="ghost" loading={loadingMore} onClick={() => void loadMore()}>
            Xem thêm
          </Button>
        </div>
      )}
    </div>
  );
}
