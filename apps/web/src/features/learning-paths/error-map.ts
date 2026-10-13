import { isNetworkError } from '@/lib/network-error';

const MESSAGES: Record<string, string> = {
  not_authenticated: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  path_exists_for_language: 'Bạn đã có lộ trình cho ngôn ngữ này.',
  invalid_language: 'Ngôn ngữ không hợp lệ.',
  invalid_start_point: 'Điểm xuất phát không hợp lệ.',
  invalid_goal_for_language: 'Mục tiêu không phù hợp với ngôn ngữ đã chọn.',
  invalid_level: 'Trình độ không hợp lệ.',
  target_not_above_current: 'Mục tiêu phải cao hơn trình độ hiện tại.',
  target_not_allowed_for_goal: 'Bậc mục tiêu không phù hợp với loại mục tiêu.',
  invalid_schedule: 'Lịch học không hợp lệ: mỗi ngày 0–720 phút và ít nhất một ngày học.',
  target_date_in_past: 'Ngày mục tiêu đã qua.',
  target_date_too_far: 'Ngày mục tiêu quá xa (tối đa 10 năm).',
  invalid_date: 'Ngày không hợp lệ.',
  path_not_found: 'Không tìm thấy lộ trình.',
  invalid_status_transition: 'Không thể chuyển trạng thái lộ trình như vậy.',
};

const CODE_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

/** A snake_case RPC message is the most specific code; otherwise fall back to the error's own `code` (e.g. a Postgres SQLSTATE). */
function errorCode(error: object): string | null {
  if ('message' in error && typeof error.message === 'string' && CODE_PATTERN.test(error.message)) return error.message;
  if ('code' in error && typeof error.code === 'string' && error.code) return error.code;
  return null;
}

export function learningPathErrorMessage(error: unknown): string {
  if (isNetworkError(error)) return 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.';
  if (error && typeof error === 'object') {
    if ('message' in error && typeof error.message === 'string') {
      const known = Object.hasOwn(MESSAGES, error.message) ? MESSAGES[error.message] : undefined;
      if (known) return known;
    }
    const code = errorCode(error);
    if (code) return `Đã có lỗi xảy ra (mã: ${code}). Vui lòng thử lại.`;
  }
  return 'Đã có lỗi xảy ra. Vui lòng thử lại.';
}
