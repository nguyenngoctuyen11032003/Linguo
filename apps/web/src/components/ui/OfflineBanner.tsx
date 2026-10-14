import { WifiOff } from 'lucide-react';
import { useOnline } from '@/lib/useOnline';

/**
 * Sits in the document flow above the page (never fixed), so the app bar's language pill, bell and avatar stay
 * uncovered while offline. Below ~23rem the tail of the sentence stays in the accessible text but leaves the screen,
 * keeping the banner to one line at 320 px. The `role="status"` wrapper is always mounted so assistive tech
 * registers the live region before it changes.
 */
export function OfflineBanner() {
  const online = useOnline();
  return (
    <div role="status" aria-live="polite">
      {!online && (
        <div className="flex items-center justify-center gap-2 bg-warn px-4 pb-1.5 pt-[max(0.375rem,env(safe-area-inset-top,0px))] text-[13px] font-medium leading-snug text-[#1a1203] sm:text-sm">
          <WifiOff aria-hidden className="size-4 shrink-0" />
          <span>
            Bạn đang ngoại tuyến
            <span className="max-[23rem]:sr-only"> — tiến độ sẽ được lưu khi có mạng</span>
          </span>
        </div>
      )}
    </div>
  );
}
