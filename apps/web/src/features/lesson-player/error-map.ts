import type { LESSON_ERROR_CODES } from '@linguo/shared';
import { genericErrorMessage } from '@/lib/error-fallback';
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
  invalid_cursor: 'Vị trí bài học không hợp lệ. Hãy mở lại bài học.',
  run_id_conflict: 'Lượt học này bị trùng với một lượt khác. Hãy mở lại bài học.',
  too_many_lessons: 'Yêu cầu tải bài học không hợp lệ. Vui lòng thử lại.',
  invalid_lessons: 'Yêu cầu tải bài học không hợp lệ. Vui lòng thử lại.',
};

const MESSAGES: Record<string, string> = {
  ...LESSON_MESSAGES,
  /** Offline and the lesson was never downloaded to this device. */
  lesson_not_downloaded: 'Bài học này chưa được tải về máy. Hãy kết nối mạng, hoặc tải bài về từ trang Học tập khi có mạng.',
  invalid_payload: 'Dữ liệu bài học không hợp lệ. Vui lòng thử lại.',
  supabase_unavailable: 'Chưa cấu hình kết nối máy chủ.',
  /** The offline outbox could not be written (storage full or blocked). */
  outbox_unavailable: 'Không lưu được câu trả lời trên thiết bị để gửi sau (bộ nhớ trình duyệt đầy hoặc bị chặn). Khi có mạng, hãy nộp lại.',
};

const NETWORK_MESSAGE = 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.';
const CODE_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

/**
 * The server never graded the request: no answer (offline, DNS, the 15 s timeout) or a gateway/server failure
 * (408, 5xx) after it was sent. A submit failing this way is resent later with the same idempotency key, which
 * the server replays if it did grade it after all.
 */
export function isUnansweredError(error: unknown): boolean {
  if (isNetworkError(error)) return true;
  if (!error || typeof error !== 'object' || !('status' in error) || typeof error.status !== 'number') return false;
  return error.status === 408 || error.status >= 500;
}

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
    if (code) return genericErrorMessage(code);
  }
  return genericErrorMessage();
}
