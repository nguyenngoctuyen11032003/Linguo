import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../tests/unit/render';
import { AccuracyList } from './AccuracyList';
import { skillAccuracyRows, typeAccuracyRows } from './labels';
import { dashboardFixture } from './progress-test-fixtures';

const dashboard = dashboardFixture();

function rowFor(label: string) {
  return screen.getByText(label, { selector: 'h4, span, p, dt, strong' }).closest('li')!;
}

describe('AccuracyList', () => {
  it('renders a titled list with one row per skill', () => {
    renderWithProviders(<AccuracyList title="Theo kỹ năng" rows={skillAccuracyRows(dashboard.skills)} rangeDays={7} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Theo kỹ năng' })).toBeInTheDocument();
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(6);
  });

  it('shows percent and attempts, with the delta in words and an icon', () => {
    renderWithProviders(<AccuracyList title="Theo kỹ năng" rows={skillAccuracyRows(dashboard.skills)} rangeDays={7} />);
    const vocab = rowFor('Từ vựng');
    expect(vocab).toHaveTextContent('82%');
    expect(vocab).toHaveTextContent('40 câu');
    expect(vocab).toHaveTextContent('Tăng 6 điểm so với 7 ngày trước');
    expect(vocab.querySelector('svg')).not.toBeNull();
    expect(rowFor('Ngữ pháp')).toHaveTextContent('Giảm 6 điểm so với 7 ngày trước');
    expect(rowFor('Đọc hiểu')).toHaveTextContent('Không đổi so với 7 ngày trước');
  });

  it('says "Chưa đủ dữ liệu" when accuracy is null, and when there is nothing to compare against', () => {
    renderWithProviders(<AccuracyList title="Theo kỹ năng" rows={skillAccuracyRows(dashboard.skills)} rangeDays={14} />);
    expect(rowFor('Nghe')).toHaveTextContent('Chưa đủ dữ liệu (cần ≥ 10 câu)');
    expect(rowFor('Nghe')).not.toHaveTextContent('%');
    expect(rowFor('Viết')).toHaveTextContent('60%');
    expect(rowFor('Viết')).toHaveTextContent('Chưa có dữ liệu 14 ngày trước để so sánh');
  });

  it('labels exercise types in Vietnamese', () => {
    renderWithProviders(<AccuracyList title="Theo dạng bài" rows={typeAccuracyRows(dashboard.exercise_types)} rangeDays={7} />);
    for (const label of ['Trắc nghiệm', 'Điền vào chỗ trống', 'Sắp xếp từ', 'Dịch câu', 'Nghe và chọn']) {
      expect(rowFor(label)).toBeInTheDocument();
    }
    expect(rowFor('Trắc nghiệm')).toHaveTextContent('90%');
  });
});
