import { useEffect, useRef, useState } from 'react';
import { BookOpen, House, LayoutGrid, RotateCcw, Route, Sparkles } from 'lucide-react';
import { asset } from '@/lib/asset';

const SCREEN_W = 390;

/** Static, non-interactive rendering of the real empty-state home screen (no fake progress numbers). */
function PhonePreview() {
  return (
    <div data-theme="dark" className="flex h-full flex-col bg-bg text-text">
      <div className="flex h-24 items-end justify-between px-5 pb-3">
        <span className="inline-flex items-center gap-2 font-bold">
          <img src={asset('brand/logo-mark.svg')} alt="" className="size-7" />
          Linguo
        </span>
        <span className="glass rounded-full px-4 py-2 text-sm font-semibold">EN ▾</span>
      </div>
      <div className="space-y-5 px-5">
        <p className="text-sm text-muted">Thứ Hai, 13 tháng 10</p>
        <p className="text-[28px] font-bold tracking-[-0.03em]">Chào bạn</p>
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-border bg-surface-solid px-6 py-10 text-center">
          <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <Route className="size-7" />
          </span>
          <p className="text-xl font-bold">Bắt đầu lộ trình đầu tiên</p>
          <p className="text-[15px] text-muted">Chọn ngôn ngữ, mục tiêu và thời gian học mỗi ngày.</p>
          <span className="rounded-full bg-accent px-6 py-3 font-semibold text-on-accent">Tạo lộ trình</span>
        </div>
      </div>
      <div className="mt-auto grid grid-cols-5 border-t border-border bg-surface-solid pb-8 pt-2 text-[11px] text-muted">
        {[
          [House, 'Trang chủ'],
          [BookOpen, 'Học tập'],
          [RotateCcw, 'Ôn tập'],
          [Sparkles, 'Gia sư AI'],
          [LayoutGrid, 'Thêm'],
        ].map(([Icon, label], i) => {
          const I = Icon as typeof House;
          return (
            <span key={label as string} className={`flex flex-col items-center gap-0.5 ${i === 0 ? 'text-primary' : ''}`}>
              <I className="size-6" />
              {label as string}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** iPhone 15 Pro-style frame (393:852) shown only on wide screens; phones see the real full-bleed app. */
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
    <div className="relative aspect-[393/852] w-[min(340px,30vw)] rounded-[54px] border-8 border-[#2a2a2a] bg-[#1a1a1a] shadow-[0_40px_80px_rgb(0_0_0/0.45),inset_0_0_0_1px_#3a3a3a]">
      <div ref={screenRef} className="absolute inset-0 overflow-hidden rounded-[46px]">
        <div aria-hidden="true" className="absolute left-1/2 top-[11px] z-10 h-9 w-[126px] -translate-x-1/2 rounded-[20px] bg-black" />
        <div style={{ width: SCREEN_W, height: `${100 / scale}%`, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <PhonePreview />
        </div>
        <div aria-hidden="true" className="absolute bottom-2 left-1/2 h-[5px] w-[134px] -translate-x-1/2 rounded-full bg-white/30" />
      </div>
    </div>
  );
}

export function ShowcaseSection() {
  return (
    <section aria-labelledby="showcase-title" className="hidden overflow-x-clip bg-bg px-safe pb-[clamp(64px,12vh,120px)] min-[900px]:block">
      <div className="mx-auto grid max-w-5xl grid-cols-2 items-center gap-12">
        <div className="space-y-4">
          <h2 id="showcase-title" className="text-[44px] font-bold leading-[1.08] tracking-[-0.03em]">
            Thiết kế cho điện thoại trước tiên
          </h2>
          <p className="text-[17px] leading-relaxed text-muted">
            Mở trên trình duyệt iPhone hoặc Android là học được ngay — bố cục tràn viền, chừa đúng tai thỏ và thanh điều hướng,
            chế độ sáng/tối và giảm chuyển động.
          </p>
        </div>
        <div className="flex justify-center" aria-hidden="true">
          <PhoneFrame />
        </div>
      </div>
    </section>
  );
}
