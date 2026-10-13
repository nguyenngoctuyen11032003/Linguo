import type { ProgressErrorCode } from '@linguo/shared';
import { isNetworkError } from '@/lib/network-error';

const PROGRESS_MESSAGES: Record<ProgressErrorCode, string> = {
  not_authenticated: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  path_not_found: 'Không tìm thấy lộ trình.',
  invalid_range: 'Khoảng thời gian không hợp lệ.',
  invalid_event: 'Dữ liệu sự kiện không hợp lệ.',
  rate_limited: 'Bạn đang thao tác quá nhanh. Đợi một chút rồi thử lại.',
};

const MESSAGES: Record<string, string> = {
  ...PROGRESS_MESSAGES,
  invalid_payload: 'Dữ liệu tiến độ không hợp lệ. Vui lòng thử lại.',
  supabase_unavailable: 'Chưa cấu hình kết nối máy chủ.',
  NO_ROWS_UPDATED: 'Không lưu được cài đặt. Vui lòng thử lại.',
};

const NETWORK_MESSAGE = 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.';
const CODE_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

function errorCode(error: object): string | null {
  if ('message' in error && typeof error.message === 'string' && CODE_PATTERN.test(error.message)) return error.message;
  if ('code' in error && typeof error.code === 'string' && error.code) return error.code;
  return null;
}

/** Vietnamese message for a progress RPC / preferences failure. */
export function progressErrorMessage(error: unknown): string {
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
