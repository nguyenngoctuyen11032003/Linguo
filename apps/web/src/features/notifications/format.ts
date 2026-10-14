const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "Vừa xong", "5 phút trước", "3 giờ trước", "Hôm qua", "4 ngày trước", then dd/mm/yyyy. */
export function formatRelativeTimeVi(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  const time = at.getTime();
  if (Number.isNaN(time)) return '';
  const diff = Math.max(0, now.getTime() - time);
  if (diff < MINUTE) return 'Vừa xong';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} phút trước`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} giờ trước`;
  const days = Math.floor(diff / DAY);
  if (days === 1) return 'Hôm qua';
  if (days < 7) return `${days} ngày trước`;
  const dd = String(at.getDate()).padStart(2, '0');
  const mm = String(at.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${at.getFullYear()}`;
}

/** Badge text: 1…9, then "9+". */
export function unreadBadgeText(count: number): string {
  return count > 9 ? '9+' : String(count);
}

/** Accessible name of the bell: "Thông báo" or "Thông báo, 3 thông báo chưa đọc" / "hơn 9 thông báo chưa đọc". */
export function unreadLabel(count: number): string {
  if (count <= 0) return 'Thông báo';
  return `Thông báo, ${count > 9 ? 'hơn 9' : count} thông báo chưa đọc`;
}
