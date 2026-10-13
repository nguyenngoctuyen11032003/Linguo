import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TodaySessionResult } from '@linguo/shared';
import { activity, studySession } from '@/features/session-link/session-fixtures';
import type { TodaySessionState } from '@/features/session-link/useTodaySession';
import { renderWithProviders } from '../../../../tests/unit/render';
import { TodayCard } from './TodayCard';

const mocks = vi.hoisted(() => ({ value: null as unknown as TodaySessionState, pathIds: [] as Array<string | null> }));

vi.mock('@/features/session-link/useTodaySession', () => ({
  useTodaySession: (pathId: string | null) => {
    mocks.pathIds.push(pathId);
    return mocks.value;
  },
}));

function setHook(status: TodaySessionState['status'], data: Partial<TodaySessionResult> | null = {}, reload = vi.fn()) {
  mocks.value = {
    status,
    data: data && status === 'ready' ? { session: null, studied_seconds_today: 0, daily_goal_minutes: 30, ...data } : null,
    reload,
  };
}

const renderCard = () => renderWithProviders(<TodayCard pathId="path-en" />, { route: '/app' });

describe('TodayCard', () => {
  it('loads today for the given path and shows a skeleton meanwhile', () => {
    setHook('loading');
    renderCard();
    expect(mocks.pathIds.at(-1)).toBe('path-en');
    expect(screen.getByText('Đang tải phiên học hôm nay…').closest('[role="status"]')).not.toBeNull();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('offers to start a session and a short one when none exists', () => {
    setHook('ready', { studied_seconds_today: 12 * 60 + 40, daily_goal_minutes: 30 });
    renderCard();
    expect(screen.getByRole('heading', { level: 2, name: 'Hôm nay' })).toBeInTheDocument();
    expect(screen.getByText('Mục tiêu 30 phút · Đã học 12 phút')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Thời gian học hôm nay' })).toHaveAttribute('aria-valuenow', '12');
    expect(screen.getByRole('link', { name: 'Bắt đầu phiên học' })).toHaveAttribute('href', '/app/phien-hoc');
    expect(screen.getByRole('link', { name: 'Chỉ có 10 phút?' })).toHaveAttribute('href', '/app/phien-hoc?phut=10');
    // No plan yet: no focus and no invented skill figures.
    expect(screen.queryByText(/Kỹ năng ưu tiên/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ưu tiên ôn tập/)).not.toBeInTheDocument();
  });

  it('resumes an open session with its progress, focus and priority skill', () => {
    setHook('ready', { session: studySession() });
    renderCard();
    expect(screen.getByRole('link', { name: 'Tiếp tục phiên (1/3)' })).toHaveAttribute('href', '/app/phien-hoc');
    expect(screen.queryByRole('link', { name: 'Bắt đầu phiên học' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Chỉ có 10 phút?' })).not.toBeInTheDocument();
    expect(screen.getByText('Ưu tiên ôn tập: 20 thẻ đến hạn')).toBeInTheDocument();
    expect(screen.getByText('Kỹ năng ưu tiên: Nghe.')).toBeInTheDocument();
    expect(screen.getByText('Độ chính xác phần nghe 14 ngày qua thấp nhất.')).toBeInTheDocument();
  });

  it('counts skipped activities as finished and hides the skill line without a practice activity', () => {
    setHook('ready', {
      session: studySession({ status: 'planned' }, [activity({ status: 'skipped' }), activity({ id: 'a2', kind: 'lesson', review_limit: null })]),
    });
    renderCard();
    expect(screen.getByRole('link', { name: 'Tiếp tục phiên (1/2)' })).toBeInTheDocument();
    expect(screen.queryByText(/Kỹ năng ưu tiên/)).not.toBeInTheDocument();
  });

  it('says when today is done and lets the learner start another session', () => {
    setHook('ready', { session: studySession({ status: 'completed' }), studied_seconds_today: 1800 });
    renderCard();
    expect(screen.getByText('Bạn đã xong phiên học hôm nay.')).toBeInTheDocument();
    expect(screen.getByText('Mục tiêu 30 phút · Đã học 30 phút')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Bắt đầu phiên học' })).toBeInTheDocument();
  });

  it('handles a rest day without a progress bar', () => {
    setHook('ready', { daily_goal_minutes: 0, studied_seconds_today: 0 });
    renderCard();
    expect(screen.getByText('Hôm nay không có lịch học · Đã học 0 phút')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows a small retry when loading fails', async () => {
    const reload = vi.fn();
    setHook('error', null, reload);
    renderCard();
    expect(screen.getByRole('alert')).toHaveTextContent('Chưa tải được phiên học hôm nay.');
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(reload).toHaveBeenCalled();
  });

  it('renders nothing when the planner is not available', () => {
    setHook('unavailable', null);
    const { container } = renderCard();
    expect(container.querySelector('section')).toBeNull();
    expect(screen.queryByText(/phiên học hôm nay/)).not.toBeInTheDocument();
  });
});
