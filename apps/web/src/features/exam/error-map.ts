import type { ExamErrorCode } from '@linguo/shared';
import { isUnansweredError } from '@/features/lesson-player/error-map';
import { genericErrorMessage } from '@/lib/error-fallback';
import { isNetworkError } from '@/lib/network-error';

const EXAM_MESSAGES: Record<ExamErrorCode, string> = {
  not_authenticated: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  path_not_found: 'Không tìm thấy lộ trình.',
  form_not_found: 'Không tìm thấy đề luyện thi này.',
  language_mismatch: 'Đề này không cùng ngôn ngữ với lộ trình hiện tại.',
  invalid_mode: 'Chế độ luyện thi không hợp lệ.',
  attempt_not_found: 'Không tìm thấy lượt làm bài. Hãy bắt đầu lại.',
  attempt_closed: 'Lượt làm bài này đã kết thúc.',
  question_not_in_attempt: 'Câu hỏi không thuộc lượt làm bài này.',
  answer_too_long: 'Câu trả lời quá dài so với giới hạn cho phép.',
  idempotency_conflict: 'Câu trả lời này đã được lưu với nội dung khác. Hãy tải lại trang.',
  rate_limited: 'Bạn đã bắt đầu quá nhiều lượt thi trong một giờ. Đợi một lúc rồi thử lại.',
};

const MESSAGES: Record<string, string> = {
  ...EXAM_MESSAGES,
  invalid_payload: 'Dữ liệu bài thi không hợp lệ. Vui lòng thử lại.',
  supabase_unavailable: 'Chưa cấu hình kết nối máy chủ.',
  /** Local: submit refused because answers are still queued while offline. */
  answers_unsaved: 'Mất kết nối nên chưa lưu được hết câu trả lời. Kiểm tra mạng rồi nộp lại.',
};

const NETWORK_MESSAGE = 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.';
const CODE_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

/** No server answer (offline, 15 s timeout) or 408/5xx: the same request can be resent. */
export { isUnansweredError };

/** The snake_case code of an RPC failure, if any (e.g. 'attempt_closed'). */
export function examErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  if ('message' in error && typeof error.message === 'string' && CODE_PATTERN.test(error.message)) return error.message;
  if ('code' in error && typeof error.code === 'string' && error.code) return error.code;
  return null;
}

/** Vietnamese message for an exam RPC failure. */
export function examErrorMessage(error: unknown): string {
  if (isNetworkError(error)) return NETWORK_MESSAGE;
  if (error && typeof error === 'object') {
    if ('message' in error && typeof error.message === 'string') {
      const known = MESSAGES[error.message];
      if (known) return known;
    }
    const code = examErrorCode(error);
    if (code) return genericErrorMessage(code);
  }
  return genericErrorMessage();
}
