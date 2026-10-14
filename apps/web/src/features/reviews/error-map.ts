import type { REVIEW_ERROR_CODES } from '@linguo/shared';
import { isUnansweredError } from '@/features/lesson-player/error-map';
import { isNetworkError } from '@/lib/network-error';

type ReviewErrorCode = (typeof REVIEW_ERROR_CODES)[number];

const REVIEW_MESSAGES: Record<ReviewErrorCode, string> = {
  not_authenticated: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  path_not_found: 'Không tìm thấy lộ trình.',
  path_not_active: 'Lộ trình này đang tạm dừng. Hãy bật lại lộ trình để ôn tập.',
  card_not_found: 'Không tìm thấy thẻ ôn tập.',
  card_suspended: 'Thẻ này đang tạm ẩn.',
  card_not_due: 'Thẻ này chưa đến lúc ôn đâu. Cứ để trí nhớ nghỉ ngơi một chút, Linguo sẽ nhắc bạn đúng lúc nhé.',
  invalid_rating: 'Mức đánh giá không hợp lệ.',
  idempotency_conflict: 'Lượt chấm này đã được gửi với nội dung khác.',
  rate_limited: 'Bạn đang chấm quá nhanh. Đợi một chút rồi thử lại.',
  postpone_limit: 'Thẻ này đã được hoãn quá nhiều lần. Hãy ôn nó hôm nay nhé.',
};

const MESSAGES: Record<string, string> = {
  ...REVIEW_MESSAGES,
  invalid_payload: 'Dữ liệu ôn tập không hợp lệ. Vui lòng thử lại.',
  supabase_unavailable: 'Chưa cấu hình kết nối máy chủ.',
  /** The review outbox could not be written (storage full or blocked). */
  outbox_unavailable: 'Không lưu được lượt chấm trên thiết bị để gửi sau (bộ nhớ trình duyệt đầy hoặc bị chặn). Khi có mạng, hãy chấm lại.',
};

const NETWORK_MESSAGE = 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.';
const CODE_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

/** Same rule as the lesson player: no server answer (offline, 15 s timeout) or 408/5xx → resend later. */
export { isUnansweredError };

function errorCode(error: object): string | null {
  if ('message' in error && typeof error.message === 'string' && CODE_PATTERN.test(error.message)) return error.message;
  if ('code' in error && typeof error.code === 'string' && error.code) return error.code;
  return null;
}

/** Vietnamese message for a review RPC failure. */
export function reviewErrorMessage(error: unknown): string {
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
