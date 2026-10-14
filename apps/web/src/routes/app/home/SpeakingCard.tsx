import { Mic } from 'lucide-react';
import { ActionCard } from './ActionCard';

/** Home shortcut to /app/luyen-noi (spec 6.9); static, so it needs no data. */
export function SpeakingCard() {
  return (
    <ActionCard
      icon={Mic}
      titleId="speaking-card-title"
      title="Luyện nói"
      description="Nhắc lại câu, trả lời mở và đóng vai. Giọng của bạn không bị lưu lại."
      to="/app/luyen-noi"
      label="Vào luyện nói"
    />
  );
}
