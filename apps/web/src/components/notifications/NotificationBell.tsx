import { useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { Link } from 'react-router';
import { unreadBadgeText, unreadLabel } from '@/features/notifications/format';
import { useUnreadNotificationCount } from '@/features/notifications/useNotifications';
import { cn } from '@/lib/cn';
import { playSound } from '@/lib/sound';

export const NOTIFICATIONS_PATH = '/app/thong-bao';

/** Header/sidebar bell linking to the inbox, with an unread badge (1…9, then 9+) polled while the tab is visible. */
export function NotificationBell({ className }: { className?: string }) {
  const { status, count } = useUnreadNotificationCount();
  // Chime only when the unread count grows after the first load, i.e. something new arrived while the app is open.
  const lastCount = useRef<number | null>(null);
  useEffect(() => {
    if (status !== 'ready') return;
    if (lastCount.current !== null && count > lastCount.current) playSound('notify');
    lastCount.current = count;
  }, [status, count]);
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
          className="absolute right-0.5 top-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold leading-none tabular-nums text-on-primary ring-2 ring-surface-solid"
        >
          {unreadBadgeText(count)}
        </span>
      )}
    </Link>
  );
}
