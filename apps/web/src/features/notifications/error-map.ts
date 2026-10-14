import type { NotificationErrorCode } from '@linguo/shared';
import { isNetworkError } from '@/lib/network-error';

const NOTIFICATION_MESSAGES: Record<NotificationErrorCode, string> = {
  not_authenticated: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  invalid_prefs: 'Cài đặt nhắc học chưa hợp lệ. Kiểm tra lại giờ và ngày nhắc.',
  invalid_subscription: 'Không đăng ký được thông báo trên thiết bị này. Vui lòng thử lại.',
  notification_not_found: 'Thông báo này không còn nữa.',
  invalid_action: 'Thao tác không hợp lệ. Vui lòng thử lại.',
};

/** Client-side codes thrown by push.ts. */
export const PUSH_MESSAGES = {
  push_unsupported: 'Trình duyệt này chưa hỗ trợ thông báo thiết bị.',
  push_not_configured: 'Thông báo thiết bị chưa được bật cho bản Linguo này.',
  push_sw_unavailable: 'Chưa sẵn sàng nhận thông báo. Tải lại trang rồi thử lần nữa.',
  push_subscribe_failed: 'Không đăng ký được thông báo trên thiết bị này. Vui lòng thử lại.',
} as const;

const MESSAGES: Record<string, string> = {
  ...NOTIFICATION_MESSAGES,
  ...PUSH_MESSAGES,
  invalid_payload: 'Dữ liệu thông báo không hợp lệ. Vui lòng thử lại.',
  supabase_unavailable: 'Chưa cấu hình kết nối máy chủ.',
};

const NETWORK_MESSAGE = 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.';
const CODE_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

function errorCode(error: object): string | null {
  if ('message' in error && typeof error.message === 'string' && CODE_PATTERN.test(error.message)) return error.message;
  if ('code' in error && typeof error.code === 'string' && error.code) return error.code;
  return null;
}

/** Vietnamese message for a notification RPC or push failure. */
export function notificationErrorMessage(error: unknown): string {
  if (isNetworkError(error)) return NETWORK_MESSAGE;
  if (error && typeof error === 'object') {
    if ('message' in error && typeof error.message === 'string') {
      const known = MESSAGES[error.message];
      if (known) return known;
    }
    const code = errorCode(error);
    if (code) return `Đã có lỗi xảy ra (mã: ${code}). Vui lòng thử lại.`;
  }
  return 'Đã có lỗi xảy ra. Vui lòng thử lại.';
}
