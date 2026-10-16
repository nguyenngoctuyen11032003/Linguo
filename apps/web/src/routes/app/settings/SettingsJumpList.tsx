import { useEffect, useState, type MouseEvent } from 'react';
import { useInstallPrompt } from '@/features/pwa/useInstallPrompt';
import { cn } from '@/lib/cn';
import { jumpToSection } from './section-state';

/** Each label is the section's own h2 text, so the learner lands on exactly the heading the chip promised. */
const ITEMS: Array<{ id: string; label: string }> = [
  { id: 'ho-so', label: 'Hồ sơ' },
  { id: 'lo-trinh', label: 'Lộ trình học' },
  { id: 'giao-dien', label: 'Giao diện' },
  { id: 'dong-luc', label: 'Động lực và dữ liệu' },
  { id: 'nhac-hoc', label: 'Nhắc học' },
  { id: 'ai-rieng-tu', label: 'AI và quyền riêng tư' },
  { id: 'cai-app', label: 'Cài ứng dụng' },
  { id: 'bao-loi', label: 'Báo lỗi của tôi' },
  { id: 'mat-khau', label: 'Mật khẩu' },
  { id: 'tai-khoan-du-lieu', label: 'Tài khoản và dữ liệu' },
];

/**
 * Anchor links to every Settings section, so a 10-section page can be crossed in one tap. One row of chips that
 * scrolls sideways on phones (the page itself never scrolls horizontally); the padding keeps focus rings unclipped.
 */
export function SettingsJumpList() {
  const { status } = useInstallPrompt();
  const items = ITEMS.filter((item) => item.id !== 'cai-app' || (status !== 'installed' && status !== 'unsupported'));

  const [active, setActive] = useState<string | null>(null);
  const idsKey = items.map((i) => i.id).join(',');

  // Laptop scroll-spy: highlight the section nearest the top of the viewport.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const visible = new Set<string>();
    const order = idsKey.split(',');
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const first = order.find((id) => visible.has(id));
        if (first) setActive(first);
      },
      { rootMargin: '-15% 0px -65% 0px' },
    );
    for (const id of order) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [idsKey]);

  const onClick = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault();
    jumpToSection(id);
  };

  return (
    <nav aria-label="Đi tới mục cài đặt" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
      <p className="eyebrow mb-3 hidden px-3 lg:block">Mục cài đặt</p>
      <ul className="-mx-1.5 flex snap-x gap-2 overflow-x-auto overscroll-x-contain p-1.5 [scrollbar-width:none] lg:mx-0 lg:snap-none lg:flex-col lg:gap-0.5 lg:overflow-visible lg:border-l lg:border-border lg:p-0 [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <li key={item.id} className="shrink-0 snap-start lg:shrink">
            <a
              href={`#${item.id}`}
              onClick={(event) => onClick(event, item.id)}
              aria-current={active === item.id ? 'location' : undefined}
              className={cn(
                'glass inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-4 text-sm font-semibold text-text hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/45',
                'lg:relative lg:-ml-px lg:w-full lg:rounded-none lg:rounded-r-xl lg:border-0 lg:border-l-2 lg:!border-l-transparent lg:!bg-transparent lg:px-4 lg:font-medium lg:text-muted lg:transition-colors lg:hover:!bg-text/5 lg:hover:text-text',
                'lg:aria-[current=location]:!border-l-primary lg:aria-[current=location]:!bg-primary/8 lg:aria-[current=location]:font-semibold lg:aria-[current=location]:text-text',
              )}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
