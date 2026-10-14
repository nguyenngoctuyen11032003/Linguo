import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CEFR_FORM, HISTORY, TOPIK_FORM } from './exam-fixtures';
import { ExamFormCard } from './ExamFormCard';
import { ExamHistoryList } from './ExamHistoryList';
import { QuestionTypePicker } from './QuestionTypePicker';
import { renderExam } from './test-utils';

describe('ExamFormCard', () => {
  it('shows the simulated-paper label, level range, sections and the last attempt', () => {
    renderExam(<ExamFormCard form={TOPIK_FORM} warningVi={null} onStart={vi.fn()} busy={false} />);
    const card = screen.getByRole('article', { name: /TOPIK I — Đề luyện số 1/ });
    expect(within(card).getByText('Bài luyện mô phỏng — không phải đề thi chính thức')).toBeInTheDocument();
    expect(within(card).getByText('TOPIK 1–TOPIK 2')).toBeInTheDocument();
    expect(within(card).getByText(/Nghe: 10 câu · 15 phút/)).toBeInTheDocument();
    expect(within(card).getByText(/Đọc: 14 câu · 25 phút/)).toBeInTheDocument();
    expect(within(card).getByText(/Lần gần nhất: 62\/96 điểm/)).toBeInTheDocument();
    expect(within(card).getByText(/Nội dung demo/)).toBeInTheDocument();
  });

  it('shows untimed sections and no last attempt for a fresh form', () => {
    renderExam(<ExamFormCard form={CEFR_FORM} warningVi={null} onStart={vi.fn()} busy={false} />);
    expect(screen.getByText(/Nghe: 8 câu · không giới hạn thời gian/)).toBeInTheDocument();
    expect(screen.queryByText(/Lần gần nhất/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Nội dung demo/)).not.toBeInTheDocument();
  });

  it('shows the structure warning on the card', () => {
    renderExam(
      <ExamFormCard form={TOPIK_FORM} warningVi="Lộ trình của bạn hướng tới TOPIK II." onStart={vi.fn()} busy={false} />,
    );
    expect(screen.getByRole('note')).toHaveTextContent('Lộ trình của bạn hướng tới TOPIK II.');
  });

  it('starts a full mock, a section practice and opens question-type mode', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    renderExam(<ExamFormCard form={TOPIK_FORM} warningVi={null} onStart={onStart} busy={false} />);

    await user.click(screen.getByRole('button', { name: /Thi thử toàn bài/ }));
    expect(onStart).toHaveBeenLastCalledWith('full');

    const sectionToggle = screen.getByRole('button', { name: /Luyện theo phần/ });
    expect(sectionToggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(sectionToggle);
    expect(sectionToggle).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('button', { name: 'Luyện phần Đọc' }));
    expect(onStart).toHaveBeenLastCalledWith('section', 'reading');

    await user.click(screen.getByRole('button', { name: /Luyện theo dạng câu/ }));
    expect(onStart).toHaveBeenLastCalledWith('question_type');
  });

  it('disables every action while busy', () => {
    renderExam(<ExamFormCard form={TOPIK_FORM} warningVi={null} onStart={vi.fn()} busy />);
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
  });
});

describe('QuestionTypePicker', () => {
  it('lists question types grouped by section with counts and readable fallbacks', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    renderExam(<QuestionTypePicker form={TOPIK_FORM} onPick={onPick} />);
    const reading = screen.getByRole('group', { name: 'Đọc' });
    expect(within(reading).getByRole('button', { name: /Đọc — chủ đề.*5 câu/ })).toBeInTheDocument();
    expect(within(reading).getByRole('button', { name: /Đọc — mystery câu 9.*9 câu/ })).toBeInTheDocument();
    await user.click(within(screen.getByRole('group', { name: 'Nghe' })).getByRole('button', { name: /chi tiết/ }));
    expect(onPick).toHaveBeenCalledWith('topik_i_listen_detail');
  });

  it('says so when the form has no question types', () => {
    renderExam(<QuestionTypePicker form={{ ...TOPIK_FORM, question_types: [] }} onPick={vi.fn()} />);
    expect(screen.getByText(/Đề này chưa có dạng câu để luyện/)).toBeInTheDocument();
  });
});

describe('ExamHistoryList', () => {
  it('lists attempts with mode, score, estimated level and status', () => {
    renderExam(<ExamHistoryList entries={HISTORY} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Thi thử toàn bài');
    expect(items[0]).toHaveTextContent('62/96 điểm');
    expect(items[0]).toHaveTextContent('TOPIK 1 (tham khảo)');
    expect(within(items[0]!).getByRole('link', { name: /Xem kết quả/ })).toHaveAttribute(
      'href',
      `/app/luyen-thi/ket-qua/${HISTORY[0]!.attempt_id}`,
    );
    expect(items[1]).toHaveTextContent('Luyện theo phần · Đọc');
    expect(items[1]).toHaveTextContent('Đang làm');
    expect(within(items[1]!).getByRole('link', { name: /Làm tiếp/ })).toHaveAttribute(
      'href',
      `/app/luyen-thi/lam-bai/${HISTORY[1]!.attempt_id}`,
    );
    expect(items[2]).toHaveTextContent('Hết giờ');
  });

  it('renders a compact variant and an empty state', () => {
    const { unmount } = renderExam(<ExamHistoryList entries={HISTORY} compact />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByText('TOPIK I — Đề luyện số 1')).not.toBeInTheDocument();
    unmount();
    renderExam(<ExamHistoryList entries={[]} />);
    expect(screen.getByText('Chưa có lượt thi thử nào.')).toBeInTheDocument();
  });
});
