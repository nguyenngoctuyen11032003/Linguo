import { TEACHER_LIMITS as L, type TeacherErrorCode } from '@linguo/shared';
import { genericErrorMessage } from '@/lib/error-fallback';
import { isNetworkError } from '@/lib/network-error';

// Vietnamese messages for the learner screens of the classes feature. Teacher-only codes are mapped too (a learner
// should never see them, but no raw code ever reaches the screen).

const CLASS_MESSAGES: Record<TeacherErrorCode, string> = {
  not_authenticated: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  teacher_forbidden: 'Chỉ giáo viên mới làm được việc này.',
  staff_forbidden: 'Bạn không có quyền làm việc này.',
  user_not_found: 'Không tìm thấy tài khoản này.',
  class_not_found: 'Không tìm thấy lớp này. Có thể lớp đã bị đóng.',
  class_archived: 'Lớp này đã được giáo viên đóng lại.',
  invalid_name: `Tên lớp cần từ 1 đến ${L.className} ký tự.`,
  name_taken: 'Đã có một lớp trùng tên.',
  invalid_language: 'Ngôn ngữ của lớp không hợp lệ.',
  class_limit: `Đã đạt mức tối đa ${L.maxActiveClasses} lớp đang mở.`,
  invite_limit: 'Lớp này đã có quá nhiều mã mời đang dùng.',
  invite_not_found: 'Không tìm thấy mã mời này.',
  invalid_expiry: 'Thời hạn của mã mời không hợp lệ.',
  invalid_max_uses: 'Số lượt dùng của mã mời không hợp lệ.',
  member_not_found: 'Học viên này không còn trong lớp.',
  invalid_kind: 'Loại bài giao không hợp lệ.',
  invalid_ref: 'Không tìm thấy bài học hoặc đề thi này.',
  invalid_target: 'Số thẻ cần ôn không hợp lệ.',
  invalid_due: 'Hạn nộp không hợp lệ.',
  note_too_long: `Ghi chú dài quá ${L.note} ký tự.`,
  assignment_limit: 'Lớp này đã có quá nhiều bài giao.',
  assignment_not_found: 'Không tìm thấy bài giao này. Có thể giáo viên đã xoá nó.',
  own_class: 'Đây là lớp do chính bạn tạo, nên bạn không cần tham gia với tư cách học viên.',
  class_full: `Lớp này đã đủ ${L.maxMembersPerClass} học viên. Hãy báo giáo viên của bạn nhé.`,
  join_limit: `Bạn đang ở trong ${L.maxClassesPerLearner} lớp, đó là mức tối đa. Hãy rời một lớp cũ trước khi tham gia lớp mới.`,
  rate_limited: `Bạn đã thử nhập mã nhiều lần (tối đa ${L.maxJoinAttemptsPerHour} lần mỗi giờ). Nghỉ một lát rồi thử lại nhé.`,
  not_member: 'Bạn không còn ở trong lớp này.',
};

const MESSAGES: Record<string, string> = {
  ...CLASS_MESSAGES,
  invalid_payload: 'Dữ liệu lớp học không hợp lệ. Vui lòng thử lại.',
  supabase_unavailable: 'Chưa cấu hình kết nối máy chủ.',
};

export const CLASS_NETWORK_MESSAGE = 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại nhé.';

/** Shown when learner_join_class answers {status: 'invalid_code'}. */
export const INVALID_CODE_MESSAGE = 'Mã này không đúng, đã hết hạn hoặc đã đủ lượt dùng. Hãy hỏi giáo viên mã mới nhé.';

/** Shown before calling the server when the typed code cannot be an invite code. */
export const CODE_SHAPE_MESSAGE = `Mã lớp gồm ${L.codeLength} chữ cái và chữ số, ví dụ ABCD-EFGH.`;

const CODE_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

/** Vietnamese message for a classes RPC failure (never the raw code). */
export function classErrorMessage(error: unknown): string {
  if (isNetworkError(error)) return CLASS_NETWORK_MESSAGE;
  if (error && typeof error === 'object') {
    if ('message' in error && typeof error.message === 'string') {
      const known = MESSAGES[error.message];
      if (known) return known;
      if (CODE_PATTERN.test(error.message)) return genericErrorMessage(error.message);
    }
    if ('code' in error && typeof error.code === 'string' && error.code) return genericErrorMessage(error.code);
  }
  return genericErrorMessage();
}
