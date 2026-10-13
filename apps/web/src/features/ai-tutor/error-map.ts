import type { AiError, AiErrorCode } from '@linguo/shared';
import { isNetworkError } from '@/lib/network-error';

// Vietnamese copy for `ai-tutor` failures (spec 5 §3/§5). The server's `message` is for logs, never shown.

const AI_MESSAGES: Record<AiErrorCode, string> = {
  bad_request: 'Câu hỏi chưa hợp lệ hoặc quá dài. Hãy rút gọn rồi thử lại.',
  unauthorized: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  quota_exceeded: 'Bạn đã dùng hết lượt hỏi AI hôm nay.',
  ai_unavailable: 'Gia sư AI tạm thời không khả dụng. Bạn vẫn có thể xem lời giải thích soạn sẵn.',
  invalid_output: 'AI chưa đưa ra được câu trả lời hợp lệ. Hãy thử lại hoặc hỏi cách khác.',
};

const HOUR_MINUTE = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** "HH:mm" of an ISO instant in `timeZone` (default: the device's), or null when it is not a valid date. */
export function formatResetTime(iso: string, timeZone?: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  let format = HOUR_MINUTE;
  if (timeZone) {
    try {
      format = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone });
    } catch {
      format = HOUR_MINUTE;
    }
  }
  return format.format(date);
}

export interface AiErrorMessageOptions {
  /** Zone used to show the quota reset time; defaults to the device's zone. */
  timeZone?: string;
}

/** Vietnamese message for an `ai-tutor` error, with the quota reset time or the retry delay when known. */
export function aiErrorMessage(error: AiError | AiErrorCode, options: AiErrorMessageOptions = {}): string {
  const e: AiError = typeof error === 'string' ? { error, message: '', retry_after_sec: null, quota: null } : error;
  const base = AI_MESSAGES[e.error] ?? 'Đã có lỗi xảy ra. Vui lòng thử lại.';
  if (e.error === 'quota_exceeded') {
    const at = e.quota ? formatResetTime(e.quota.resets_at, options.timeZone) : null;
    return at ? `${base} Lượt mới sẽ có lúc ${at}.` : `${base} Lượt mới sẽ có vào ngày mai.`;
  }
  if (e.error === 'ai_unavailable' && e.retry_after_sec !== null && e.retry_after_sec > 0) {
    const minutes = Math.ceil(e.retry_after_sec / 60);
    const wait = e.retry_after_sec < 60 ? `${e.retry_after_sec} giây` : `${minutes} phút`;
    return `${base} Thử lại sau khoảng ${wait}.`;
  }
  return base;
}

const RPC_MESSAGES: Record<string, string> = {
  not_authenticated: AI_MESSAGES.unauthorized,
  usage_not_found: 'Không tìm thấy câu trả lời AI cần báo lỗi.',
  invalid_reason: 'Lý do báo lỗi không hợp lệ.',
  invalid_note: 'Ghi chú quá dài (tối đa 500 ký tự).',
  already_reported: 'Bạn đã báo lỗi câu trả lời này rồi.',
  invalid_payload: 'Dữ liệu từ máy chủ không hợp lệ. Vui lòng thử lại.',
  supabase_unavailable: 'Chưa cấu hình kết nối máy chủ.',
};

const NETWORK_MESSAGE = 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.';
const CODE_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

/** Vietnamese message for a failure of the AI RPCs (quota status, privacy notice, report). */
export function aiRpcErrorMessage(error: unknown): string {
  if (isNetworkError(error)) return NETWORK_MESSAGE;
  if (error && typeof error === 'object') {
    const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
    const known = RPC_MESSAGES[message];
    if (known) return known;
    if (CODE_PATTERN.test(message)) return `Đã có lỗi xảy ra (mã: ${message}). Vui lòng thử lại.`;
    if ('code' in error && typeof error.code === 'string' && error.code) {
      return `Đã có lỗi xảy ra (mã: ${error.code}). Vui lòng thử lại.`;
    }
  }
  return 'Đã có lỗi xảy ra. Vui lòng thử lại.';
}
