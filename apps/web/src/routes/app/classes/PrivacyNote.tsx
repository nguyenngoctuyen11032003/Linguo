import { Eye, EyeOff, LogOut } from 'lucide-react';
import { SolidCard } from '@/components/ui/SolidCard';

// Exactly what teacher_class_roster returns (supabase/migrations/20261017000400_teacher_tools.sql): identity plus
// aggregates in the class language, nothing else. Keep this list in sync with teacherRosterMemberSchema.
const SEEN = [
  'Tên hiển thị của bạn và ngày bạn vào lớp',
  'Chuỗi ngày học và số phút học trong 7 và 30 ngày qua',
  'Ngày học gần nhất và số bài học đã hoàn thành',
  'Số thẻ đang chờ ôn, số lượt ôn và tỉ lệ ôn đúng trong 30 ngày',
  'Bài được giao nào bạn đã làm xong',
];

const NOT_SEEN = [
  'Email và thông tin đăng nhập',
  'Câu trả lời của bạn trong bài học, bài ôn hay bài luyện thi',
  'Hội thoại với Gia sư AI và phần đóng vai',
  'Giọng nói đã ghi âm và từ vựng cá nhân của bạn',
  'Tiến độ ở các ngôn ngữ khác ngôn ngữ của lớp',
];

/** "Giáo viên thấy gì?": shown before joining and on the classes page. */
export function PrivacyNote({ headingLevel = 'h2' }: { headingLevel?: 'h2' | 'h3' }) {
  const Heading = headingLevel;
  return (
    <SolidCard>
      <section aria-labelledby="class-privacy-title" className="space-y-4">
        <div>
          <Heading id="class-privacy-title" className="text-[19px] font-extrabold tracking-[-0.02em]">
            Giáo viên thấy gì về bạn?
          </Heading>
          <p className="mt-1 text-[15px] text-muted">
            Chỉ các con số tổng hợp về việc học trong ngôn ngữ của lớp, và chỉ khi bạn còn ở trong lớp.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 rounded-2xl bg-primary/8 p-4 ring-1 ring-primary/20 ring-inset">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold">
              <Eye aria-hidden className="size-5 shrink-0 text-primary" />
              Giáo viên thấy
            </h3>
            <ul className="list-disc space-y-1 pl-5 text-[15px] marker:text-muted">
              {SEEN.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="space-y-2 rounded-2xl bg-success/8 p-4 ring-1 ring-success/20 ring-inset">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold">
              <EyeOff aria-hidden className="size-5 shrink-0 text-success-text" />
              Giáo viên không thấy
            </h3>
            <ul className="list-disc space-y-1 pl-5 text-[15px] marker:text-muted">
              {NOT_SEEN.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="flex items-start gap-2 text-[15px] text-muted">
          <LogOut aria-hidden className="mt-0.5 size-5 shrink-0" />
          <span>Bạn có thể rời lớp bất cứ lúc nào. Ngay khi rời, giáo viên không còn thấy tiến độ của bạn nữa.</span>
        </p>
      </section>
    </SolidCard>
  );
}
