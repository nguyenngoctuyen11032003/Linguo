import { resolveTimeZone } from '@/lib/dates';

const UNTIL_FORMAT: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' };

/** Vietnamese message for a failed profile save; the timezone may change only once per 24 hours (server rule). */
export function profileSaveErrorMessage(error: unknown, timeZone: string): string {
  if (error && typeof error === 'object' && 'message' in error && error.message === 'timezone_change_cooldown') {
    const until = 'details' in error && typeof error.details === 'string' ? new Date(error.details) : null;
    const when =
      until && !Number.isNaN(until.getTime())
        ? ` Bạn có thể đổi lại sau ${until.toLocaleString('vi-VN', { ...UNTIL_FORMAT, timeZone: resolveTimeZone(timeZone) })}.`
        : '';
    return `Múi giờ chỉ được đổi một lần mỗi 24 giờ.${when}`;
  }
  return 'Chưa lưu được hồ sơ. Kiểm tra mạng rồi thử lại.';
}
