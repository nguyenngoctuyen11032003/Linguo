import { useEffect, useRef, useState } from 'react';
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

const KIND_META: Record<NotificationKind, { icon: LucideIcon; label: string; tone: string }> = {
  review_due: { icon: Layers, label: 'Ôn tập', tone: 'bg-primary/12 text-primary' },
  resume_lesson: { icon: PlayCircle, label: 'Học tiếp', tone: 'bg-accent/12 text-accent-text' },
  quick_check: { icon: Zap, label: 'Kiểm tra nhanh', tone: 'bg-gold/15 text-text' },
  weekly_summary: { icon: BarChart3, label: 'Báo cáo tuần', tone: 'bg-success/12 text-success-text' },
};

/** action_url is always an internal /app/ path (contract); anything else falls back to Home. */
const safeTarget = (url: string) => (url.startsWith('/app/') && !url.startsWith('//') ? url : '/app');

function Title({ unread = 0 }: { unread?: number }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <h1 className="page-title">Thông báo</h1>
      {unread > 0 && (
        <p aria-hidden="true" className="flex shrink-0 flex-col items-end pb-1">
          <span className="stat-num text-[40px] text-primary">{unread}</span>
          <span className="eyebrow mt-1">chưa đọc</span>
        </p>
      )}
    </div>
  );
}

function NotificationRow({ item, onOpen }: { item: AppNotification; onOpen: (item: AppNotification) => void }) {
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  const unread = !item.read_at;
  return (
    <li>
      <button
        type="button"
        data-notification-id={item.id}
        onClick={() => onOpen(item)}
        className={cn(
          'flex min-h-11 w-full items-start gap-3 rounded-[1.25rem] px-3 py-3.5 text-left transition-[background-color,scale] duration-150 hover:bg-text/5 active:scale-[0.99]',
          'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/45',
        )}
      >
        <span
          className={cn(
            'relative mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-full',
            unread ? meta.tone : 'bg-text/6 text-muted',
          )}
        >
          <Icon aria-hidden className="size-5" strokeWidth={1.75} />
          {unread && (
            // A dot on the icon instead of a word beside the title, so a long title keeps the full row width at 320 px.
            <span
              data-testid="unread-dot"
              aria-hidden="true"
              className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-accent ring-2 ring-surface-solid"
            />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block text-[15px] leading-snug', unread ? 'font-bold' : 'font-medium text-muted')}>
            {item.title_vi}
            {unread && <span className="sr-only"> — Chưa đọc</span>}
          </span>
          <span className="mt-0.5 block text-[13px] leading-snug text-muted">{item.body_vi}</span>
          <span className="mt-1.5 block text-xs font-semibold text-muted">
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

  const listRef = useRef<HTMLUListElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  // "Xem thêm" disables itself while loading, which drops keyboard focus: once the page is in, focus the first
  // older notification (or give focus back to the button when nothing new came, e.g. after an error).
  const focusAfter = useRef<string | null>(null);
  const [loadedTick, setLoadedTick] = useState(0);

  const showMore = async () => {
    focusAfter.current = items[items.length - 1]?.id ?? null;
    await loadMore();
    setLoadedTick((n) => n + 1);
  };

  useEffect(() => {
    const lastId = focusAfter.current;
    if (loadedTick === 0 || lastId === null) return;
    focusAfter.current = null;
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button[data-notification-id]') ?? []);
    const index = rows.findIndex((row) => row.dataset.notificationId === lastId);
    const target = rows[index + 1] ?? moreRef.current ?? rows[rows.length - 1];
    target?.focus();
  }, [loadedTick]);

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
      <Title unread={items.filter((i) => !i.read_at).length} />
      <ul ref={listRef} aria-label="Danh sách thông báo" className="card divide-y divide-border px-1.5 py-1">
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
          <Button ref={moreRef} variant="ghost" loading={loadingMore} onClick={() => void showMore()}>
            Xem thêm
          </Button>
        </div>
      )}
    </div>
  );
}
