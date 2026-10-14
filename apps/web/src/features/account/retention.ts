/**
 * What Linguo keeps and for how long. Shared by Settings › "Tài khoản và dữ liệu" and /quyen-rieng-tu so the two
 * never disagree; the numbers mirror ai_cache's TTL and purge_expired_data (spec 7 §1).
 */
export const RETENTION = {
  aiUsageDays: 90,
  aiQuotaDays: 60,
  aiCacheDays: 30,
  /** purge_notifications() (REMINDER_RULES.retention_days), run nightly by notify-dispatch. */
  notificationInboxDays: 90,
} as const;

/** Contact for privacy and account requests. Plain constant (no env) so the public pages always render it. */
export const CONTACT_EMAIL = 'lienhe@linguo.app';

export const STORED_DATA_SUMMARY = [
  'Tài khoản: email, tên hiển thị, múi giờ và tuỳ chọn giao diện.',
  'Tiến độ học: lộ trình, kết quả kiểm tra đầu vào, câu trả lời trong bài học, lịch sử ôn thẻ và ước lượng kỹ năng.',
  'Lượt dùng AI: chỉ siêu dữ liệu (thời điểm, loại yêu cầu, độ dài, trạng thái) và báo cáo bạn gửi về câu trả lời AI. Không lưu nội dung câu hỏi bạn gửi cho AI.',
  'Nhắc học: tuỳ chọn nhắc, hộp thông báo trong ứng dụng và, nếu bạn bật thông báo đẩy, địa chỉ đăng ký của thiết bị (tối đa 5 thiết bị).',
] as const;

export const RETENTION_SUMMARY = [
  'Dữ liệu tài khoản và tiến độ học được giữ đến khi bạn xoá tài khoản.',
  `Nhật ký lượt dùng AI tự xoá sau ${RETENTION.aiUsageDays} ngày; bộ đếm hạn mức AI sau ${RETENTION.aiQuotaDays} ngày.`,
  `Câu trả lời AI lưu đệm (dùng chung, không gắn với tài khoản) tự hết hạn sau ${RETENTION.aiCacheDays} ngày.`,
  `Hộp thông báo nhắc học tự xoá sau ${RETENTION.notificationInboxDays} ngày. Đăng ký thông báo đẩy của thiết bị bị xoá khi bạn đăng xuất, tắt thông báo hoặc xoá tài khoản.`,
] as const;
