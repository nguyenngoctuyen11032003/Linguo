import type { MouseEvent } from 'react';
import { useInstallPrompt } from '@/features/pwa/useInstallPrompt';
import { jumpToSection } from './section-state';

const ITEMS: Array<{ id: string; label: string }> = [
  { id: 'ho-so', label: 'Hồ sơ' },
  { id: 'lo-trinh', label: 'Lộ trình' },
  { id: 'giao-dien', label: 'Giao diện' },
  { id: 'dong-luc', label: 'Động lực' },
  { id: 'nhac-hoc', label: 'Nhắc học' },
  { id: 'ai-rieng-tu', label: 'AI và riêng tư' },
  { id: 'cai-app', label: 'Cài app' },
  { id: 'bao-loi', label: 'Báo lỗi' },
  { id: 'tai-khoan-du-lieu', label: 'Dữ liệu và tài khoản' },
];

/** Anchor links to every Settings section, so a 10-section page can be crossed in one tap. */
export function SettingsJumpList() {
  const { status } = useInstallPrompt();
  const items = ITEMS.filter((item) => item.id !== 'cai-app' || (status !== 'installed' && status !== 'unsupported'));

  const onClick = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault();
    jumpToSection(id);
  };

  return (
    <nav aria-label="Đi tới mục cài đặt">
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              onClick={(event) => onClick(event, item.id)}
              className="inline-flex min-h-11 items-center rounded-full border border-border bg-surface-solid px-4 text-sm font-semibold text-primary hover:bg-primary/10"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
