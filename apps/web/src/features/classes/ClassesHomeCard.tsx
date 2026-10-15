import { Users } from 'lucide-react';
import { ActionCard } from '@/routes/app/home/ActionCard';

/** Home shortcut to /app/lop-hoc (PRD P2 "Lớp học"); static, so Home makes no extra request for it. */
export function ClassesHomeCard() {
  return (
    <ActionCard
      icon={Users}
      titleId="classes-card-title"
      title="Lớp học"
      description="Tham gia lớp bằng mã giáo viên gửi và xem bài được giao."
      to="/app/lop-hoc"
      label="Mở lớp học"
    />
  );
}
