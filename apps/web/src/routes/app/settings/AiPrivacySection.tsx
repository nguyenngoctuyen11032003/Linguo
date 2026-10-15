import { DEFAULT_TIMEZONE } from '@linguo/shared';
import { SolidCard } from '@/components/ui/SolidCard';
import { useAiNotice } from '@/features/ai-tutor/useAiNotice';
import { useProfile } from '@/features/profile/ProfileProvider';
import { formatDateVi, todayIso } from '@/lib/dates';
import { SECTION_HEADING_CLASS, SECTION_SCROLL_MARGIN } from './section-state';

/** Settings "AI và quyền riêng tư": what the AI tutor sends to Gemini's free tier and when the notice was seen (spec 5). */
export function AiPrivacySection() {
  const notice = useAiNotice();
  const { profile } = useProfile();
  const ackDate =
    notice.ackAt && !Number.isNaN(Date.parse(notice.ackAt))
      ? formatDateVi(todayIso(profile?.timezone ?? DEFAULT_TIMEZONE, new Date(notice.ackAt)))
      : null;

  return (
    <section id="ai-rieng-tu" aria-labelledby="ai-privacy-heading" className={SECTION_SCROLL_MARGIN}>
      <SolidCard className="space-y-3">
        <h2 id="ai-privacy-heading" tabIndex={-1} className={SECTION_HEADING_CLASS}>
          AI và quyền riêng tư
        </h2>
        <p className="text-[15px]">
          Gia sư AI dùng mô hình Gemini của Google ở gói miễn phí để giải thích kiến thức, tạo bài luyện thêm và phân tích câu
          trả lời của bạn.
        </p>
        <ul className="list-disc space-y-1.5 pl-5 text-[15px]">
          <li>
            Linguo chỉ gửi câu hỏi, câu trả lời bạn vừa làm và nội dung bài học liên quan. Không gửi tên, email hay lịch sử học
            của bạn.
          </li>
          <li>
            Ở gói miễn phí, Google có thể dùng nội dung được gửi để cải thiện sản phẩm và nhân viên của họ có thể đọc. Đừng nhập
            thông tin cá nhân hay bí mật.
          </li>
          <li>Linguo chỉ ghi số lượt dùng để tính hạn mức mỗi ngày, không lưu nội dung câu hỏi của bạn.</li>
          <li>Câu trả lời của AI có thể chưa chính xác. Bài học soạn sẵn luôn là nguồn tham khảo chính.</li>
        </ul>
        {notice.status === 'ready' && (
          <p className="text-sm text-muted" data-testid="ai-notice-ack">
            {ackDate
              ? `Bạn đã xác nhận thông báo này ngày ${ackDate}.`
              : 'Bạn sẽ thấy thông báo này trước lần đầu dùng Giải thích AI.'}
          </p>
        )}
      </SolidCard>
    </section>
  );
}
