import type { MouseEvent } from 'react';
import { useInstallPrompt } from '@/features/pwa/useInstallPrompt';
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
  { id: 'tai-khoan-du-lieu', label: 'Tài khoản và dữ liệu' },
];

/**
 * Anchor links to every Settings section, so a 10-section page can be crossed in one tap. One row of chips that
 * scrolls sideways on phones (the page itself never scrolls horizontally); the padding keeps focus rings unclipped.
 */
export function SettingsJumpList() {
  const { status } = useInstallPrompt();
  const items = ITEMS.filter((item) => item.id !== 'cai-app' || (status !== 'installed' && status !== 'unsupported'));

  const onClick = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault();
    jumpToSection(id);
  };

  return (
    <nav aria-label="Đi tới mục cài đặt" className="min-w-0">
      <ul className="-mx-1.5 flex snap-x gap-2 overflow-x-auto overscroll-x-contain p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <li key={item.id} className="shrink-0 snap-start">
            <a
              href={`#${item.id}`}
              onClick={(event) => onClick(event, item.id)}
              className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full border border-border bg-surface-solid px-4 text-sm font-semibold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/45"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
