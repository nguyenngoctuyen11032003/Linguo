import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../tests/unit/render';
import { ReviewDueCard } from './ReviewDueCard';

type Hook = { status: 'loading' | 'ready' | 'error'; count: number; reload: () => void };
const mocks = vi.hoisted(() => ({ value: null as unknown as Hook }));

vi.mock('@/features/reviews/useReviewDue', () => ({ useReviewDue: () => mocks.value }));

function setHook(value: Partial<Hook>) {
  mocks.value = { status: 'ready', count: 0, reload: vi.fn(), ...value };
}

describe('ReviewDueCard', () => {
  it('shows how many cards are due with a link to the review', () => {
    setHook({ count: 12 });
    renderWithProviders(<ReviewDueCard />, { route: '/app' });
    expect(screen.getByRole('heading', { level: 2, name: 'Ôn tập hôm nay: 12 thẻ' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ôn ngay' })).toHaveAttribute('href', '/app/on-tap');
  });

  it('reserves its place with a skeleton while loading', () => {
    setHook({ status: 'loading', count: 5 });
    const { container } = renderWithProviders(<ReviewDueCard />, { route: '/app' });
    expect(container.querySelector('section')).toBeNull();
    expect(screen.getByText(/Đang tải (số thẻ cần ôn|bài tiếp theo)/).closest('[role=status]')!).toHaveTextContent('Đang tải số thẻ cần ôn');
    expect(screen.getByText(/Đang tải (số thẻ cần ôn|bài tiếp theo)/).closest('[role=status]')!.parentElement).toHaveClass('min-h-26');
  });

  it('uses an outline button so Hôm nay stays the only primary action', () => {
    setHook({ count: 3 });
    renderWithProviders(<ReviewDueCard />, { route: '/app' });
    expect(screen.getByRole('link', { name: 'Ôn ngay' })).not.toHaveClass('bg-primary');
  });

  it('renders nothing with nothing due', () => {
    setHook({ count: 0 });
    const { container } = renderWithProviders(<ReviewDueCard />, { route: '/app' });
    expect(container.querySelector('section')).toBeNull();
  });

  it('fails quietly with a small retry', async () => {
    const reload = vi.fn();
    setHook({ status: 'error', reload });
    renderWithProviders(<ReviewDueCard />, { route: '/app' });
    expect(screen.queryByText(/Ôn tập hôm nay/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tải lại thẻ ôn' }));
    expect(reload).toHaveBeenCalled();
  });
});
