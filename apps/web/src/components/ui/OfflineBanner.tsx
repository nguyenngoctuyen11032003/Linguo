import { WifiOff } from 'lucide-react';
import { useOnline } from '@/lib/useOnline';

/** The `role="status"` wrapper is always mounted so assistive tech registers the live region before it changes. */
export function OfflineBanner() {
  const online = useOnline();
  return (
    <div role="status" aria-live="polite">
      {!online && (
        <div className="fixed inset-x-0 top-0 z-[95] flex items-center justify-center gap-2 bg-warn px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top,0px))] text-sm font-medium text-[#1a1203]">
          <WifiOff aria-hidden className="size-4 shrink-0" />
          Bạn đang ngoại tuyến — tiến độ sẽ được lưu khi có mạng
        </div>
      )}
    </div>
  );
}
