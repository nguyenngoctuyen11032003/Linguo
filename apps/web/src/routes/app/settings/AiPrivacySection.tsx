import { useEffect, useState } from 'react';
import { DEFAULT_TIMEZONE } from '@linguo/shared';
import { SolidCard } from '@/components/ui/SolidCard';
import { useAuth } from '@/features/auth/AuthProvider';
import { useProfile } from '@/features/profile/ProfileProvider';
import { formatDateVi, todayIso } from '@/lib/dates';
import { getSupabase } from '@/lib/supabase';

type AckState = { status: 'loading' } | { status: 'ready'; ackAt: string | null } | { status: 'error' };

/** When the learner acknowledged the AI notice (user_preferences.ai_notice_ack_at), or null. */
async function fetchAiNoticeAck(userId: string): Promise<string | null> {
  const client = getSupabase();
  if (!client) throw new Error('supabase_unavailable');
  const { data, error } = await client.from('user_preferences').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  const value = (data as Record<string, unknown> | null)?.ai_notice_ack_at;
  return typeof value === 'string' && value ? value : null;
}

/** Settings "AI và quyền riêng tư": what the AI tutor sends to Gemini's free tier and when the notice was seen (spec 5). */
export function AiPrivacySection() {
  const { user } = useAuth();
  const userId = user?.id;
  const { profile } = useProfile();
  const [ack, setAck] = useState<AckState>({ status: 'loading' });

  useEffect(() => {
    if (!userId) return;
    let active = true;
    setAck({ status: 'loading' });
    fetchAiNoticeAck(userId)
      .then((ackAt) => active && setAck({ status: 'ready', ackAt }))
      .catch(() => active && setAck({ status: 'error' }));
    return () => {
      active = false;
    };
  }, [userId]);

  const ackDate =
    ack.status === 'ready' && ack.ackAt && !Number.isNaN(Date.parse(ack.ackAt))
      ? formatDateVi(todayIso(profile?.timezone ?? DEFAULT_TIMEZONE, new Date(ack.ackAt)))
      : null;

  return (
    <section aria-labelledby="ai-privacy-heading">
      <SolidCard className="space-y-3">
        <h2 id="ai-privacy-heading" className="text-lg font-bold">
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
        {ack.status === 'ready' && (
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
