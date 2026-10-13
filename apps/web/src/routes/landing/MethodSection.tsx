import { useRef } from 'react';
import { motion, useInView } from 'motion/react';
import { BrainCircuit, CalendarClock, MessageSquareText } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
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
      <div ref={ref} className="mx-auto max-w-5xl">
        <motion.h2
          id="method-title"
          className="max-w-2xl text-[clamp(30px,8vw,52px)] font-bold leading-[1.08] tracking-[-0.03em]"
          variants={reveal('speed', reduceMotion)}
          initial="hidden"
          animate={state}
        >
          Phương pháp có <em className="font-serif font-normal text-primary">cơ sở nghiên cứu</em>
        </motion.h2>
        <ul className="mt-10 grid gap-4 md:grid-cols-3">
          {METHODS.map(({ icon: Icon, title, text }, i) => (
            <motion.li key={title} variants={reveal('blurUp', reduceMotion, 0.1 + i * 0.1)} initial="hidden" animate={state}>
              <GlassCard className="h-full space-y-3 p-6">
                <Icon aria-hidden className="size-8 text-primary" />
                <h3 className="text-lg font-bold">{title}</h3>
                <p className="text-[15px] leading-relaxed text-muted">{text}</p>
              </GlassCard>
            </motion.li>
          ))}
        </ul>
        <p className="mt-8 max-w-2xl border-l-2 border-gold pl-4 text-[15px] leading-relaxed text-muted">
          Linguo không hứa “thành thạo siêu tốc”. Mọi dự báo tiến độ là ước lượng từ kết quả học thật của bạn và được cập nhật
          liên tục.
        </p>
      </div>
    </section>
  );
}
