import { useEffect, useSyncExternalStore } from 'react';
import { CloudCheck, X } from 'lucide-react';
import { useLiftToasts } from '@/components/ui/toast-lift';
import { offlineReadyStore } from './offline-ready';

/** Long enough to read two short lines, short enough to never nag. */
export const OFFLINE_READY_TOAST_MS = 8000;

/**
 * "Sẵn sàng dùng ngoại tuyến": shown once after the very first service-worker install. Same slot as UpdateToast; the
 * live region is always mounted so assistive tech registers it before the text appears.
 */
export function OfflineReadyToast() {
  const { offlineReady } = useSyncExternalStore(offlineReadyStore.subscribe, offlineReadyStore.getSnapshot, offlineReadyStore.getSnapshot);
  useLiftToasts(1, offlineReady);

  useEffect(() => {
    if (!offlineReady) return;
    const timer = setTimeout(offlineReadyStore.dismiss, OFFLINE_READY_TOAST_MS);
    return () => clearTimeout(timer);
  }, [offlineReady]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="dock-follow pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] z-[91] flex justify-center px-4 lg:bottom-6"
    >
      {offlineReady && (
        <div
          data-testid="offline-ready-toast"
          className="pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-2xl border border-border bg-surface-solid py-1.5 pl-4 pr-1 text-[15px] shadow-[var(--shadow-card)]"
        >
          <CloudCheck aria-hidden className="size-5 shrink-0 text-success" />
          <div className="flex-1 py-1.5">
            <p className="font-semibold">Sẵn sàng dùng ngoại tuyến</p>
            <p className="text-sm text-muted">Linguo đã được lưu trên thiết bị này, mở được cả khi không có mạng.</p>
          </div>
          <button
            type="button"
            aria-label="Đóng"
            onClick={offlineReadyStore.dismiss}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-text/5 hover:text-text"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
      )}
    </div>
  );
}
