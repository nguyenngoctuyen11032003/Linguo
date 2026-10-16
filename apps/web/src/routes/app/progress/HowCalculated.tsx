import { ChevronDown } from 'lucide-react';
import { ACTIVE_MS_CAP_PER_ANSWER, MIN_ACCURACY_SAMPLE, STREAK_RULES, XP_RULES } from '@linguo/shared';
import { PROGRESS_TERMS } from './labels';

const CAP_MINUTES = ACTIVE_MS_CAP_PER_ANSWER / 60_000;

/** "Cách tính" disclosure (PRD 10.2): activity ≠ learning ≠ competence, and which data each number uses. */
export function HowCalculated() {
  return (
    <details className="group card">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-3xl px-5 py-3 font-semibold [&::-webkit-details-marker]:hidden">
        Cách tính các số liệu
        <ChevronDown aria-hidden className="size-5 shrink-0 transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <div className="space-y-4 px-5 pb-5 text-[15px] leading-relaxed">
        <p className="text-muted">
          Trang này tách ba lớp: bạn đã học bao lâu, bạn làm đúng và nhớ được bao nhiêu, và trình độ ước lượng. Học nhiều chưa chắc đã giỏi
          hơn ngay, nên ba lớp được tính riêng. Mọi ngày đều tính theo múi giờ trong hồ sơ của bạn.
        </p>
        <section>
          <h3 className="font-bold">Hoạt động</h3>
          <p>
            Phút học là tổng thời gian trả lời câu hỏi và ôn thẻ, mỗi câu tính tối đa {CAP_MINUTES} phút để lúc bỏ máy đó không làm tăng số
            phút. Bài đã xong, lượt ôn và câu vận dụng đúng ngay lần đầu được đếm trong khoảng ngày đang chọn. Mục tiêu mỗi ngày lấy từ lịch
            học của lộ trình; ngày không có lịch là ngày nghỉ.
          </p>
        </section>
        <section>
          <h3 className="font-bold">{PROGRESS_TERMS.resultsSection}</h3>
          <p>
            Độ chính xác chỉ tính lần trả lời đầu tiên của mỗi câu, không tính câu làm lại sau khi đã xem đáp án. Cần ít nhất{' '}
            {MIN_ACCURACY_SAMPLE} câu trong giai đoạn đang chọn mới hiện tỷ lệ, và được so với giai đoạn dài bằng ngay trước đó. {PROGRESS_TERMS.longTermRecall} là
            tỷ lệ nhớ được thẻ ôn đã giãn cách từ 7 ngày trở lên, trong 30 ngày gần nhất.
          </p>
        </section>
        <section>
          <h3 className="font-bold">Năng lực</h3>
          <p>
            Trình độ từng kỹ năng là ước lượng từ bài kiểm tra đầu vào, bài đánh giá hoặc do bạn tự chọn, kèm độ tin cậy và ngày cập nhật.
            Ước lượng chỉ đổi khi bạn làm bài đánh giá, không đổi theo số phút học hay XP.
          </p>
        </section>
        <section>
          <h3 className="font-bold">Động lực</h3>
          <p>
            XP đo mức độ hoạt động: {XP_RULES.attempt_correct} XP cho câu đúng ngay lần đầu, {XP_RULES.attempt_almost} XP cho câu gần đúng,{' '}
            {XP_RULES.review_recalled} XP cho thẻ ôn nhớ được, {XP_RULES.lesson_completed} XP cho mỗi bài xong (thêm{' '}
            {XP_RULES.lesson_accurate_bonus} XP nếu đúng từ 80%), tối đa {XP_RULES.daily_cap} XP mỗi ngày. Không có điểm thưởng cho tốc độ.
            Một ngày được tính là đã học khi bạn xong một bài, ôn ít nhất {STREAK_RULES.active_min_reviews} thẻ hoặc học ít nhất{' '}
            {STREAK_RULES.active_min_minutes} phút. Ngày nghỉ theo lịch không làm mất chuỗi, và mỗi tuần được bỏ lỡ{' '}
            {STREAK_RULES.grace_per_week} buổi.
          </p>
        </section>
      </div>
    </details>
  );
}
