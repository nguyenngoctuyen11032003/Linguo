import { CloudOff } from 'lucide-react';
import { formatUpdatedAt } from '@/lib/read-cache';

/**
 * Quiet hint above data that is the last copy saved on this device because the server cannot be reached
 * ("Đang hiện bản đã lưu trên máy. Cập nhật lúc 14:05."). Renders nothing for fresh data.
 */
export function StaleNote({ stale, updatedAt, className }: { stale?: boolean; updatedAt?: number | null; className?: string }) {
  if (!stale) return null;
  return (
    <p role="note" className={className ?? 'flex items-center gap-1.5 text-sm text-muted'}>
      <CloudOff aria-hidden className="size-4 shrink-0" />
      <span>Đang hiện bản đã lưu trên máy.{updatedAt ? ` ${formatUpdatedAt(updatedAt)}.` : ''}</span>
    </p>
  );
}
