import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export interface NotificationOpenToastProps {
  /** True while a tapped notification waits for the learner to leave a lesson, exam or session. */
  open: boolean;
  onOpen: () => void;
  onDismiss: () => void;
}

/**
 * "Bạn có thông báo mới — Mở". Shown instead of navigating when a notification is tapped while the learner is in the
 * middle of a lesson, exam or session (isBusyRoute): the app never leaves such a page on its own, like UpdateToast
 * never reloads it. The live region is always mounted so the toast is announced when it appears.
 */
export function NotificationOpenToast({ open, onOpen, onDismiss }: NotificationOpenToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(10rem+env(safe-area-inset-bottom,0px))] z-[91] flex justify-center px-4 lg:bottom-24"
    >
      {open && (
        <div
          data-testid="notification-open-toast"
          className="pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-2xl border border-border bg-surface-solid py-1.5 pl-4 pr-1 text-[15px] shadow-[var(--shadow-card)]"
        >
          <Bell aria-hidden className="size-5 shrink-0 text-primary" />
          <div className="flex-1 py-1.5">
            <p className="font-semibold">Bạn có thông báo mới</p>
            <p className="text-sm text-muted">Mở sau khi làm xong bài cũng được.</p>
          </div>
          <Button variant="primary" onClick={onOpen} className="shrink-0 px-4">
            Mở
          </Button>
          <button
            type="button"
            aria-label="Để sau"
            onClick={onDismiss}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-text/5 hover:text-text"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
      )}
    </div>
  );
}
