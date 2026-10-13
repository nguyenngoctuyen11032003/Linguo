import type { DIAGNOSTIC_ERROR_CODES } from '@linguo/shared';
import { isUnansweredError } from '@/features/lesson-player/error-map';
import { formatDateVi, todayIso } from '@/lib/dates';
import { isNetworkError } from '@/lib/network-error';

type DiagnosticErrorCode = (typeof DIAGNOSTIC_ERROR_CODES)[number];

const DIAGNOSTIC_MESSAGES: Record<DiagnosticErrorCode, string> = {
  not_authenticated: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  path_not_found: 'Không tìm thấy lộ trình.',
  diagnostic_cooldown: 'Bạn vừa làm bài kiểm tra gần đây. Hãy học thêm một thời gian rồi làm lại nhé.',
  bank_unavailable: 'Bài kiểm tra cho ngôn ngữ này chưa sẵn sàng. Vui lòng quay lại sau.',
  attempt_not_found: 'Không tìm thấy lượt kiểm tra. Hãy bắt đầu lại.',
  attempt_not_active: 'Lượt kiểm tra này đã kết thúc. Hãy mở lại bài kiểm tra.',
  item_mismatch: 'Câu hỏi đã thay đổi. Đang tải lại câu hiện tại.',
  already_answered: 'Câu này đã được trả lời. Đang tải câu tiếp theo.',
  invalid_choice: 'Phương án đã chọn không hợp lệ.',
  invalid_skill: 'Kỹ năng không hợp lệ.',
  invalid_reason: 'Lý do bỏ qua không hợp lệ.',
  attempt_not_completed: 'Bài kiểm tra chưa hoàn thành nên chưa có kết quả.',
  already_applied: 'Kết quả này đã được áp dụng cho lộ trình.',
};

const MESSAGES: Record<string, string> = {
  ...DIAGNOSTIC_MESSAGES,
  invalid_payload: 'Dữ liệu bài kiểm tra không hợp lệ. Vui lòng thử lại.',
  supabase_unavailable: 'Chưa cấu hình kết nối máy chủ.',
};

const NETWORK_MESSAGE = 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.';
const CODE_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;
const TIMESTAMP_PATTERN = /\d{4}-\d{2}-\d{2}(?:[T ][0-9:.]+(?:Z|[+-]\d{2}(?::?\d{2})?)?)?/;

/** No server answer (offline, 15 s timeout) or 408/5xx: the same request can be resent. */
export { isUnansweredError };

export interface DiagnosticErrorContext {
  /** `retake_after` from diagnostic_status, used when the cooldown error itself carries no date. */
  retakeAfter?: string | null;
  /** IANA zone for the retake date; defaults to the browser's. */
  timeZone?: string;
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh';
  } catch {
    return 'Asia/Ho_Chi_Minh';
  }
}

/** "dd/mm/yyyy" of a timestamp (or a plain date) in `timeZone`; null when it does not parse. */
export function formatRetakeDate(value: string, timeZone: string = browserTimeZone()): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDateVi(value);
  // Postgres text form ("2026-10-27 10:00:00+07") → ISO 8601.
  const date = new Date(value.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'));
  if (Number.isNaN(date.getTime())) return null;
  return formatDateVi(todayIso(timeZone, date));
}

/** The retake timestamp the server may attach to `diagnostic_cooldown` (details or hint). */
function cooldownDate(error: object): string | null {
  for (const field of ['details', 'hint'] as const) {
    if (field in error) {
      const value = (error as Record<string, unknown>)[field];
      if (typeof value === 'string') {
        const match = TIMESTAMP_PATTERN.exec(value);
        if (match) return match[0];
      }
    }
  }
  return null;
}

/** The snake_case code of an RPC failure, if any (e.g. 'item_mismatch'). */
export function diagnosticErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  if ('message' in error && typeof error.message === 'string' && CODE_PATTERN.test(error.message)) return error.message;
  if ('code' in error && typeof error.code === 'string' && error.code) return error.code;
  return null;
}

/** Vietnamese message for a diagnostic RPC failure; `diagnostic_cooldown` names the date the test can be retaken. */
export function diagnosticErrorMessage(error: unknown, context: DiagnosticErrorContext = {}): string {
  if (isNetworkError(error)) return NETWORK_MESSAGE;
  if (error && typeof error === 'object') {
    if ('message' in error && typeof error.message === 'string') {
      if (error.message === 'diagnostic_cooldown') {
        const raw = cooldownDate(error) ?? context.retakeAfter ?? null;
        const date = raw ? formatRetakeDate(raw, context.timeZone) : null;
        if (date) return `Bạn vừa làm bài kiểm tra gần đây. Bạn có thể làm lại từ ngày ${date}.`;
      }
      const known = MESSAGES[error.message];
      if (known) return known;
    }
    const code = diagnosticErrorCode(error);
    if (code) return `Đã có lỗi xảy ra (mã: ${code}). Vui lòng thử lại.`;
  }
  return 'Đã có lỗi xảy ra. Vui lòng thử lại.';
}
