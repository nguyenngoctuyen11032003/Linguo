import { useRef } from 'react';
import { m as motion, useInView } from 'motion/react';
import { BrainCircuit, CalendarClock, MessageSquareText } from 'lucide-react';
import { reveal, VIEWPORT_ONCE } from '@/design/motion';
import { useMotionPrefs } from '@/providers/MotionProvider';

const METHODS = [
  { icon: BrainCircuit, title: 'Nhớ lại chủ động', text: 'Tự trả lời trước khi xem đáp án — cách ghi nhớ bền hơn đọc đi đọc lại.' },
  { icon: CalendarClock, title: 'Ôn tập ngắt quãng', text: 'Lịch ôn theo khả năng nhớ của từng mục kiến thức, không nhồi nhét một lần.' },
  { icon: MessageSquareText, title: 'Phản hồi có giải thích', text: 'Chỉ đúng chỗ sai, vì sao sai và cách sửa; lỗi được lưu để học lại đúng điểm yếu.' },
];

export function MethodSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, VIEWPORT_ONCE);
  const { reduceMotion } = useMotionPrefs();
  const state = inView || reduceMotion ? 'shown' : 'hidden';

  return (
    <section id="phuong-phap" aria-labelledby="method-title" className="overflow-x-clip bg-bg px-safe py-[clamp(64px,12vh,120px)]">
      <div ref={ref} className="mx-auto max-w-5xl min-[1280px]:max-w-[1200px]">
        <motion.h2
          id="method-title"
          className="max-w-2xl font-display text-[clamp(40px,12vw,72px)] font-extrabold uppercase leading-[0.95]"
          variants={reveal('speed', reduceMotion)}
          initial="hidden"
          animate={state}
        >
          Phương pháp có <em className="font-serif text-[0.82em] font-normal normal-case text-primary">cơ sở nghiên cứu</em>
        </motion.h2>
        <ol className="mt-10 grid gap-3 md:grid-cols-3">
          {METHODS.map(({ icon: Icon, title, text }, i) => (
            <motion.li
              key={title}
              className="card relative isolate overflow-hidden p-5"
              variants={reveal('blurUp', reduceMotion, 0.1 + i * 0.1)}
              initial="hidden"
              animate={state}
            >
              <span aria-hidden="true" className="stat-num text-gradient-fade absolute right-5 top-4 -z-10 text-[72px] leading-none opacity-50">
                0{i + 1}
              </span>
              <Icon aria-hidden className="size-6 text-primary" strokeWidth={1.75} />
              <h3 className="mt-8 text-[19px] font-bold tracking-[-0.02em]">{title}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{text}</p>
            </motion.li>
          ))}
        </ol>
        <p className="mt-8 max-w-2xl border-l-2 border-gold pl-4 text-[15px] leading-relaxed text-muted">
          Linguo không hứa “thành thạo siêu tốc”. Mọi dự báo tiến độ là ước lượng từ kết quả học thật của bạn và được cập nhật
          liên tục.
        </p>
      </div>
    </section>
  );
}
