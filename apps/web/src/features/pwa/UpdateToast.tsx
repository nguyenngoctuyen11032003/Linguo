import { RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useLiftToasts } from '@/components/ui/toast-lift';
import { isBusyRoute } from './busy-route';
import { useSwUpdate } from './useSwUpdate';

export interface UpdateToastProps {
  /** Current location pathname; defaults to window.location.pathname. */
  pathname?: string;
}

/**
 * "Đã có phiên bản mới — Tải lại" (spec 10 §4). Reloads only when the learner taps the button; during a
 * lesson/exam/diagnostic/session it adds a hint to finish first. The live region is always mounted.
 */
export function UpdateToast({ pathname }: UpdateToastProps) {
  const { updateAvailable, applyUpdate, dismiss } = useSwUpdate();
  const busy = isBusyRoute(pathname ?? (typeof window === 'undefined' ? '' : window.location.pathname));
  // Shares the bottom slot with the app toasts: push them above this one while it shows.
  useLiftToasts(1, updateAvailable);

  return (
    <div
      role="status"
      aria-live="polite"
      className="dock-follow pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] z-[91] flex justify-center px-4 lg:bottom-6"
    >
      {updateAvailable && (
        <div
          data-testid="sw-update-toast"
          className="pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-2xl border border-border bg-surface-solid py-1.5 pl-4 pr-1 text-[15px] shadow-[var(--shadow-card)]"
        >
          <RefreshCw aria-hidden className="size-5 shrink-0 text-primary" />
          <div className="flex-1 py-1.5">
            <p className="font-semibold">Đã có phiên bản mới</p>
            {busy && <p className="text-sm text-muted">Bạn có thể tải lại sau khi làm xong bài.</p>}
          </div>
          <Button variant="primary" onClick={applyUpdate} className="shrink-0 px-4">
            Tải lại
          </Button>
          <button
            type="button"
            aria-label="Để sau"
            onClick={dismiss}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-text/5 hover:text-text"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
      )}
    </div>
  );
}
