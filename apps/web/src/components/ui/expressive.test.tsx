import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
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
  it('uses a disclosure pattern, marks the current language and Korean as coming soon', async () => {
    render(withMotion(<LanguagePill />));
    const trigger = screen.getByRole('button', { name: /Ngôn ngữ đang học: Tiếng Anh/ });
    expect(trigger).toHaveTextContent('EN');
    expect(trigger.getAttribute('aria-label')).toMatch(/^EN – Ngôn ngữ đang học: Tiếng Anh\. Đổi ngôn ngữ$/);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).not.toHaveAttribute('aria-haspopup');
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveAttribute('aria-controls', screen.getByRole('list').id);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tiếng Anh \(/ })).toHaveAttribute('aria-current', 'true');
    const ko = screen.getByRole('button', { name: /Tiếng Hàn/ });
    expect(ko).toHaveAttribute('aria-disabled', 'true');
    expect(ko).not.toBeDisabled();
    expect(ko).toHaveTextContent('Sắp ra mắt');
    await userEvent.click(ko);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    render(withMotion(<LanguagePill />));
    const trigger = screen.getByRole('button', { name: /Ngôn ngữ đang học/ });
    await userEvent.click(trigger);
    await userEvent.tab();
    expect(trigger).not.toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('closes on an outside click', async () => {
    render(
      withMotion(
        <>
          <LanguagePill />
          <p>Bên ngoài</p>
        </>,
      ),
    );
    const trigger = screen.getByRole('button', { name: /Ngôn ngữ đang học/ });
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(screen.getByText('Bên ngoài'));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes when focus leaves the widget', async () => {
    render(
      withMotion(
        <>
          <LanguagePill />
          <button>Sau</button>
        </>,
      ),
    );
    const trigger = screen.getByRole('button', { name: /Ngôn ngữ đang học/ });
    await userEvent.click(trigger);
    await userEvent.tab(); // English
    await userEvent.tab(); // Korean (aria-disabled stays focusable)
    await userEvent.tab(); // out of the widget
    expect(screen.getByRole('button', { name: 'Sau' })).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
