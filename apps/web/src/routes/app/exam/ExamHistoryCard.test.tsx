import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ExamHistoryEntry } from '@linguo/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { examHistory, examHistoryAttemptId } from '@/features/exam/exam-fixtures';
import { TEST_PATH } from '../../../../tests/unit/learning-fixtures';
import { renderWithProviders } from '../../../../tests/unit/render';
import { ExamHistoryCard } from './ExamHistoryCard';

type HistoryHook = { status: 'idle' | 'loading' | 'ready' | 'error'; entries: ExamHistoryEntry[]; error: string | null; reload: () => void };
const mocks = vi.hoisted(() => ({ value: null as unknown as HistoryHook, args: [] as unknown[] }));

vi.mock('@/features/exam/useExamHistory', () => ({
  useExamHistory: (...args: unknown[]) => {
    mocks.args.push(args);
    return mocks.value;
  },
}));

beforeEach(() => {
  mocks.value = { status: 'ready', entries: examHistory(), error: null, reload: vi.fn() };
  mocks.args = [];
});

describe('ExamHistoryCard', () => {
  it('lists recent attempts of the current path compactly with links to their results', () => {
    renderWithProviders(<ExamHistoryCard />);
    expect(mocks.args.at(-1)).toEqual([TEST_PATH.id, 5]);
    expect(screen.getByRole('region', { name: 'Thi thử gần đây' })).toBeInTheDocument();
    expect(screen.getByText('TOPIK II · Luyện theo phần · Đọc')).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: /^Xem kết quả/ });
    expect(links[0]).toHaveAttribute('href', `/app/luyen-thi/ket-qua/${examHistoryAttemptId(3)}`);
    expect(screen.getByRole('link', { name: 'Luyện thi' })).toHaveAttribute('href', '/app/luyen-thi');
  });

  it('uses the given path, limit and heading level', () => {
    renderWithProviders(<ExamHistoryCard pathId="path-x" limit={3} headingLevel="h3" />);
    expect(mocks.args.at(-1)).toEqual(['path-x', 3]);
    expect(screen.getByRole('heading', { level: 3, name: 'Thi thử gần đây' })).toBeInTheDocument();
  });

  it('shows the empty text when there is no attempt yet', () => {
    mocks.value = { status: 'ready', entries: [], error: null, reload: vi.fn() };
    renderWithProviders(<ExamHistoryCard />);
    expect(screen.getByText('Chưa có lượt thi thử nào.')).toBeInTheDocument();
  });

  it('shows loading and a retry on error', async () => {
    const user = userEvent.setup();
    mocks.value = { status: 'loading', entries: [], error: null, reload: vi.fn() };
    const first = renderWithProviders(<ExamHistoryCard />);
    expect(screen.getByText('Đang tải lịch sử thi…')).toBeInTheDocument();
    first.unmount();

    const reload = vi.fn();
    mocks.value = { status: 'error', entries: [], error: 'x', reload };
    renderWithProviders(<ExamHistoryCard />);
    await user.click(screen.getByRole('button', { name: 'Tải lại lịch sử thi' }));
    expect(reload).toHaveBeenCalled();
  });

  it('renders nothing without a path', () => {
    const { container } = renderWithProviders(<ExamHistoryCard />, { paths: { paths: [], currentId: null } });
    expect(container.querySelector('section')).toBeNull();
  });
});
