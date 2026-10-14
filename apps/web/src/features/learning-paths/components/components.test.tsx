import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { TEST_PATH } from '../../../../tests/unit/learning-fixtures';
import { ChoiceList } from './ChoiceList';
import { EstimateSummary } from './EstimateSummary';
import { FeasibilityBadge } from './FeasibilityBadge';
import { ScheduleEditor, type ScheduleValue } from './ScheduleEditor';
import { presetFromWeek, weekFromPreset } from './schedule';

function Harness({ initial, error }: { initial: ScheduleValue; error?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <h2 id="t">Thời gian</h2>
      <ScheduleEditor value={value} onChange={setValue} labelledBy="t" error={error} />
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

  it('lets a day be emptied while typing and restores 0 on blur', async () => {
    render(<Harness initial={{ preset: 'custom', weeklyMinutes: [30, 30, 30, 30, 30, 30, 45] }} />);
    const sunday = screen.getByLabelText('Chủ nhật');
    await userEvent.clear(sunday);
    expect(sunday).toHaveValue(null); // still empty, not forced back to 0
    expect(screen.getByTestId('week')).toHaveTextContent('30,30,30,30,30,30,0');
    await userEvent.tab();
    expect(sunday).toHaveValue(0);
    expect(screen.getByTestId('week')).toHaveTextContent('30,30,30,30,30,30,0');
  });

  it('reports clamped numbers and clamps the field on blur', async () => {
    render(<Harness initial={{ preset: 'custom', weeklyMinutes: [30, 30, 30, 30, 30, 30, 30] }} />);
    const monday = screen.getByLabelText('Thứ Hai');
    await userEvent.clear(monday);
    await userEvent.type(monday, '999');
    expect(screen.getByTestId('week')).toHaveTextContent('720,30,30,30,30,30,30');
    await userEvent.tab();
    expect(monday).toHaveValue(720);
  });

  it('names day inputs through their label only, without step or stray aria-label', async () => {
    render(<Harness initial={{ preset: 'custom', weeklyMinutes: weekFromPreset('30') }} />);
    const input = screen.getByLabelText('Thứ Ba');
    expect(input).not.toHaveAttribute('aria-label');
    expect(input).not.toHaveAttribute('step');
  });

  it('links the error message to the group and the day inputs', () => {
    render(<Harness error="Chọn ít nhất một ngày" initial={{ preset: 'custom', weeklyMinutes: weekFromPreset('30') }} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('id');
    expect(screen.getByRole('group', { name: 'Thời gian' })).toHaveAttribute('aria-describedby', alert.id);
    expect(screen.getByLabelText('Thứ Hai')).toHaveAttribute('aria-describedby', alert.id);
  });

  it('gives each instance its own radio group name', () => {
    render(
      <>
        <Harness initial={{ preset: '30', weeklyMinutes: weekFromPreset('30') }} />
        <Harness initial={{ preset: '60', weeklyMinutes: weekFromPreset('60') }} />
      </>,
    );
    const names = new Set(screen.getAllByRole('radio').map((r) => r.getAttribute('name')));
    expect(names.size).toBe(2);
  });
});

describe('ChoiceList', () => {
  it('dims only the label and description of disabled options, not the note', () => {
    render(
      <>
        <h2 id="l">Chọn</h2>
        <ChoiceList
          name="x"
          labelledBy="l"
          value={undefined}
          onChange={() => {}}
          options={[{ value: 'a', label: 'Nhãn', description: 'Mô tả', note: 'Sắp ra mắt', disabled: true }]}
        />
      </>,
    );
    expect(screen.getByText('Nhãn')).toHaveClass('opacity-60');
    expect(screen.getByText('Mô tả')).toHaveClass('opacity-60');
    expect(screen.getByText('Sắp ra mắt')).not.toHaveClass('opacity-60');
    expect(screen.getByRole('group', { name: 'Chọn' })).toHaveClass('min-w-0');
    expect(screen.getByRole('radio')).toHaveClass('focus-visible:outline-none');
  });
});

describe('FeasibilityBadge', () => {
  it('uses the contrast-safe text tokens', () => {
    render(
      <>
        <FeasibilityBadge feasibility="feasible" />
        <FeasibilityBadge feasibility="needs_more_time" />
      </>,
    );
    expect(screen.getByText('Khả thi theo kế hoạch').closest('span')).toHaveClass('text-success-text');
    expect(screen.getByText('Cần tăng thời lượng').closest('span')).toHaveClass('text-error-text');
  });
});

describe('EstimateSummary', () => {
  it('shows the range, feasibility and assumptions', () => {
    render(<EstimateSummary estimate={TEST_PATH.estimate} />);
    expect(screen.getByText('Khoảng 10–16 tháng')).toBeInTheDocument();
    expect(screen.getByText('Tương đương 43–69 tuần học')).toBeInTheDocument();
    expect(screen.queryByTestId('estimate-nudge')).not.toBeInTheDocument();
    expect(screen.getByText('Không đặt hạn')).toBeInTheDocument();
    expect(screen.getByText('Học 3 giờ 30 phút mỗi tuần')).toBeInTheDocument();
    expect(screen.getByText(/chưa được kiểm duyệt/)).toBeInTheDocument();
    expect(screen.getByText('Khoảng dao động từ ×0,8 đến ×1,3 so với trung bình')).toBeInTheDocument();
  });

  it('collapses an identical min and max into a single figure', () => {
    render(<EstimateSummary estimate={{ ...TEST_PATH.estimate, weeksMin: 12, weeksMax: 12 }} />);
    expect(screen.getByText('Khoảng 12 tuần')).toBeInTheDocument();
  });

  it('quotes a multi-year plan in years and nudges towards more minutes a day', () => {
    render(<EstimateSummary estimate={{ ...TEST_PATH.estimate, weeksMin: 264, weeksMid: 346, weeksMax: 428, hoursNeeded: 605 }} />);
    expect(screen.getByText('Khoảng 5–8 năm')).toBeInTheDocument();
    expect(screen.getByTestId('estimate-nudge')).toHaveTextContent('Tăng lên 50 phút/ngày để rút ngắn đáng kể.');
  });

  it('formats the multiplier range and hours with Vietnamese number formatting', () => {
    render(
      <EstimateSummary
        estimate={{
          ...TEST_PATH.estimate,
          assumptions: { ...TEST_PATH.estimate.assumptions, hoursNeeded: 1250, multiplierRange: [0.75, 1.5] },
        }}
      />,
    );
    expect(screen.getByText('Khoảng dao động từ ×0,75 đến ×1,5 so với trung bình')).toBeInTheDocument();
    expect(screen.getByText(/Cần khoảng 1\.250 giờ học/)).toBeInTheDocument();
  });
});
