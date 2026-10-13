import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BADGE_KEYS } from '@linguo/shared';
import { renderWithProviders } from '../../../../tests/unit/render';
import { BadgeGrid } from './BadgeGrid';
import { MotivationPanel } from './MotivationPanel';
import { MotivationStrip } from './MotivationStrip';
import { motivationFixture } from './progress-test-fixtures';

const GUILT = /mất chuỗi rồi|đáng tiếc|thất bại|xếp hạng|bỏ cuộc/i;

describe('MotivationPanel', () => {
  it('explains the streak with rest days and grace', () => {
    renderWithProviders(<MotivationPanel motivation={motivationFixture()} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Động lực' })).toBeInTheDocument();
    const streak = screen.getByRole('heading', { level: 3, name: 'Chuỗi ngày học' }).closest('section')!;
    expect(streak).toHaveTextContent('6 buổi');
    expect(streak).toHaveTextContent('Dài nhất: 11 buổi');
    expect(streak).toHaveTextContent('Ngày nghỉ theo lịch không làm mất chuỗi; mỗi tuần được bỏ lỡ 1 buổi');
    expect(streak).toHaveTextContent('Tuần này còn 1 lượt bỏ lỡ');
  });

  it('says when this week grace is used, without guilt', () => {
    renderWithProviders(<MotivationPanel motivation={motivationFixture({ grace_left: 0, streak_current: 0 })} />);
    const streak = screen.getByRole('heading', { level: 3, name: 'Chuỗi ngày học' }).closest('section')!;
    expect(streak).toHaveTextContent('Tuần này đã dùng lượt bỏ lỡ');
    expect(streak).toHaveTextContent('Buổi học tiếp theo sẽ bắt đầu chuỗi mới');
    expect(document.body.textContent).not.toMatch(GUILT);
  });

  it('shows XP as activity, not ability', () => {
    renderWithProviders(<MotivationPanel motivation={motivationFixture()} />);
    const xp = screen.getByRole('heading', { level: 3, name: 'Điểm hoạt động (XP)' }).closest('section')!;
    expect(xp).toHaveTextContent('180 XP tuần này');
    expect(xp).toHaveTextContent('Tổng: 1.240 XP');
    expect(xp).toHaveTextContent('XP đo mức độ hoạt động, không đo trình độ');
  });

  it('shows weekly challenge progress', () => {
    renderWithProviders(<MotivationPanel motivation={motivationFixture()} />);
    const challenge = screen.getByRole('heading', { level: 3, name: 'Thử thách tuần' }).closest('section')!;
    expect(challenge).toHaveTextContent('2/5 ngày');
    expect(challenge).toHaveTextContent('Đã đạt 3 tuần');
    const bar = within(challenge).getByRole('progressbar', { name: 'Thử thách tuần' });
    expect(bar).toHaveAttribute('aria-valuenow', '2');
    expect(bar).toHaveAttribute('aria-valuemax', '5');
  });

  it('celebrates a completed week and handles a week with no scheduled days', () => {
    const { unmount } = renderWithProviders(
      <MotivationPanel
        motivation={motivationFixture({ weekly_challenge: { target_days: 4, done_days: 4, completed: true, completed_weeks: 4 } })}
      />,
    );
    expect(screen.getByText('Đã hoàn thành thử thách tuần này')).toBeInTheDocument();
    unmount();
    renderWithProviders(
      <MotivationPanel
        motivation={motivationFixture({ weekly_challenge: { target_days: 0, done_days: 0, completed: false, completed_weeks: 0 } })}
      />,
    );
    expect(screen.getByText('Tuần này không có ngày học theo lịch.')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('never mentions leaderboards or guilt', () => {
    renderWithProviders(<MotivationPanel motivation={motivationFixture()} />);
    expect(document.body.textContent).not.toMatch(GUILT);
  });
});

describe('BadgeGrid', () => {
  it('shows every badge: earned ones with their date, locked ones with how to earn them', () => {
    renderWithProviders(<BadgeGrid badges={motivationFixture().badges} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Huy hiệu (2/17)' })).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(BADGE_KEYS.length);
    // Earned first, newest first.
    expect(items[0]).toHaveAccessibleName('Đều đặn 7 buổi: đã đạt ngày 05/10/2026');
    expect(items[1]).toHaveAccessibleName('Bài đầu tiên: đã đạt ngày 20/09/2026');
    const locked = screen.getByRole('listitem', { name: /^10 bài học/ });
    expect(locked).toHaveAccessibleName('10 bài học: chưa đạt. Hoàn thành 10 bài học');
    expect(locked).toHaveTextContent('Chưa đạt');
    expect(locked).toHaveTextContent('Hoàn thành 10 bài học');
  });
});

describe('MotivationStrip', () => {
  it('compactly shows streak, weekly challenge and a link to progress', () => {
    renderWithProviders(<MotivationStrip motivation={motivationFixture()} />);
    const strip = screen.getByRole('region', { name: 'Nhịp học tuần này' });
    expect(strip).toHaveTextContent('Chuỗi 6 buổi');
    expect(strip).toHaveTextContent('Thử thách tuần: 2/5 ngày');
    expect(within(strip).getByRole('link', { name: 'Xem tiến độ' })).toHaveAttribute('href', '/app/tien-do');
  });

  it('stays encouraging with no streak', () => {
    renderWithProviders(<MotivationStrip motivation={motivationFixture({ streak_current: 0 })} />);
    expect(screen.getByRole('region')).toHaveTextContent('Chuỗi mới bắt đầu từ buổi học tiếp theo');
    expect(document.body.textContent).not.toMatch(GUILT);
  });
});
