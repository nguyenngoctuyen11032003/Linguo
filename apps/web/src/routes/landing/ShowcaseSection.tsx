import { useEffect, useRef, useState } from 'react';
import { m as motion, useInView } from 'motion/react';
import { ArrowRight, BookOpen, House, LayoutGrid, Moon, RotateCcw, Smartphone, Sparkles, Waves } from 'lucide-react';
import { asset } from '@/lib/asset';
import { reveal, VIEWPORT_ONCE } from '@/design/motion';
import { cn } from '@/lib/cn';
import { useMotionPrefs } from '@/providers/MotionProvider';

const SCREEN_W = 390;

const TABS = [
  [House, 'Trang chủ'],
  [BookOpen, 'Học tập'],
  [RotateCcw, 'Ôn tập'],
  [Sparkles, 'Gia sư AI'],
  [LayoutGrid, 'Thêm'],
] as const;

/** Static, non-interactive rendering of the real empty-state home screen (no fake progress numbers). */
function PhonePreview() {
  return (
    <div data-theme="dark" className="relative flex h-full flex-col bg-bg bg-[image:var(--ambient)] text-text">
      <div className="flex h-[7.5rem] items-end justify-between px-5 pb-3">
        <span className="inline-flex items-center gap-2 font-display text-[24px] font-extrabold uppercase">
          <img src={asset('brand/logo-mark.svg')} alt="" className="size-7" />
          Linguo
        </span>
        <span className="glass rounded-full px-4 py-2 text-sm font-semibold">EN ▾</span>
      </div>
      <div className="space-y-4 px-5">
        <div>
          <p className="eyebrow">Thứ Hai, 13 tháng 10</p>
          <p className="page-title mt-1 text-[44px]">Chào bạn</p>
        </div>
        <div className="relative isolate overflow-hidden rounded-[2rem] bg-[image:var(--hero-bg)] p-5 text-white ring-1 ring-white/10 ring-inset">
          <div className="absolute -bottom-20 -left-12 -z-10 size-52 rounded-full bg-radial from-accent/30 to-transparent to-70%" />
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/70">Bắt đầu</p>
          <p className="mt-3 font-display text-[40px] font-extrabold uppercase leading-[0.95]">
            Lộ trình
            <br />
            đầu tiên
          </p>
          <p className="mt-3 text-[14px] text-white/70">Chọn ngôn ngữ, mục tiêu và thời gian học mỗi ngày.</p>
          <span className="mt-5 flex items-center justify-between rounded-full bg-accent py-1.5 pl-5 pr-1.5 font-bold text-on-accent shadow-[0_4px_0_var(--accent-depth)]">
            Tạo lộ trình
            <span className="inline-flex size-10 items-center justify-center rounded-full bg-[#0b1420] text-white">
              <ArrowRight className="size-5" />
            </span>
          </span>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <span className="inline-flex size-10 items-center justify-center rounded-full bg-primary/15 text-primary">
            <RotateCcw className="size-5" />
          </span>
          <span className="flex-1">
            <span className="block text-[15px] font-bold">Ôn tập</span>
            <span className="block text-[13px] text-muted">Chưa có thẻ đến hạn</span>
          </span>
        </div>
        <div className="card flex items-end justify-between p-4">
          <span>
            <span className="eyebrow block">Mục tiêu hôm nay</span>
            <span className="mt-1 block text-[13px] text-muted">Đặt sau khi tạo lộ trình</span>
          </span>
          <span className="stat-num text-[44px] leading-none">
            15<span className="ml-1 text-[18px] text-muted">phút</span>
          </span>
        </div>
      </div>
      <div className="absolute inset-x-3 bottom-6">
        <div className="glass grid grid-cols-5 rounded-[1.75rem] px-1 py-1 shadow-[var(--shadow-dock)]">
          {TABS.map(([Icon, label], i) => (
            <span key={label} className="flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-semibold">
              <span className={cn('inline-flex h-8 w-12 items-center justify-center rounded-full', i === 0 ? 'bg-primary text-on-primary' : 'text-muted')}>
                <Icon className="size-[22px]" />
              </span>
              {i === 0 && label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** iPhone 15 Pro-style frame (393:852) around a scaled-down rendering of the real home screen. */
function PhoneFrame() {
  const screenRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.8);
  useEffect(() => {
    const el = screenRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setScale(entry.contentRect.width / SCREEN_W);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="relative aspect-[393/852] w-[min(300px,78vw)] rounded-[54px] border-8 border-[#2a2a2a] bg-[#1a1a1a] shadow-[0_40px_80px_rgb(0_0_0/0.45),inset_0_0_0_1px_#3a3a3a] min-[900px]:w-[min(340px,30vw)]">
      <div ref={screenRef} className="absolute inset-0 overflow-hidden rounded-[46px]">
        <div aria-hidden="true" className="absolute left-1/2 top-[1.3%] z-10 h-[4.2%] w-[32%] -translate-x-1/2 rounded-full bg-black" />
        <div style={{ width: SCREEN_W, height: `${100 / scale}%`, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <PhonePreview />
        </div>
        <div aria-hidden="true" className="absolute bottom-[1%] left-1/2 h-[5px] w-[34%] -translate-x-1/2 rounded-full bg-white/30" />
      </div>
    </div>
  );
}

const FEATURES = [
  { icon: Smartphone, label: 'Tràn viền, chừa tai thỏ' },
  { icon: Moon, label: 'Sáng / tối' },
  { icon: Waves, label: 'Giảm chuyển động' },
];

export function ShowcaseSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, VIEWPORT_ONCE);
  const { reduceMotion } = useMotionPrefs();
  const state = inView || reduceMotion ? 'shown' : 'hidden';

  return (
    <section id="di-dong" aria-labelledby="showcase-title" className="min-[1024px]:-scroll-mt-18 overflow-x-clip bg-bg px-safe pb-[clamp(64px,12vh,120px)] pt-[clamp(8px,4vh,40px)]">
      <div ref={ref} className="mx-auto grid max-w-5xl min-[1280px]:max-w-[1200px] items-center gap-10 min-[900px]:grid-cols-2 min-[900px]:gap-12">
        <motion.div className="space-y-4" variants={reveal('fadeUp', reduceMotion)} initial="hidden" animate={state}>
          <h2 id="showcase-title" className="font-display text-[clamp(44px,12vw,72px)] font-extrabold uppercase leading-[0.95]">
            <span className="block">Thiết kế</span> <span className="block whitespace-nowrap">
              cho <span className="text-primary">điện thoại</span>
            </span>{' '}
            <span className="block">trước tiên</span>
          </h2>
          <p className="max-w-md pt-2 text-[17px] leading-relaxed text-muted">
            Mở trên trình duyệt iPhone hoặc Android là học được ngay — bố cục tràn viền, chừa đúng tai thỏ và thanh điều hướng,
            chế độ sáng/tối và giảm chuyển động.
          </p>
          <ul aria-hidden="true" className="flex flex-wrap gap-2 pt-2">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li key={label} className="glass inline-flex min-h-10 items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold">
                <Icon className="size-4 text-primary" />
                {label}
              </li>
            ))}
          </ul>
        </motion.div>
        <motion.div className="relative isolate flex justify-center" aria-hidden="true" variants={reveal('fadeUp', reduceMotion, 0.12)} initial="hidden" animate={state}>
          <div className="absolute left-1/2 top-1/2 -z-10 size-[min(420px,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgb(76_162_209/0.35),transparent_65%)]" />
          <PhoneFrame />
        </motion.div>
      </div>
    </section>
  );
}
