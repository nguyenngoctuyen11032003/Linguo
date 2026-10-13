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
    localStorage.setItem('lp-reduce-motion', 'true');
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

describe('ArrowCTA', () => {
  it('is a link with the given label', () => {
    render(withMotion(<ArrowCTA to="/dang-ky">Bắt đầu miễn phí</ArrowCTA>));
    expect(screen.getByRole('link', { name: 'Bắt đầu miễn phí' })).toHaveAttribute('href', '/dang-ky');
  });
});

describe('LanguagePill', () => {
  it('shows text labels, marks Korean as coming soon and closes on Escape', async () => {
    render(withMotion(<LanguagePill />));
    const trigger = screen.getByRole('button', { name: /Ngôn ngữ đang học: Tiếng Anh/ });
    expect(trigger).toHaveTextContent('EN');
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitemradio', { name: /Tiếng Anh/ })).toHaveAttribute('aria-checked', 'true');
    const ko = screen.getByRole('menuitemradio', { name: /Tiếng Hàn/ });
    expect(ko).toBeDisabled();
    expect(ko).toHaveTextContent('Sắp ra mắt');
    await userEvent.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
