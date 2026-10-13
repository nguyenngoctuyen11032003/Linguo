import { InvalidServerResponseError, NetworkError } from './service';

const MESSAGES: Record<string, string> = {
  not_authenticated: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  lesson_not_found: 'Không tìm thấy bài học.',
  path_not_found: 'Không tìm thấy lộ trình.',
  lesson_not_in_path: 'Bài học này không thuộc lộ trình hiện tại.',
  run_not_found: 'Không tìm thấy lượt học của bài này.',
  run_not_active: 'Lượt học này đã kết thúc. Hãy mở lại bài để học tiếp.',
  exercise_not_in_lesson: 'Bài tập không thuộc bài học này.',
  exercise_version_mismatch: 'Bài tập vừa được cập nhật. Hãy mở lại bài để làm phiên bản mới.',
  invalid_response: 'Câu trả lời không hợp lệ.',
  rate_limited: 'Bạn đang nộp bài quá nhanh. Đợi vài giây rồi thử lại.',
  idempotency_conflict: 'Câu trả lời này đã được gửi với nội dung khác.',
  attempts_incomplete: 'Còn bài tập chưa hoàn thành trong bài học.',
  outbox_pending: 'Còn câu trả lời đang chờ đồng bộ. Bài học sẽ hoàn thành khi có mạng.',
  invalid_server_response: 'Máy chủ trả về dữ liệu không hợp lệ. Vui lòng thử lại sau.',
  lesson_unavailable_offline: 'Bạn đang ngoại tuyến và bài học này chưa được lưu trên máy.',
};

const NETWORK_MESSAGE = 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.';
const CODE_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

/** The snake_case code of an RPC/lesson-player error, or null. Network failures map to `network_error`. */
export function lessonErrorCode(error: unknown): string | null {
  if (error instanceof NetworkError || error instanceof TypeError) return 'network_error';
  if (error instanceof InvalidServerResponseError) return error.code;
  if (error && typeof error === 'object') {
    if ('message' in error && typeof error.message === 'string' && CODE_PATTERN.test(error.message)) return error.message;
    if ('code' in error && typeof error.code === 'string' && error.code) return error.code;
  }
  return null;
}

export function lessonErrorMessage(error: unknown): string {
  const code = lessonErrorCode(error);
  if (code === 'network_error') return NETWORK_MESSAGE;
  if (code) return MESSAGES[code] ?? `Đã có lỗi xảy ra (mã: ${code}). Vui lòng thử lại.`;
  return 'Đã có lỗi xảy ra. Vui lòng thử lại.';
}
