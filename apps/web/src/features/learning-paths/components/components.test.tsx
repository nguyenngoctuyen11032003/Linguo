import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { TEST_PATH } from '../../../../tests/unit/learning-fixtures';
import { EstimateSummary } from './EstimateSummary';
import { ScheduleEditor, type ScheduleValue } from './ScheduleEditor';
import { presetFromWeek, weekFromPreset } from './schedule';

function Harness({ initial }: { initial: ScheduleValue }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <h2 id="t">Thời gian</h2>
      <ScheduleEditor value={value} onChange={setValue} labelledBy="t" />
      <output data-testid="week">{value.weeklyMinutes.join(',')}</output>
    </>
  );
}

describe('schedule helpers', () => {
  it('converts presets both ways', () => {
    expect(weekFromPreset('30')).toEqual([30, 30, 30, 30, 30, 30, 30]);
    expect(presetFromWeek([60, 60, 60, 60, 60, 60, 60])).toBe('60');
    expect(presetFromWeek([60, 60, 60, 60, 60, 0, 0])).toBe('custom');
  });
});

describe('ScheduleEditor', () => {
  it('applies presets and edits single days in custom mode', async () => {
    render(<Harness initial={{ preset: '30', weeklyMinutes: weekFromPreset('30') }} />);
    await userEvent.click(screen.getByRole('radio', { name: /45–60 phút mỗi ngày/ }));
    expect(screen.getByTestId('week')).toHaveTextContent('60,60,60,60,60,60,60');

    await userEvent.click(screen.getByRole('radio', { name: /Tùy chỉnh từng ngày/ }));
    const sunday = screen.getByLabelText('Chủ nhật');
    await userEvent.clear(sunday);
    await userEvent.type(sunday, '0');
    expect(screen.getByTestId('week')).toHaveTextContent('60,60,60,60,60,60,0');
    expect(screen.getByText('Tổng: 6 giờ mỗi tuần')).toBeInTheDocument();
  });
});

describe('EstimateSummary', () => {
  it('shows the range, feasibility and assumptions', () => {
    render(<EstimateSummary estimate={TEST_PATH.estimate} />);
    expect(screen.getByText('Khoảng 43–69 tuần')).toBeInTheDocument();
    expect(screen.getByText('Không đặt hạn')).toBeInTheDocument();
    expect(screen.getByText('Học 3 giờ 30 phút mỗi tuần')).toBeInTheDocument();
    expect(screen.getByText(/chưa được kiểm duyệt/)).toBeInTheDocument();
  });
});
