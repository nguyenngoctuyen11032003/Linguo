import type { SessionErrorCode } from '@linguo/shared';
import { genericErrorMessage } from '@/lib/error-fallback';
import { isNetworkError } from '@/lib/network-error';

const SESSION_MESSAGES: Record<SessionErrorCode, string> = {
  not_authenticated: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  path_not_found: 'Không tìm thấy lộ trình.',
  path_not_active: 'Lộ trình này đang tạm dừng. Hãy bật lại lộ trình để học.',
  session_not_found: 'Không tìm thấy phiên học. Hãy tải lại trang.',
  session_closed: 'Phiên học này đã kết thúc. Bạn có thể tạo phiên mới.',
  invalid_plan: 'Kế hoạch phiên học không hợp lệ. Hãy thử lập lại.',
  invalid_order: 'Thứ tự hoạt động không hợp lệ. Hãy tải lại trang rồi thử lại.',
  item_not_found: 'Không tìm thấy hoạt động này trong phiên học.',
};

const MESSAGES: Record<string, string> = {
  ...SESSION_MESSAGES,
  invalid_payload: 'Dữ liệu phiên học không hợp lệ. Vui lòng thử lại.',
  supabase_unavailable: 'Chưa cấu hình kết nối máy chủ.',
  /** The planner could not build a plan from the inputs. */
  planner_failed: 'Chưa lập được kế hoạch cho hôm nay. Vui lòng thử lại.',
};

const NETWORK_MESSAGE = 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.';
const CODE_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

function errorCode(error: object): string | null {
  if ('message' in error && typeof error.message === 'string' && CODE_PATTERN.test(error.message)) return error.message;
  if ('code' in error && typeof error.code === 'string' && error.code) return error.code;
  return null;
}

/** True when the server refused because the learning path is paused (get_session_inputs / save_session_plan). */
export function isPathPaused(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'message' in error && error.message === 'path_not_active';
}

/** Vietnamese message for a session planner RPC failure. */
export function sessionErrorMessage(error: unknown): string {
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
