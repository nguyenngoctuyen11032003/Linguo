import { useState } from 'react';
import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReviewSessionApi } from '@/features/reviews/types';
import { renderWithProviders } from '../../../../tests/unit/render';
import { gradeResult, queueTotals, reviewCard, reviewSummary, sessionApi } from './review-fixtures';
import { ReviewPage } from './ReviewPage';

const mocks = vi.hoisted(() => ({ session: null as unknown as ReviewSessionApi, track: vi.fn() }));

vi.mock('@/features/reviews/useReviewSession', () => ({ useReviewSession: () => mocks.session }));
vi.mock('@/features/analytics', () => ({ track: mocks.track }));

function setSession(overrides: Partial<ReviewSessionApi> = {}) {
  mocks.session = sessionApi(overrides);
  return mocks.session;
}

const refresh = { current: () => {} };

/** Re-reads mocks.session on demand, like the real hook re-rendering after a state change. */
function Harness() {
  const [, setTick] = useState(0);
  refresh.current = () => setTick((n) => n + 1);
  return <ReviewPage />;
}

const render = () => renderWithProviders(<Harness />, { route: '/app/on-tap' });

function update(next: ReviewSessionApi) {
  mocks.session = next;
  act(() => refresh.current());
}

describe('ReviewPage', () => {
  beforeEach(() => {
    mocks.track.mockReset();
    setSession();
  });

  it('announces loading', () => {
    setSession({ status: 'loading', card: null });
    render();
    expect(screen.getByRole('heading', { level: 1, name: 'Ôn tập' })).toBeInTheDocument();
    expect(screen.getByText('Đang tải thẻ ôn…')).toBeInTheDocument();
  });

  it('shows the error with a retry', async () => {
    const session = setSession({ status: 'error', card: null, error: 'Không kết nối được máy chủ.' });
    render();
    expect(screen.getByText('Không tải được thẻ ôn')).toBeInTheDocument();
    expect(screen.getByText('Không kết nối được máy chủ.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(session.retry).toHaveBeenCalled();
  });

  it('shows the empty state with a way to learn more', () => {
    setSession({ status: 'empty', card: null, totals: queueTotals({ due_total: 0, served: 0 }) });
    render();
    expect(screen.getByRole('heading', { name: 'Hôm nay không có thẻ cần ôn' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Học bài mới' })).toHaveAttribute('href', '/app/hoc-tap');
    expect(screen.queryByRole('button', { name: '+10 thẻ nữa' })).not.toBeInTheDocument();
  });

  it('offers +10 cards on the empty state when the cap hid some', async () => {
    const session = setSession({ status: 'empty', card: null, totals: queueTotals({ backlog_remaining: 4 }) });
    render();
    await userEvent.click(screen.getByRole('button', { name: '+10 thẻ nữa' }));
    expect(session.loadMore).toHaveBeenCalled();
  });

  it('shows the card position and focuses it', () => {
    setSession({ position: 1, total: 4 });
    render();
    const counter = screen.getByRole('heading', { level: 2, name: 'Thẻ 2/4' });
    expect(counter).toHaveFocus();
    expect(screen.getByRole('progressbar', { name: 'Tiến độ phiên ôn' })).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByTestId('flashcard-front')).toHaveTextContent('hello');
  });

  it('flips with Space and Enter from the card heading', async () => {
    const session = setSession();
    render();
    await userEvent.keyboard(' ');
    expect(session.flip).toHaveBeenCalledTimes(1);
    await userEvent.keyboard('{Enter}');
    // One flip per card: the session already received it.
    expect(session.flip).toHaveBeenCalledTimes(1);
  });

  it('leaves Space to a focused control', async () => {
    const session = setSession();
    render();
    screen.getByRole('button', { name: 'Hoãn sang mai' }).focus();
    await userEvent.keyboard(' ');
    expect(session.flip).not.toHaveBeenCalled();
    expect(session.postpone).toHaveBeenCalledWith(false);
  });

  it('flips once when the flashcard itself is pressed', async () => {
    const session = setSession();
    render();
    await userEvent.click(screen.getByTestId('flashcard-front'));
    expect(session.flip).toHaveBeenCalledTimes(1);
  });

  it('does not rate before the card is flipped', async () => {
    const session = setSession();
    render();
    expect(screen.getByRole('button', { name: /^Được/ })).toBeDisabled();
    await userEvent.keyboard('3');
    expect(session.grade).not.toHaveBeenCalled();
  });

  it('rates with the number keys after flipping, once per key press', async () => {
    const session = setSession({ cardState: { status: 'back' } });
    render();
    expect(screen.getByTestId('flashcard-back')).toHaveTextContent('xin chào');
    await userEvent.keyboard('4');
    expect(session.grade).toHaveBeenCalledTimes(1);
    expect(session.grade).toHaveBeenCalledWith(4, expect.objectContaining({ confidence: null, hintCount: 0 }));
    const meta = vi.mocked(session.grade).mock.calls[0]![1];
    expect(meta.responseMs).toBeGreaterThanOrEqual(0);
  });

  it('does not count a refused grade as reviewed', async () => {
    // grade() resolves but the session keeps the card on its back side (refused); the learner then postpones it.
    const session = setSession({ cardState: { status: 'back' }, total: 1 });
    render();
    await userEvent.keyboard('3');
    expect(session.grade).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Hoãn sang mai' }));
    update({ ...session, status: 'finished', card: null });
    expect(screen.getByText(/^Đã ôn 0 thẻ/)).toBeInTheDocument();
  });

  it('rates through the rating bar', async () => {
    const session = setSession({ cardState: { status: 'back' } });
    render();
    await userEvent.click(screen.getByRole('button', { name: /^Quên/ }));
    expect(session.grade).toHaveBeenCalledWith(1, expect.objectContaining({ confidence: null }));
  });

  it('disables rating while a grade is submitting', () => {
    setSession({ cardState: { status: 'submitting' } });
    render();
    expect(screen.getByRole('button', { name: /^Được/ })).toBeDisabled();
  });

  it('asks optional confidence before flipping a recall card and sends it with the grade', async () => {
    const card = reviewCard({ direction: 'recall' });
    const session = setSession({ card });
    render();
    const group = screen.getByRole('group', { name: 'Bạn nhớ chắc đến đâu? (không bắt buộc)' });
    expect(group).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Đoán' }));
    expect(screen.getByRole('button', { name: 'Đoán' })).toHaveAttribute('aria-pressed', 'true');

    // The session flips the card; the same page keeps the chosen confidence.
    update({ ...session, cardState: { status: 'back' } });
    expect(screen.queryByRole('group', { name: /Bạn nhớ chắc/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Được/ }));
    expect(session.grade).toHaveBeenCalledWith(3, expect.objectContaining({ confidence: 1 }));
  });

  it('does not ask confidence on recognize cards', () => {
    setSession();
    render();
    expect(screen.queryByRole('group', { name: /Bạn nhớ chắc/ })).not.toBeInTheDocument();
  });

  it('can skip confidence and toggle it off again', async () => {
    const session = setSession({ card: reviewCard({ direction: 'recall' }), cardState: { status: 'front' } });
    render();
    await userEvent.click(screen.getByRole('button', { name: 'Chắc chắn' }));
    await userEvent.click(screen.getByRole('button', { name: 'Chắc chắn' }));
    expect(screen.getByRole('button', { name: 'Chắc chắn' })).toHaveAttribute('aria-pressed', 'false');
    update({ ...session, cardState: { status: 'back' } });
    await userEvent.keyboard('2');
    expect(session.grade).toHaveBeenCalledWith(2, expect.objectContaining({ confidence: null }));
  });

  it('postpones the current card with P and with the button', async () => {
    const session = setSession();
    render();
    await userEvent.keyboard('p');
    expect(session.postpone).toHaveBeenCalledWith(false);
    await userEvent.click(screen.getByRole('button', { name: 'Hoãn sang mai' }));
    expect(session.postpone).toHaveBeenCalledTimes(2);
  });

  it('postpones every remaining card', async () => {
    const session = setSession({ position: 0, total: 3 });
    render();
    await userEvent.click(screen.getByRole('button', { name: 'Hoãn tất cả' }));
    expect(session.postpone).toHaveBeenCalledWith(true);
  });

  it('hides "Hoãn tất cả" on the last card', () => {
    setSession({ position: 2, total: 3 });
    render();
    expect(screen.queryByRole('button', { name: 'Hoãn tất cả' })).not.toBeInTheDocument();
  });

  it('toasts when postponing fails', async () => {
    setSession({ postpone: vi.fn().mockRejectedValue(new Error('offline')) });
    render();
    await userEvent.click(screen.getByRole('button', { name: 'Hoãn sang mai' }));
    expect(await screen.findByText('Chưa hoãn được. Kiểm tra mạng rồi thử lại.')).toBeInTheDocument();
  });

  it('ignores shortcuts typed with modifiers', async () => {
    const session = setSession({ cardState: { status: 'back' } });
    render();
    fireEvent.keyDown(window, { key: '3', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'p', metaKey: true });
    expect(session.grade).not.toHaveBeenCalled();
    expect(session.postpone).not.toHaveBeenCalled();
  });

  it('shows the pending-sync count', () => {
    setSession({ pendingCount: 2 });
    render();
    expect(screen.getByText('Đang chờ đồng bộ 2 thẻ')).toBeInTheDocument();
  });

  it('explains recovery mode', () => {
    setSession({ totals: queueTotals({ recovery_mode: true, backlog_remaining: 120 }) });
    render();
    expect(screen.getByRole('note')).toHaveTextContent('Mình chia đều 120 thẻ cho mấy ngày tới');
  });

  describe('summary', () => {
    it('summarises the session and stops for today', async () => {
      const finished = (): ReviewSessionApi => ({
        ...session,
        status: 'finished',
        card: null,
        graded: [gradeResult({ rating_effective: 3, newly_mastered: true }), gradeResult({ rating_effective: 1 })],
        pendingCount: 1,
        summary: reviewSummary({ retention_30d: 0.87 }),
      });
      // Grading the last card finishes the session before grade() resolves.
      const session: ReviewSessionApi = setSession({
        cardState: { status: 'back' },
        grade: vi.fn(async () => update(finished())),
      });
      render();
      await userEvent.keyboard('3');
      await act(async () => {});
      expect(screen.getByRole('heading', { name: 'Xong phiên ôn' })).toHaveFocus();
      expect(screen.getByText('Đã ôn 1 thẻ. Nghỉ ngơi cũng là một phần của việc nhớ lâu.')).toBeInTheDocument();
      expect(screen.getByText('50%')).toBeInTheDocument();
      expect(screen.getByText('7 thẻ')).toBeInTheDocument();
      expect(screen.getByText('Tỷ lệ nhớ 30 ngày: 87%')).toBeInTheDocument();
      expect(screen.getByText('Còn 1 thẻ đang chờ đồng bộ')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '+10 thẻ nữa' })).not.toBeInTheDocument();
      expect(mocks.track).toHaveBeenCalledTimes(1);
      expect(mocks.track).toHaveBeenCalledWith('review_session_completed', { cards: 1, from_session: false });
      await userEvent.click(screen.getByRole('button', { name: 'Hôm nay đủ rồi' }));
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/app$/);
    });

    it('offers +10 cards when more are available', async () => {
      const session = setSession({
        status: 'finished',
        card: null,
        totals: queueTotals({ new_available: 5 }),
        summary: null,
      });
      render();
      expect(screen.getAllByText('—')).toHaveLength(2);
      await userEvent.click(screen.getByRole('button', { name: '+10 thẻ nữa' }));
      expect(session.loadMore).toHaveBeenCalled();
    });
  });
});
