const MESSAGES: Record<string, string> = {
  not_authenticated: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  path_exists_for_language: 'Bạn đã có lộ trình cho ngôn ngữ này.',
  invalid_language: 'Ngôn ngữ không hợp lệ.',
  invalid_start_point: 'Điểm xuất phát không hợp lệ.',
  invalid_goal_for_language: 'Mục tiêu không phù hợp với ngôn ngữ đã chọn.',
  invalid_level: 'Trình độ không hợp lệ.',
  target_not_above_current: 'Mục tiêu phải cao hơn trình độ hiện tại.',
  target_not_allowed_for_goal: 'Bậc mục tiêu không phù hợp với loại mục tiêu.',
  invalid_schedule: 'Lịch học không hợp lệ: mỗi ngày 0–720 phút và ít nhất một ngày học.',
  target_date_in_past: 'Ngày mục tiêu đã qua.',
  target_date_too_far: 'Ngày mục tiêu quá xa (tối đa 10 năm).',
  path_not_found: 'Không tìm thấy lộ trình.',
  invalid_status_transition: 'Không thể chuyển trạng thái lộ trình như vậy.',
};

export function learningPathErrorMessage(error: unknown): string {
  if (error instanceof TypeError) return 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.';
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    const known = MESSAGES[error.message];
    if (known) return known;
  }
  return 'Đã có lỗi xảy ra. Vui lòng thử lại.';
}
