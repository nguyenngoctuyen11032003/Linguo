import { BrainCircuit, CalendarClock, MessageSquareText } from 'lucide-react';
import { Link, Outlet } from 'react-router';
import { Wordmark } from './Wordmark';

const POINTS = [
  { icon: BrainCircuit, text: 'Nhớ lại chủ động thay vì đọc đi đọc lại' },
  { icon: CalendarClock, text: 'Ôn tập ngắt quãng đúng lúc sắp quên' },
  { icon: MessageSquareText, text: 'Phản hồi chỉ rõ chỗ sai và cách sửa' },
];

/** Phones: one centred column (unchanged). Laptops (>=1024px): brand panel on the left, form on the right. */
export function AuthLayout() {
  return (
    <div className="relative min-h-hero overflow-x-clip">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_55%_at_10%_0%,rgb(76_162_209/0.22),transparent_65%),radial-gradient(ellipse_70%_50%_at_100%_100%,rgb(243_125_37/0.16),transparent_65%)]"
      />
      <div className="relative mx-auto grid min-h-hero w-full max-w-md grid-cols-1 px-safe pb-safe pt-safe min-[1024px]:max-w-[1200px] min-[1024px]:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] min-[1024px]:gap-16 min-[1024px]:px-10">
        <aside className="hidden min-[1024px]:flex min-[1024px]:flex-col min-[1024px]:justify-between min-[1024px]:py-10">
          <Link to="/" aria-label="Linguo" className="inline-flex min-h-11 items-center self-start">
            <Wordmark size={36} />
          </Link>
          <div className="space-y-8">
            <p className="inline-flex items-center gap-2 rounded-full bg-[var(--surface)] py-1.5 pl-1.5 pr-3.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted ring-1 ring-[var(--border)] ring-inset">
              <span aria-hidden="true" className="inline-flex gap-1">
                <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] text-on-primary">EN</span>
                <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] text-on-accent">KO</span>
                <span className="rounded-full bg-[#C9255F] px-2 py-0.5 text-[11px] text-white">JA</span>
                <span className="rounded-full bg-[#3F3F46] px-2 py-0.5 text-[11px] text-white">DE</span>
              </span>
              Tiếng Anh · Hàn · Nhật · Đức
            </p>
            <p aria-hidden="true" className="font-display text-[clamp(48px,4.8vw,80px)] font-extrabold uppercase leading-[0.92]">
              Học thông minh
              <span className="block bg-gradient-to-r from-primary via-[#8fd0f2] to-accent bg-clip-text text-transparent">Nhớ lâu hơn</span>
            </p>
            <ul className="reveal-stagger space-y-3">
              {POINTS.map(({ icon: Icon, text }) => (
                <li key={text} className="glass flex max-w-md items-center gap-4 rounded-2xl px-5 py-4 text-[15px]">
                  <Icon aria-hidden className="size-5 shrink-0 text-primary" strokeWidth={1.75} />
                  {text}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-sm text-muted">© 2026 Linguo</p>
        </aside>
        <div className="flex min-h-hero flex-col min-[1024px]:min-h-0 min-[1024px]:justify-center">
          <header className="flex items-center py-3 min-[1024px]:hidden">
            <Link to="/" aria-label="Linguo" className="inline-flex min-h-11 items-center">
              <Wordmark size={32} />
            </Link>
          </header>
          <main id="main" className="flex flex-1 flex-col justify-center py-6 min-[1024px]:mx-auto min-[1024px]:w-full min-[1024px]:max-w-md min-[1024px]:flex-none">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
