import { Mic } from 'lucide-react';
import { ActionCard } from './ActionCard';

/** Home shortcut to /app/luyen-noi (spec 6.9); static, so it needs no data. */
export function SpeakingCard() {
  return (
    <ActionCard
      icon={Mic}
      titleId="speaking-card-title"
      title="Luyện nói"
      description="Nói theo mẫu, đóng vai. Không lưu giọng nói."
      to="/app/luyen-noi"
      label="Vào luyện nói"
    />
  );
}
