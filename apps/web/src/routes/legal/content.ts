import { CONTACT_EMAIL, RETENTION, RETENTION_SUMMARY, STORED_DATA_SUMMARY } from '@/features/account/retention';

export interface LegalSection {
  heading: string;
  paragraphs?: readonly string[];
  items?: readonly string[];
}

export interface LegalDocument {
  title: string;
  intro: string;
  updated: string;
  sections: readonly LegalSection[];
}

const UPDATED = '13/10/2026';
const CONTACT = `Mọi câu hỏi hoặc yêu cầu về dữ liệu, hãy gửi email tới ${CONTACT_EMAIL}. Chúng tôi trả lời bằng tiếng Việt.`;

export const PRIVACY: LegalDocument = {
  title: 'Quyền riêng tư',
  intro: 'Trang này nói rõ Linguo lưu gì về bạn, để làm gì, giữ trong bao lâu và bạn có thể xuất hoặc xoá dữ liệu ra sao.',
  updated: UPDATED,
  sections: [
    { heading: 'Dữ liệu chúng tôi thu thập', items: STORED_DATA_SUMMARY },
    {
      heading: 'Mục đích sử dụng',
      items: [
        'Vận hành tài khoản và đăng nhập.',
        'Lưu tiến độ, xếp lịch ôn tập và gợi ý bài học phù hợp với trình độ của bạn.',
        'Tính hạn mức dùng AI mỗi ngày và phát hiện lỗi, lạm dụng.',
      ],
      paragraphs: [
        'Dữ liệu học tập chỉ bạn xem được. Linguo không có bảng xếp hạng công khai, không chạy quảng cáo và không bán dữ liệu.',
      ],
    },
    {
      heading: 'Gia sư AI và Gemini',
      paragraphs: [
        'Tính năng AI dùng mô hình Gemini của Google ở gói miễn phí. Khi bạn yêu cầu AI, Linguo chỉ gửi câu hỏi hoặc câu trả lời bạn vừa nhập kèm nội dung bài học công khai liên quan.',
        'Linguo không gửi tên, email hay lịch sử học của bạn cho Gemini. Ở gói miễn phí, Google có thể dùng nội dung được gửi để cải thiện sản phẩm, vì vậy đừng nhập thông tin cá nhân hay bí mật vào ô hỏi AI.',
        'Linguo không lưu nội dung câu hỏi bạn gửi cho AI; chỉ lưu siêu dữ liệu của lượt dùng như mô tả ở trên.',
      ],
    },
    {
      heading: 'Thời hạn lưu',
      items: RETENTION_SUMMARY,
      paragraphs: [
        'Khi bạn xoá tài khoản, dữ liệu bị xoá khỏi cơ sở dữ liệu ngay. Bản sao lưu định kỳ của nhà cung cấp hạ tầng (Supabase) có thể còn giữ một thời gian ngắn rồi tự xoá theo chu kỳ của họ.',
      ],
    },
    {
      heading: 'Xuất và xoá dữ liệu',
      paragraphs: [
        'Trong Cài đặt › Tài khoản và dữ liệu, bạn có thể tải toàn bộ dữ liệu của mình dưới dạng tệp JSON, hoặc xoá vĩnh viễn tài khoản.',
        'Xoá tài khoản không thể hoàn tác. Linguo chỉ ghi lại thời điểm có một tài khoản bị xoá, không giữ email hay mã tài khoản của bạn.',
      ],
    },
    { heading: 'Liên hệ', paragraphs: [CONTACT] },
  ],
};

export const TERMS: LegalDocument = {
  title: 'Điều khoản sử dụng',
  intro: 'Khi dùng Linguo, bạn đồng ý với các điều khoản ngắn gọn dưới đây.',
  updated: UPDATED,
  sections: [
    {
      heading: 'Linguo là công cụ hỗ trợ tự học',
      paragraphs: [
        'Kết quả kiểm tra đầu vào, ước lượng trình độ và dự báo thời gian chỉ là ước tính để bạn lên kế hoạch, không phải cam kết đạt chứng chỉ hay điểm số nào.',
      ],
    },
    {
      heading: 'Nội dung do AI tạo',
      paragraphs: [
        'Giải thích, bài luyện thêm và nhận xét của AI là gợi ý học tập, không phải đáp án chính thức. AI có thể sai; bài học soạn sẵn luôn là nguồn tham khảo chính.',
        'Nếu thấy câu trả lời AI sai hoặc không phù hợp, hãy dùng nút báo cáo ngay dưới câu trả lời đó.',
      ],
    },
    {
      heading: 'Sử dụng hợp lệ',
      items: [
        'Không dùng dịch vụ để phát tán nội dung vi phạm bản quyền, gây hại hoặc trái pháp luật.',
        'Không cố truy cập dữ liệu của người khác hay làm quá tải hệ thống.',
        `AI có hạn mức mỗi ngày; nhật ký lượt dùng AI được giữ ${RETENTION.aiUsageDays} ngày để chống lạm dụng.`,
      ],
    },
    {
      heading: 'Giới hạn trách nhiệm',
      paragraphs: [
        'Linguo được cung cấp miễn phí theo hiện trạng. Chúng tôi cố gắng giữ dịch vụ ổn định và dữ liệu an toàn nhưng không bảo đảm dịch vụ luôn sẵn sàng hay không có lỗi, và không chịu trách nhiệm cho quyết định học tập, thi cử dựa trên ước tính hoặc nội dung AI.',
      ],
    },
    {
      heading: 'Tài khoản của bạn',
      paragraphs: [
        'Bạn có thể ngừng dùng, tải dữ liệu hoặc xoá tài khoản bất cứ lúc nào trong Cài đặt. Cách chúng tôi xử lý dữ liệu được mô tả ở trang Quyền riêng tư.',
      ],
    },
    { heading: 'Liên hệ', paragraphs: [CONTACT] },
  ],
};
