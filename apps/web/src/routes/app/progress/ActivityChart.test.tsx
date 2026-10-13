import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../tests/unit/render';
import { ActivityChart } from './ActivityChart';
import { FIXTURE_DAYS } from './progress-test-fixtures';

describe('ActivityChart', () => {
  it('summarises the range in an accessible image label', () => {
    renderWithProviders(<ActivityChart days={FIXTURE_DAYS} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAccessibleName(
      'Biểu đồ phút học mỗi ngày trong 7 ngày qua: tổng 1 giờ 30 phút; đạt mục tiêu 2 trên 5 ngày theo lịch; hôm nay 15 phút.',
    );
  });

  it('lists every day in a visually hidden table, marking rest days and today', () => {
    renderWithProviders(<ActivityChart days={FIXTURE_DAYS} />);
    const table = screen.getByRole('table', { name: 'Phút học theo ngày' });
    expect(table.closest('.sr-only')).not.toBeNull();
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(1 + FIXTURE_DAYS.length);
    expect(within(rows[1]!).getByRole('rowheader')).toHaveTextContent('T4 07/10');
    expect(rows[1]).toHaveTextContent('25 phút');
    expect(rows[1]).toHaveTextContent('Đạt mục tiêu');
    expect(rows[4]).toHaveTextContent('Ngày nghỉ theo lịch');
    expect(rows[5]).toHaveTextContent('8 phút');
    expect(rows[5]).toHaveTextContent('Ngày nghỉ theo lịch');
    expect(rows[7]).toHaveTextContent('Hôm nay');
    expect(rows[7]).toHaveTextContent('20 phút');
  });

  it('draws one bar slot per day, with rest days and today visually distinct', () => {
    const { container } = renderWithProviders(<ActivityChart days={FIXTURE_DAYS} />);
    const slots = container.querySelectorAll('[data-day]');
    expect(slots).toHaveLength(7);
    expect(container.querySelectorAll('[data-rest="true"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-today="true"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-goal-tick]')).toHaveLength(5);
  });

  it('labels rest days and today under the bars', () => {
    renderWithProviders(<ActivityChart days={FIXTURE_DAYS} />);
    const axis = screen.getByTestId('activity-axis');
    expect(within(axis).getAllByText('nghỉ')).toHaveLength(2);
    expect(within(axis).getByText('Nay')).toBeInTheDocument();
  });

  it('keeps 28-day axis labels sparse: one per week counted back from today', () => {
    const days = Array.from({ length: 28 }, (_, i) => {
      const date = new Date(Date.UTC(2026, 8, 16 + i)).toISOString().slice(0, 10);
      return { ...FIXTURE_DAYS[0]!, date };
    });
    renderWithProviders(<ActivityChart days={days} />);
    const axis = screen.getByTestId('activity-axis');
    expect(axis.textContent).toBe('22/0929/0906/10Nay');
    expect(within(axis).queryByText('nghỉ')).not.toBeInTheDocument();
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(29);
  });

  it('copes with a range where nothing was studied and nothing scheduled', () => {
    const days = FIXTURE_DAYS.map((d) => ({ ...d, minutes: 0, goal_minutes: 0, active: false }));
    renderWithProviders(<ActivityChart days={days} />);
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Biểu đồ phút học mỗi ngày trong 7 ngày qua: tổng 0 phút; không có ngày học theo lịch; hôm nay 0 phút.',
    );
  });
});
