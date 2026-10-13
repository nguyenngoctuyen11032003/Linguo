import type { LESSON_ERROR_CODES } from '@linguo/shared';
import { isNetworkError } from '@/lib/network-error';

type LessonErrorCode = (typeof LESSON_ERROR_CODES)[number];

const LESSON_MESSAGES: Record<LessonErrorCode, string> = {
  not_authenticated: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  lesson_not_found: 'Không tìm thấy bài học.',
  path_not_found: 'Không tìm thấy lộ trình.',
  lesson_not_in_path: 'Bài học này không thuộc lộ trình hiện tại.',
  run_not_found: 'Không tìm thấy lượt học. Hãy mở lại bài học.',
  run_not_active: 'Lượt học này đã kết thúc. Hãy mở lại bài học.',
  exercise_not_in_lesson: 'Bài tập không thuộc bài học này.',
  exercise_version_mismatch: 'Bài tập vừa được cập nhật. Hãy tải lại bài học.',
  invalid_response: 'Câu trả lời không hợp lệ.',
  idempotency_conflict: 'Câu trả lời này đã được gửi với nội dung khác.',
  rate_limited: 'Bạn đang gửi quá nhanh. Đợi một chút rồi thử lại.',
  attempts_incomplete: 'Còn bài tập chưa có kết quả. Hãy hoàn thành trước khi kết thúc bài.',
};

const MESSAGES: Record<string, string> = {
  ...LESSON_MESSAGES,
  invalid_payload: 'Dữ liệu bài học không hợp lệ. Vui lòng thử lại.',
  supabase_unavailable: 'Chưa cấu hình kết nối máy chủ.',
};

const NETWORK_MESSAGE = 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.';
const CODE_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

/** A snake_case RPC message is the most specific code; otherwise fall back to the error's own `code`. */
function errorCode(error: object): string | null {
  if ('message' in error && typeof error.message === 'string' && CODE_PATTERN.test(error.message)) return error.message;
  if ('code' in error && typeof error.code === 'string' && error.code) return error.code;
  return null;
}

export function lessonErrorMessage(error: unknown): string {
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
