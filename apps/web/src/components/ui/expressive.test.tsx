import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { MotionProvider } from '@/providers/MotionProvider';
import { ArrowCTA } from './ArrowCTA';
import { CountUp } from './CountUp';
import { LanguagePill } from './LanguagePill';
import { RouteLine } from './RouteLine';

const withMotion = (ui: ReactNode) => (
  <MemoryRouter>
    <MotionProvider>{ui}</MotionProvider>
  </MemoryRouter>
);

describe('CountUp', () => {
  it('shows the final value immediately when motion is reduced and exposes it to screen readers', () => {
    localStorage.setItem('linguo-reduce-motion', 'true');
    render(withMotion(<CountUp to={1200} suffix="+" />));
    expect(screen.getAllByText('1.200+')).toHaveLength(2);
  });
});

describe('RouteLine', () => {
  it('renders an accessible SVG with stop labels', () => {
    render(
      withMotion(
        <RouteLine
          title="Lộ trình tiếng Anh"
          viewBox="0 0 100 50"
          tracks={[
            {
              id: 'en',
              d: 'M0 0 C 10 10 20 10 30 0',
              color: '#4CA2D1',
              stops: [
                { x: 0, y: 0, label: 'A1' },
                { x: 30, y: 0, label: 'B1' },
              ],
            },
          ]}
        />,
      ),
    );
    expect(screen.getByRole('img', { name: 'Lộ trình tiếng Anh' })).toBeInTheDocument();
    expect(screen.getByText('A1')).toBeInTheDocument();
    expect(screen.getByText('B1')).toBeInTheDocument();
  });
});

describe('RouteLine under reduced motion', () => {
  it('renders stops statically and never mounts the travelling arrow', () => {
    localStorage.setItem('linguo-reduce-motion', 'true');
    const { container } = render(
      withMotion(
        <RouteLine
          title="Lộ trình"
          viewBox="0 0 100 50"
          tracks={[{ id: 'en', d: 'M0 0 L 30 0', color: '#4CA2D1', stops: [{ x: 0, y: 0, label: 'A1' }] }]}
        />,
      ),
    );
    expect(container.querySelector('polygon')).toBeNull();
    expect(container.querySelector('animateMotion')).toBeNull();
    expect(screen.getByText('A1')).toBeInTheDocument();
  });
});

describe('ArrowCTA', () => {
  it('is a link with the given label', () => {
    render(withMotion(<ArrowCTA to="/dang-ky">Bắt đầu miễn phí</ArrowCTA>));
    expect(screen.getByRole('link', { name: 'Bắt đầu miễn phí' })).toHaveAttribute('href', '/dang-ky');
  });
});

describe('LanguagePill', () => {
  const paths = [
    { id: 'path-en', language: 'en' as const, status: 'active' as const },
    { id: 'path-ko', language: 'ko' as const, status: 'paused' as const },
  ];

  it('shows the current language as text, lists paths and returns focus on Escape', async () => {
    render(withMotion(<LanguagePill paths={paths} currentId="path-en" onSelect={vi.fn()} onAdd={vi.fn()} />));
    const trigger = screen.getByRole('button', { name: /^EN – Ngôn ngữ đang học: Tiếng Anh/ });
    expect(trigger).toHaveTextContent('EN');
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /Tiếng Anh/, current: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tiếng Hàn.*tạm dừng/ })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('switches path and offers to add a missing language', async () => {
    const onSelect = vi.fn();
    const onAdd = vi.fn();
    const { rerender } = render(withMotion(<LanguagePill paths={paths} currentId="path-en" onSelect={onSelect} onAdd={onAdd} />));
    await userEvent.click(screen.getByRole('button', { name: /Ngôn ngữ đang học/ }));
    await userEvent.click(screen.getByRole('button', { name: /Tiếng Hàn/ }));
    expect(onSelect).toHaveBeenCalledWith('path-ko');

    rerender(withMotion(<LanguagePill paths={[paths[0]!]} currentId="path-en" onSelect={onSelect} onAdd={onAdd} />));
    await userEvent.click(screen.getByRole('button', { name: /Ngôn ngữ đang học/ }));
    await userEvent.click(screen.getByRole('button', { name: '+ Thêm Tiếng Hàn' }));
    expect(onAdd).toHaveBeenCalledWith('ko');
  });

  it('closes on outside click', async () => {
    render(
      withMotion(
        <div>
          <LanguagePill paths={paths} currentId="path-en" onSelect={vi.fn()} onAdd={vi.fn()} />
          <button>outside</button>
        </div>,
      ),
    );
    const trigger = screen.getByRole('button', { name: /Ngôn ngữ đang học/ });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByText('outside'));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes when focus leaves the widget', async () => {
    render(
      withMotion(
        <>
          <LanguagePill paths={paths} currentId="path-en" onSelect={vi.fn()} onAdd={vi.fn()} />
          <button>Sau</button>
        </>,
      ),
    );
    const trigger = screen.getByRole('button', { name: /Ngôn ngữ đang học/ });
    await userEvent.click(trigger);
    await userEvent.tab(); // English
    await userEvent.tab(); // Korean
    await userEvent.tab(); // out of the widget
    expect(screen.getByRole('button', { name: 'Sau' })).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
