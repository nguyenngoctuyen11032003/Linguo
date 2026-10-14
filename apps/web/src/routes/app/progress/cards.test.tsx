import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../tests/unit/render';
import { EstimatesCard } from './EstimatesCard';
import { HowCalculated } from './HowCalculated';
import { MistakesList } from './MistakesList';
import { RangeToggle } from './RangeToggle';
import { TotalsGrid } from './TotalsGrid';
import { dashboardFixture, FIXTURE_LESSON_ID, FIXTURE_PATH_ID } from './progress-test-fixtures';

const dashboard = dashboardFixture();

describe('RangeToggle', () => {
  it('marks the current range and reports a new choice', async () => {
    const onChange = vi.fn();
    renderWithProviders(<RangeToggle value={14} onChange={onChange} />);
    const group = screen.getByRole('group', { name: 'Khoảng thời gian' });
    expect(within(group).getByRole('button', { name: '14 ngày' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(group).getByRole('button', { name: '7 ngày' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(within(group).getByRole('button', { name: '28 ngày' }));
    expect(onChange).toHaveBeenCalledWith(28);
  });

  it('does not report the range that is already selected', async () => {
    const onChange = vi.fn();
    renderWithProviders(<RangeToggle value={7} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: '7 ngày' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('TotalsGrid', () => {
  it('shows activity totals and learning numbers', () => {
    renderWithProviders(<TotalsGrid totals={dashboard.totals} retention={{ value: 0.873, sample: 42 }} masteredTotal={31} />);
    const term = (name: string) => screen.getByText(name, { selector: 'dt' }).parentElement!;
    expect(term('Hôm nay')).toHaveTextContent('15 phút');
    expect(term('Tuần này')).toHaveTextContent('45 / 100 phút mục tiêu');
    expect(term('Trong khoảng')).toHaveTextContent('1 giờ 30 phút');
    expect(term('Bài đã xong')).toHaveTextContent('4');
    expect(term('Lượt ôn')).toHaveTextContent('62');
    expect(term('Bài vận dụng')).toHaveTextContent('7');
    expect(term('Giữ lại sau trì hoãn')).toHaveTextContent('87%');
    expect(term('Giữ lại sau trì hoãn')).toHaveTextContent('42 lượt ôn');
    expect(term('Mục đã thành thạo')).toHaveTextContent('31');
  });

  it('says "Chưa đủ dữ liệu" when retention is unknown', () => {
    renderWithProviders(<TotalsGrid totals={dashboard.totals} retention={{ value: null, sample: 3 }} masteredTotal={0} />);
    expect(screen.getByText('Giữ lại sau trì hoãn', { selector: 'dt' }).parentElement).toHaveTextContent('Chưa đủ dữ liệu');
  });

  it('handles a week without a goal', () => {
    renderWithProviders(
      <TotalsGrid totals={{ ...dashboard.totals, week_goal_minutes: 0 }} retention={{ value: null, sample: 0 }} masteredTotal={0} />,
    );
    expect(screen.getByText('Tuần này', { selector: 'dt' }).parentElement).toHaveTextContent('Không có mục tiêu tuần này');
  });
});

describe('EstimatesCard', () => {
  it('labels every value as an estimate with confidence, source and date', () => {
    renderWithProviders(<EstimatesCard estimates={dashboard.estimates} pathId={FIXTURE_PATH_ID} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Năng lực ước lượng' })).toBeInTheDocument();
    const vocab = screen.getByRole('heading', { level: 3, name: 'Từ vựng' }).closest('li')!;
    expect(vocab).toHaveTextContent('Ước lượng');
    expect(vocab).toHaveTextContent('A2');
    expect(vocab).toHaveTextContent('Độ tin cậy: Trung bình');
    expect(vocab).toHaveTextContent('Nguồn: Kiểm tra đầu vào');
    expect(vocab).toHaveTextContent('01/10/2026');
    expect(vocab).toHaveTextContent('18 câu');
    const grammar = screen.getByRole('heading', { level: 3, name: 'Ngữ pháp' }).closest('li')!;
    expect(grammar).toHaveTextContent('Độ tin cậy: Tự đánh giá');
    expect(grammar).toHaveTextContent('Nguồn: Bạn tự đánh giá');
    expect(grammar).toHaveTextContent('15/09/2026');
  });

  it("dates estimates by the learner's local day", () => {
    const late = [{ ...dashboard.estimates[0]!, assessed_at: '2026-09-30T20:00:00+00:00' }];
    renderWithProviders(<EstimatesCard estimates={late} pathId={FIXTURE_PATH_ID} />, {
      profile: { profile: { id: 'u', displayName: 'Minh Anh', timezone: 'Asia/Ho_Chi_Minh' } },
    });
    expect(screen.getByRole('heading', { level: 3, name: 'Từ vựng' }).closest('li')).toHaveTextContent('01/10/2026');
  });

  it('lists skills without an estimate and links to retake the diagnostic', () => {
    renderWithProviders(<EstimatesCard estimates={dashboard.estimates} pathId={FIXTURE_PATH_ID} />);
    const listening = screen.getByRole('heading', { level: 3, name: 'Nghe' }).closest('li')!;
    expect(listening).toHaveTextContent('Chưa có ước lượng');
    expect(screen.getByRole('link', { name: 'Làm lại kiểm tra đầu vào' })).toHaveAttribute('href', `/app/kiem-tra/${FIXTURE_PATH_ID}`);
  });

  it('invites a first diagnostic when there are no estimates at all', () => {
    renderWithProviders(<EstimatesCard estimates={[]} pathId={FIXTURE_PATH_ID} />);
    expect(screen.getByRole('link', { name: 'Làm kiểm tra đầu vào' })).toHaveAttribute('href', `/app/kiem-tra/${FIXTURE_PATH_ID}`);
    expect(screen.queryByText('Ước lượng')).not.toBeInTheDocument();
  });
});

describe('MistakesList', () => {
  it('lists mistakes with a link back to the lesson', () => {
    renderWithProviders(<MistakesList mistakes={dashboard.mistakes} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Lỗi thường gặp' })).toBeInTheDocument();
    const item = screen.getByRole('listitem');
    expect(item).toHaveTextContent('She ___ to school every day.');
    expect(item).toHaveTextContent('Sai 3 lần');
    expect(item).toHaveTextContent('12/10/2026');
    expect(within(item).getByRole('link', { name: 'Học lại bài Thì hiện tại đơn' })).toHaveAttribute(
      'href',
      `/app/hoc-tap/bai/${FIXTURE_LESSON_ID}`,
    );
  });

  it("dates the last mistake by the learner's local day", () => {
    const late = [{ ...dashboard.mistakes[0]!, last_wrong_at: '2026-10-12T23:30:00+00:00' }];
    renderWithProviders(<MistakesList mistakes={late} />, {
      profile: { profile: { id: 'u', displayName: 'Minh Anh', timezone: 'Asia/Ho_Chi_Minh' } },
    });
    expect(screen.getByRole('listitem')).toHaveTextContent('13/10/2026');
  });

  it('shows an encouraging empty state', () => {
    renderWithProviders(<MistakesList mistakes={[]} />);
    expect(screen.getByText('Không có lỗi nào lặp lại trong khoảng này')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});

describe('HowCalculated', () => {
  it('is a disclosure explaining activity, learning and competence', async () => {
    const { container } = renderWithProviders(<HowCalculated />);
    const details = container.querySelector('details')!;
    expect(details).not.toHaveAttribute('open');
    await userEvent.click(screen.getByText('Cách tính các số liệu'));
    expect(details).toHaveAttribute('open');
    for (const heading of ['Hoạt động', 'Học tập', 'Năng lực', 'Động lực']) {
      expect(within(details).getByRole('heading', { level: 3, name: heading })).toBeInTheDocument();
    }
    expect(details).toHaveTextContent('tối đa 2 phút');
    expect(details).toHaveTextContent('10 câu');
    expect(details).toHaveTextContent('300 XP');
  });
});
