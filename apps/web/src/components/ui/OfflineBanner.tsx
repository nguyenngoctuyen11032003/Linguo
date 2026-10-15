import { WifiOff } from 'lucide-react';
import { useOnline } from '@/lib/useOnline';

/**
 * Sits in the document flow above the page (never fixed), so the app bar's language pill, bell and avatar stay
 * uncovered while offline. Below ~26rem the full sentence stays the accessible text but leaves the screen, and a
 * shorter line keeps the reassurance visible (14 px, one line on a 320 px phone). The `role="status"` wrapper is
 * always mounted so assistive tech registers the live region before it changes.
 */
export function OfflineBanner() {
  const online = useOnline();
  return (
    <div role="status" aria-live="polite">
      {!online && (
        <div className="flex items-center justify-center gap-2 bg-warn px-3 pb-1.5 pt-[max(0.375rem,env(safe-area-inset-top,0px))] text-sm font-medium leading-snug text-[#1a1203]">
          <WifiOff aria-hidden className="size-4 shrink-0" />
          <span className="max-[26rem]:sr-only">Bạn đang ngoại tuyến — tiến độ sẽ được lưu khi có mạng</span>
          <span aria-hidden="true" className="hidden max-[26rem]:inline">
            Ngoại tuyến — sẽ tự lưu khi có mạng
          </span>
        </div>
      )}
    </div>
  );
}
