import { useState } from 'react';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReviewSessionApi } from '@/features/reviews/types';
import { FIXTURE_SESSION_ID } from '@/features/session-link/session-fixtures';
import { renderWithProviders } from '../../../../tests/unit/render';
import { queueTotals, sessionApi } from './review-fixtures';
import { ReviewPage } from './ReviewPage';

// Spec 6 §4: a review opened from the study session (?phien=&muc=&so-the=) takes at most so-the cards, reports the
// activity done and leads back to the session.

const mocks = vi.hoisted(() => ({
  session: null as unknown as ReviewSessionApi,
  options: [] as unknown[],
  report: vi.fn(),
}));

vi.mock('@/features/reviews/useReviewSession', () => ({
  useReviewSession: (options: unknown) => {
    mocks.options.push(options);
    return mocks.session;
  },
}));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({}), requireSupabase: () => ({}) }));
vi.mock('@/features/session-link/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/session-link/service')>()),
  reportSessionItem: mocks.report,
}));

const refresh = { current: () => {} };

function Harness() {
  const [, setTick] = useState(0);
  refresh.current = () => setTick((n) => n + 1);
  return <ReviewPage />;
}

const LINK = `?phien=${FIXTURE_SESSION_ID}&muc=a1&so-the=6`;
const render = (search = LINK) => renderWithProviders(<Harness />, { route: `/app/on-tap${search}` });

function update(next: ReviewSessionApi) {
  mocks.session = next;
  act(() => refresh.current());
}

beforeEach(() => {
  mocks.options = [];
  mocks.session = sessionApi();
  mocks.report.mockReset();
  mocks.report.mockResolvedValue(undefined);
});

describe('ReviewPage in a study session', () => {
  it('limits the queue to the review limit of the activity', () => {
    render();
    expect(mocks.options.at(-1)).toEqual({ limit: 6 });
  });

  it('keeps the default queue without a session link', () => {
    render('');
    expect(mocks.options.at(-1)).toEqual({ limit: undefined });
  });

  it('reports done with the time spent when the cards run out, then leads back', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.setSystemTime(new Date('2026-10-13T08:00:00Z'));
      render();
      expect(mocks.report).not.toHaveBeenCalled();
      vi.setSystemTime(new Date('2026-10-13T08:02:00Z'));
      update(sessionApi({ status: 'finished', card: null, totals: queueTotals({ new_available: 5 }) }));
      await waitFor(() => expect(mocks.report).toHaveBeenCalledTimes(1));
      expect(mocks.report).toHaveBeenCalledWith({}, { sessionId: FIXTURE_SESSION_ID, itemId: 'a1', status: 'done', seconds: 120 });
    } finally {
      vi.useRealTimers();
    }
    expect(screen.getByRole('heading', { name: 'Xong phiên ôn' })).toBeInTheDocument();
    // No extra batch inside a session: the planner decided how many cards fit.
    expect(screen.queryByRole('button', { name: '+10 thẻ nữa' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hôm nay đủ rồi' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Quay lại phiên học' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/app\/phien-hoc$/));
    expect(mocks.report).toHaveBeenCalledTimes(1);
  });

  it('counts an empty queue as done and offers the way back', async () => {
    mocks.session = sessionApi({ status: 'empty', card: null, totals: queueTotals({ backlog_remaining: 4 }) });
    render();
    await waitFor(() => expect(mocks.report).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: '+10 thẻ nữa' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Học bài mới' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Quay lại phiên học' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/app\/phien-hoc$/));
  });

  it('does not report while cards remain', async () => {
    render();
    await act(async () => {});
    expect(mocks.report).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Quay lại phiên học' })).not.toBeInTheDocument();
  });

  it('behaves as before without the session params', async () => {
    mocks.session = sessionApi({ status: 'finished', card: null, totals: queueTotals({ new_available: 5 }) });
    render('');
    await act(async () => {});
    expect(mocks.report).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Quay lại phiên học' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+10 thẻ nữa' })).toBeInTheDocument();
  });
});
