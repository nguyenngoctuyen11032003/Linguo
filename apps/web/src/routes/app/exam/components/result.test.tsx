import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CEFR_RESULT, TOPIK_RESULT } from './exam-fixtures';
import { QuestionTypeBreakdown } from './QuestionTypeBreakdown';
import { ResultSummary } from './ResultSummary';
import { ReviewList } from './ReviewList';
import { renderExam } from './test-utils';

describe('ResultSummary', () => {
  it('shows totals, section scores, the TOPIK estimate and every disclaimer', () => {
    renderExam(<ResultSummary result={TOPIK_RESULT} />);
    expect(screen.getByText('Bài luyện mô phỏng — không phải đề thi chính thức')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'TOPIK I — Đề luyện số 1' })).toBeInTheDocument();
    expect(screen.getByText('8/13')).toBeInTheDocument();
    const sections = screen.getByRole('list', { name: 'Điểm theo phần' });
    expect(within(sections).getAllByRole('listitem')).toHaveLength(3);
    expect(within(sections).getAllByRole('listitem')[0]).toHaveTextContent('Nghe');
    expect(within(sections).getAllByRole('listitem')[0]).toHaveTextContent('4/4 điểm · 1/1 câu đúng');
    expect(within(sections).getAllByRole('listitem')[2]).toHaveTextContent('Quy đổi: 80');
    expect(screen.getByText(/Bậc ước lượng: TOPIK 1/)).toBeInTheDocument();
    expect(screen.getByText(/Tổng quy đổi: 92,5/)).toBeInTheDocument();
    expect(screen.getByText('Quy đổi tham khảo, không phải kết quả chính thức')).toBeInTheDocument();
    expect(screen.getByText('Thang điểm chưa được đối chiếu với quy chế hiện hành')).toBeInTheDocument();
    expect(screen.getByText(/Nguồn thang điểm: Thang điểm TOPIK/)).toBeInTheDocument();
    expect(screen.getByText(/Bài viết luận chưa được chấm điểm tự động/)).toBeInTheDocument();
  });

  it('CEFR: per-section "đạt mức" lines without score conversion', () => {
    renderExam(<ResultSummary result={CEFR_RESULT} />);
    expect(screen.getByText('Đạt mức A2 ở phần Đọc (ước lượng)')).toBeInTheDocument();
    expect(screen.getByText('Chưa đạt mức A2 ở phần Nghe (ước lượng)')).toBeInTheDocument();
    expect(screen.queryByText(/Quy đổi:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Bậc ước lượng/)).not.toBeInTheDocument();
    expect(screen.getByText('Quy đổi tham khảo, không phải kết quả chính thức')).toBeInTheDocument();
    expect(screen.queryByText('Thang điểm chưa được đối chiếu với quy chế hiện hành')).not.toBeInTheDocument();
  });

  it('explains an expired attempt and omits the estimate when there is none', () => {
    renderExam(<ResultSummary result={{ ...TOPIK_RESULT, status: 'expired', estimated_level: null }} />);
    expect(screen.getByText(/Hết giờ — bài đã được nộp tự động/)).toBeInTheDocument();
    expect(screen.queryByText('Quy đổi tham khảo, không phải kết quả chính thức')).not.toBeInTheDocument();
  });
});

describe('QuestionTypeBreakdown', () => {
  it('sorts by accuracy ascending and drills a type', async () => {
    const user = userEvent.setup();
    const onDrill = vi.fn();
    renderExam(<QuestionTypeBreakdown result={TOPIK_RESULT} onDrill={onDrill} />);
    const rows = within(screen.getByRole('list', { name: 'Kết quả theo dạng câu' })).getAllByRole('listitem');
    expect(rows.map((r) => r.querySelector('h3')?.textContent)).toEqual([
      'Đọc — chủ đề',
      'Viết — điền câu (kiểu câu 51)',
      'Nghe — chọn câu đáp lại',
    ]);
    expect(rows[0]).toHaveTextContent('0/2 câu đúng (0%)');
    await user.click(within(rows[0]!).getByRole('button', { name: 'Luyện dạng này: Đọc — chủ đề' }));
    expect(onDrill).toHaveBeenCalledWith('topik_i_read_topic');
  });
});

describe('ReviewList', () => {
  it('shows your answer vs the correct answer with icons and text, plus the explanation', () => {
    renderExam(<ReviewList result={TOPIK_RESULT} />);
    const items = screen.getAllByRole('article');
    expect(items).toHaveLength(4);

    expect(items[0]).toHaveTextContent('Đúng');
    expect(within(items[0]!).getByText(/가: 가방이 있어요\?/)).toHaveAttribute('lang', 'ko');
    expect(items[0]).toHaveTextContent('Lời thoại');

    const wrong = items[1]!;
    expect(wrong).toHaveTextContent('Sai');
    expect(within(wrong).getByText('Bạn chọn:').parentElement).toHaveTextContent('음식');
    expect(within(wrong).getByText('Đáp án đúng:').parentElement).toHaveTextContent('운동');
    expect(wrong).toHaveTextContent('Đạp xe là một môn thể thao');

    expect(items[2]).toHaveTextContent('Chưa trả lời');
    expect(items[2]).toHaveTextContent('시간이 있어요');
  });

  it('essay: rubric as a self-assessment checklist and the sample answer in a disclosure', async () => {
    const user = userEvent.setup();
    renderExam(<ReviewList result={TOPIK_RESULT} />);
    const essay = screen.getAllByRole('article')[3]!;
    expect(essay).toHaveTextContent('Tự đánh giá');
    expect(within(essay).getByText('Hi Sam, I went hiking on Saturday.')).toHaveAttribute('lang', 'en');
    const boxes = within(essay).getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    expect(within(essay).getByText(/Tự chấm: 0\/20 điểm/)).toBeInTheDocument();
    await user.click(within(essay).getByRole('checkbox', { name: /Hoàn thành yêu cầu/ }));
    expect(within(essay).getByText(/Tự chấm: 10\/20 điểm/)).toBeInTheDocument();
    const summary = within(essay).getByText('Xem bài mẫu');
    expect(summary.closest('details')).not.toHaveAttribute('open');
    await user.click(summary);
    expect(summary.closest('details')).toHaveAttribute('open');
  });

  it('falls back to the family language when the stem is Vietnamese', () => {
    const review = CEFR_RESULT.review.map((r) => ({ ...r, prompt: { ...r.prompt, stem_lang: 'vi' as const } }));
    renderExam(<ReviewList result={{ ...CEFR_RESULT, review }} />);
    expect(screen.getByText('Hi Sam, I went hiking on Saturday.')).toHaveAttribute('lang', 'en');
  });
});
