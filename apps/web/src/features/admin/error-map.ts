import type { AdminErrorCode } from '@linguo/shared';
import { isNetworkError } from '@/lib/network-error';

const ADMIN_MESSAGES: Record<AdminErrorCode, string> = {
  not_authenticated: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  staff_forbidden: 'Bạn không có quyền thực hiện thao tác này.',
  invalid_kind: 'Loại nội dung không hợp lệ.',
  content_not_found: 'Không tìm thấy nội dung.',
  invalid_status_transition: 'Không thể chuyển sang trạng thái này từ trạng thái hiện tại.',
  open_wrong_answer_reports: 'Nội dung còn báo lỗi "Đáp án sai" đang mở. Hãy xử lý báo lỗi trước khi xuất bản.',
  invalid_report_status: 'Trạng thái báo lỗi không hợp lệ.',
  invalid_range: 'Khoảng thời gian không hợp lệ.',
  invalid_role: 'Vai trò không hợp lệ.',
};

const MESSAGES: Record<string, string> = {
  ...ADMIN_MESSAGES,
  // Raised by the admin RPCs beyond ADMIN_ERROR_CODES (admin_resolve_report, admin_grant_role).
  note_too_long: 'Ghi chú quá dài (tối đa 500 ký tự).',
  user_not_found: 'Không tìm thấy người dùng này.',
  invalid_payload: 'Dữ liệu trả về không hợp lệ. Vui lòng thử lại.',
  supabase_unavailable: 'Chưa cấu hình kết nối máy chủ.',
};

const NETWORK_MESSAGE = 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.';
const CODE_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

/** The P0001 message (or other code) of an RPC failure, when there is one. */
export function adminErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  if ('message' in error && typeof error.message === 'string' && CODE_PATTERN.test(error.message)) return error.message;
  if ('code' in error && typeof error.code === 'string' && error.code) return error.code;
  return null;
}

/** Vietnamese message for an admin RPC failure. */
export function adminErrorMessage(error: unknown): string {
  if (isNetworkError(error)) return NETWORK_MESSAGE;
  if (error && typeof error === 'object') {
    if ('message' in error && typeof error.message === 'string') {
      const known = MESSAGES[error.message];
      if (known) return known;
    }
    const code = adminErrorCode(error);
    if (code) return `Đã có lỗi xảy ra (mã: ${code}). Vui lòng thử lại.`;
  }
  return 'Đã có lỗi xảy ra. Vui lòng thử lại.';
}
