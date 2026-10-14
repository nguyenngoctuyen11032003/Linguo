import { Bell } from 'lucide-react';
import { Link } from 'react-router';
import { unreadBadgeText, unreadLabel } from '@/features/notifications/format';
import { useUnreadNotificationCount } from '@/features/notifications/useNotifications';
import { cn } from '@/lib/cn';

export const NOTIFICATIONS_PATH = '/app/thong-bao';

/** Header/sidebar bell linking to the inbox, with an unread badge (1…9, then 9+) polled while the tab is visible. */
export function NotificationBell({ className }: { className?: string }) {
  const { count } = useUnreadNotificationCount();
  return (
    <Link
      to={NOTIFICATIONS_PATH}
      aria-label={unreadLabel(count)}
      className={cn(
        'relative inline-flex size-11 shrink-0 items-center justify-center rounded-full text-text transition-colors hover:bg-text/5',
        className,
      )}
    >
      <Bell aria-hidden className="size-5" />
      {count > 0 && (
        <span
          aria-hidden="true"
          data-testid="notification-badge"
          className="absolute right-0.5 top-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold leading-none text-on-primary ring-2 ring-surface-solid"
        >
          {unreadBadgeText(count)}
        </span>
      )}
    </Link>
  );
}
