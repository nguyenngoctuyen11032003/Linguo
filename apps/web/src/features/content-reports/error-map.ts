import type { ContentReportErrorCode } from '@linguo/shared';
import { isNetworkError } from '@/lib/network-error';

const REPORT_MESSAGES: Record<ContentReportErrorCode, string> = {
  not_authenticated: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  invalid_target: 'Không thể báo lỗi cho nội dung này.',
  target_not_found: 'Không tìm thấy nội dung này. Có thể nó vừa được cập nhật.',
  invalid_reason: 'Hãy chọn một lý do báo lỗi.',
  note_too_long: 'Ghi chú tối đa 500 ký tự.',
  rate_limited: 'Bạn đã gửi nhiều báo lỗi hôm nay, thử lại vào ngày mai nhé',
};

const MESSAGES: Record<string, string> = {
  ...REPORT_MESSAGES,
  invalid_payload: 'Dữ liệu báo lỗi không hợp lệ. Vui lòng thử lại.',
  supabase_unavailable: 'Chưa cấu hình kết nối máy chủ.',
};

const NETWORK_MESSAGE = 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.';
const CODE_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

function errorCode(error: object): string | null {
  if ('message' in error && typeof error.message === 'string' && CODE_PATTERN.test(error.message)) return error.message;
  if ('code' in error && typeof error.code === 'string' && error.code) return error.code;
  return null;
}

/** Vietnamese message for a report_content / list_my_reports failure. */
export function contentReportErrorMessage(error: unknown): string {
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
