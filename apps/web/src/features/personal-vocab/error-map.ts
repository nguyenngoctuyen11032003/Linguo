import { PERSONAL_VOCAB_ERROR_CODES, PERSONAL_VOCAB_LIMITS as L } from '@linguo/shared';
import { isUnansweredError } from '@/features/lesson-player/error-map';
import { isNetworkError } from '@/lib/network-error';

type PersonalVocabErrorCode = (typeof PERSONAL_VOCAB_ERROR_CODES)[number];

const PERSONAL_MESSAGES: Record<PersonalVocabErrorCode, string> = {
  not_authenticated: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  list_not_found: 'Không tìm thấy danh sách này. Có thể nó đã bị xoá.',
  word_not_found: 'Không tìm thấy từ này. Có thể nó đã bị xoá.',
  invalid_name: `Tên danh sách cần từ 1 đến ${L.listName} ký tự.`,
  invalid_language: 'Hãy chọn tiếng Anh hoặc tiếng Hàn cho danh sách.',
  name_taken: 'Bạn đã có một danh sách trùng tên. Hãy đặt tên khác nhé.',
  list_limit: `Bạn đã có ${L.maxLists} danh sách, đó là mức tối đa. Hãy xoá bớt một danh sách trước khi tạo mới.`,
  list_full: `Danh sách này chỉ chứa tối đa ${L.maxWordsPerList} từ. Hãy tách phần còn lại sang một danh sách khác.`,
  vocab_full: `Tổng số từ cá nhân của bạn đã đạt mức tối đa ${L.maxWordsPerUser} từ. Hãy xoá bớt từ không cần nữa.`,
  invalid_rows: 'Không có dòng nào hợp lệ để nhập.',
  too_many_rows: `Mỗi lần chỉ nhập được tối đa ${L.maxRowsPerImport} dòng. Hãy tách file thành nhiều phần.`,
  rate_limited: `Bạn đã nhập khá nhiều rồi (tối đa ${L.maxImportsPerHour} lần mỗi giờ). Nghỉ một lát rồi thử lại nhé.`,
  invalid_term: `Từ cần có từ 1 đến ${L.term} ký tự.`,
  invalid_meaning: `Nghĩa cần có từ 1 đến ${L.meaning} ký tự.`,
  field_too_long: 'Ví dụ, ghi chú hoặc phát âm đang dài hơn mức cho phép.',
  duplicate_term: 'Trong danh sách này đã có từ đó rồi.',
  invalid_rating: 'Mức đánh giá không hợp lệ.',
  idempotency_conflict: 'Lượt chấm này đã được gửi với nội dung khác.',
  word_not_due: 'Từ này chưa đến lúc ôn đâu. Cứ để trí nhớ nghỉ ngơi một chút nhé.',
};

const MESSAGES: Record<string, string> = {
  ...PERSONAL_MESSAGES,
  invalid_payload: 'Dữ liệu từ vựng không hợp lệ. Vui lòng thử lại.',
  supabase_unavailable: 'Chưa cấu hình kết nối máy chủ.',
};

const NETWORK_MESSAGE = 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.';
const CODE_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

/** No server answer (offline, 15 s timeout) or 408/5xx: safe to retry with the same idempotency key. */
export { isUnansweredError };

function errorCode(error: object): string | null {
  if ('message' in error && typeof error.message === 'string' && CODE_PATTERN.test(error.message)) return error.message;
  if ('code' in error && typeof error.code === 'string' && error.code) return error.code;
  return null;
}

/** Vietnamese message for a personal vocabulary RPC failure. */
export function personalVocabErrorMessage(error: unknown): string {
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

/** Vietnamese text for a row-level reason reported by the CSV parser or import_personal_words. */
export const ROW_REASON_MESSAGES: Record<string, string> = {
  term_required: 'Thiếu từ',
  meaning_required: 'Thiếu nghĩa',
  term_too_long: `Từ dài quá ${L.term} ký tự`,
  meaning_too_long: `Nghĩa dài quá ${L.meaning} ký tự`,
  example_too_long: `Ví dụ dài quá ${L.example} ký tự`,
  note_too_long: `Ghi chú dài quá ${L.note} ký tự`,
  pronunciation_too_long: `Phát âm dài quá ${L.pronunciation} ký tự`,
  unterminated_quote: 'Dấu ngoặc kép chưa được đóng',
  line_too_long: 'Dòng quá dài',
  invalid_field: 'Giá trị không hợp lệ',
  not_an_object: 'Dòng không hợp lệ',
};

export function rowReasonMessage(reason: string): string {
  return ROW_REASON_MESSAGES[reason] ?? 'Dòng không hợp lệ';
}
