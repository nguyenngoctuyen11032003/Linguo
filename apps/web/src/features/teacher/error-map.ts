import { TEACHER_LIMITS as L, type TeacherErrorCode } from '@linguo/shared';
import { genericErrorMessage } from '@/lib/error-fallback';
import { isNetworkError } from '@/lib/network-error';

const TEACHER_MESSAGES: Record<TeacherErrorCode, string> = {
  not_authenticated: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  teacher_forbidden: 'Tài khoản của bạn chưa được cấp quyền giáo viên.',
  staff_forbidden: 'Bạn không có quyền thực hiện thao tác này.',
  user_not_found: 'Không tìm thấy tài khoản này.',
  class_not_found: 'Không tìm thấy lớp này. Có thể lớp đã bị xoá hoặc không thuộc về bạn.',
  class_archived: 'Lớp đã được lưu trữ. Hãy khôi phục lớp trước khi tạo mã mời hoặc giao bài.',
  invalid_name: `Tên lớp cần từ 1 đến ${L.className} ký tự.`,
  name_taken: 'Bạn đã có một lớp đang hoạt động trùng tên. Hãy đặt tên khác nhé.',
  invalid_language: 'Hãy chọn ngôn ngữ cho lớp.',
  class_limit: `Bạn đang có ${L.maxActiveClasses} lớp hoạt động, đó là mức tối đa. Hãy lưu trữ bớt một lớp trước.`,
  invite_limit: `Mỗi lớp chỉ có tối đa ${L.maxActiveInvitesPerClass} mã mời còn hiệu lực. Hãy thu hồi bớt một mã.`,
  invite_not_found: 'Không tìm thấy mã mời này.',
  invalid_expiry: `Thời hạn mã mời cần từ ${L.inviteMinHours} giờ đến ${L.inviteMaxHours / 24} ngày.`,
  invalid_max_uses: `Số lượt dùng cần từ 1 đến ${L.inviteMaxUses}.`,
  member_not_found: 'Học viên này không còn trong lớp.',
  invalid_kind: 'Loại bài giao không hợp lệ.',
  invalid_ref: 'Bài học hoặc đề thi này không còn khả dụng cho ngôn ngữ của lớp.',
  invalid_target: `Số lượt ôn cần từ 1 đến ${L.reviewTargetMax}.`,
  invalid_exam_mode: 'Đề này không có phần học viên cần làm. Hãy chọn cách làm khác hoặc một phần có câu hỏi.',
  invalid_due: `Hạn nộp cần ở tương lai và không quá ${L.dueMaxDays} ngày tới.`,
  note_too_long: `Ghi chú tối đa ${L.note} ký tự.`,
  assignment_limit: `Mỗi lớp có tối đa ${L.maxAssignmentsPerClass} bài giao. Hãy xoá bớt bài cũ.`,
  assignment_not_found: 'Không tìm thấy bài giao này. Có thể nó đã bị xoá.',
  own_class: 'Bạn là giáo viên của lớp này.',
  class_full: `Lớp đã đủ ${L.maxMembersPerClass} học viên.`,
  join_limit: `Mỗi học viên tham gia tối đa ${L.maxClassesPerLearner} lớp.`,
  rate_limited: 'Bạn thao tác hơi nhiều. Nghỉ một lát rồi thử lại nhé.',
  not_member: 'Bạn không còn là thành viên của lớp này.',
};

const MESSAGES: Record<string, string> = {
  ...TEACHER_MESSAGES,
  invalid_payload: 'Dữ liệu lớp học không hợp lệ. Vui lòng thử lại.',
  supabase_unavailable: 'Chưa cấu hình kết nối máy chủ.',
};

const NETWORK_MESSAGE = 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.';
const CODE_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

/** Server code of an RPC failure ("class_archived"), or null. */
export function teacherErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  if ('message' in error && typeof error.message === 'string' && (Object.hasOwn(MESSAGES, error.message) || CODE_PATTERN.test(error.message))) return error.message;
  return null;
}

/** Vietnamese message for a teacher RPC failure; never shows a raw code. */
export function teacherErrorMessage(error: unknown): string {
  if (isNetworkError(error)) return NETWORK_MESSAGE;
  const code = teacherErrorCode(error);
  if (code && Object.hasOwn(MESSAGES, code)) return MESSAGES[code] as string;
  return genericErrorMessage(code);
}
