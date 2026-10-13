import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ESSAY_QUESTION, LISTEN_QUESTION, MCQ_QUESTION, QUESTIONS, SHORT_QUESTION } from './exam-fixtures';
import { ExamTimer } from './ExamTimer';
import { QuestionNavigator } from './QuestionNavigator';
import { QuestionView } from './QuestionView';
import { SubmitDialog } from './SubmitDialog';
import { renderExam } from './test-utils';

const noop = () => {};

describe('ExamTimer', () => {
  it('shows mm:ss and an untimed label', () => {
    const { rerender } = renderExam(<ExamTimer remainingMs={65 * 60_000} />);
    expect(screen.getByRole('timer')).toHaveTextContent('65:00');
    rerender(<ExamTimer remainingMs={61_400} />);
    expect(screen.getByRole('timer')).toHaveTextContent('01:02');
    rerender(<ExamTimer remainingMs={-5} />);
    expect(screen.getByRole('timer')).toHaveTextContent('00:00');
    rerender(<ExamTimer remainingMs={null} />);
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(screen.getByText('Không giới hạn thời gian')).toBeInTheDocument();
  });

  it('announces only when crossing 5 minutes and 1 minute', () => {
    const { rerender } = renderExam(<ExamTimer remainingMs={5 * 60_000 + 2000} />);
    const status = screen.getByRole('status');
    expect(status).toBeEmptyDOMElement();
    expect(screen.getByRole('timer')).not.toHaveAttribute('data-warning');

    rerender(<ExamTimer remainingMs={5 * 60_000 + 1000} />);
    expect(status).toBeEmptyDOMElement();
    rerender(<ExamTimer remainingMs={4 * 60_000 + 59_000} />);
    expect(status).toHaveTextContent('Còn 5 phút');
    expect(screen.getByRole('timer')).toHaveAttribute('data-warning', 'true');
    rerender(<ExamTimer remainingMs={3 * 60_000} />);
    expect(status).toHaveTextContent('Còn 5 phút');
    rerender(<ExamTimer remainingMs={59_000} />);
    expect(status).toHaveTextContent('Còn 1 phút');
  });

  it('does not announce on mount when resuming under five minutes', () => {
    renderExam(<ExamTimer remainingMs={2 * 60_000} />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.getByText(/Sắp hết giờ/)).toBeInTheDocument();
  });
});

describe('QuestionNavigator', () => {
  const questions = QUESTIONS;

  it('groups numbers by section and conveys state in text, not colour alone', async () => {
    const user = userEvent.setup();
    const onGo = vi.fn();
    renderExam(<QuestionNavigator questions={questions} currentId={questions[1]!.question_id} onGo={onGo} />);
    const nav = screen.getByRole('navigation', { name: 'Danh sách câu hỏi' });
    const listening = within(nav).getByRole('group', { name: 'Nghe' });
    expect(within(listening).getAllByRole('button')).toHaveLength(1);
    expect(within(nav).getByRole('group', { name: 'Viết' })).toBeInTheDocument();

    expect(within(nav).getByRole('button', { name: 'Câu 1: đã trả lời' })).toBeInTheDocument();
    const current = within(nav).getByRole('button', { name: 'Câu 2: chưa trả lời, câu đang làm' });
    expect(current).toHaveAttribute('aria-current', 'step');
    expect(within(nav).getByRole('button', { name: 'Câu 3: đã trả lời, đã đánh dấu xem lại' })).toBeInTheDocument();
    await user.click(within(nav).getByRole('button', { name: /^Câu 4/ }));
    expect(onGo).toHaveBeenCalledWith(questions[3]!.question_id);
  });
});

describe('QuestionView', () => {
  it('renders the passage and options in the target language as a keyboard radio group', async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    renderExam(<QuestionView question={MCQ_QUESTION} language="ko" listenLimit={null} onAnswer={onAnswer} onToggleFlag={noop} />);
    expect(screen.getByText('Đọc đoạn văn và chọn chủ đề phù hợp.')).toBeInTheDocument();
    expect(screen.getByText(/자전거를 탑니다/)).toHaveAttribute('lang', 'ko');
    expect(screen.getByText('무엇에 대한 이야기입니까?')).toHaveAttribute('lang', 'ko');
    const group = screen.getByRole('radiogroup', { name: '무엇에 대한 이야기입니까?' });
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(4);
    await user.click(radios[2]!);
    expect(onAnswer).toHaveBeenLastCalledWith('c');
  });

  it('moves the selection with arrow keys', () => {
    const onAnswer = vi.fn();
    renderExam(
      <QuestionView question={{ ...MCQ_QUESTION, answer: 'b' }} language="ko" listenLimit={null} onAnswer={onAnswer} onToggleFlag={noop} />,
    );
    const radios = screen.getAllByRole('radio');
    expect(radios[1]).toHaveAttribute('aria-checked', 'true');
    expect(radios[1]).toHaveAttribute('tabindex', '0');
    expect(radios[0]).toHaveAttribute('tabindex', '-1');
    radios[1]!.focus();
    fireEvent.keyDown(radios[1]!, { key: 'ArrowDown' });
    expect(onAnswer).toHaveBeenLastCalledWith('c');
  });

  it('toggles the flag with aria-pressed', async () => {
    const user = userEvent.setup();
    const onToggleFlag = vi.fn();
    renderExam(<QuestionView question={SHORT_QUESTION} language="ko" listenLimit={null} onAnswer={noop} onToggleFlag={onToggleFlag} />);
    const flag = screen.getByRole('button', { name: 'Đánh dấu xem lại' });
    expect(flag).toHaveAttribute('aria-pressed', 'true');
    await user.click(flag);
    expect(onToggleFlag).toHaveBeenCalledTimes(1);
  });

  it('short_text: limits input to 200 characters and reports blank as null', async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    renderExam(<QuestionView question={SHORT_QUESTION} language="ko" listenLimit={null} onAnswer={onAnswer} onToggleFlag={noop} />);
    const input = screen.getByRole('textbox', { name: /Câu trả lời/ });
    expect(input).toHaveAttribute('maxLength', '200');
    expect(input).toHaveAttribute('lang', 'ko');
    expect(input).toHaveValue('시간이 있어요');
    await user.clear(input);
    expect(onAnswer).toHaveBeenLastCalledWith(null);
    await user.type(input, 'ok');
    expect(onAnswer).toHaveBeenLastCalledWith('ok');
  });

  it('essay: live character count against the guidance, never blocking', async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    renderExam(<QuestionView question={ESSAY_QUESTION} language="en" listenLimit={null} onAnswer={onAnswer} onToggleFlag={noop} />);
    const area = screen.getByRole('textbox', { name: /Bài viết/ });
    expect(area).toHaveAttribute('lang', 'en');
    expect(area).toHaveAccessibleDescription(/Gợi ý độ dài: 20–40 ký tự/);
    expect(screen.getByText('0 ký tự')).toBeInTheDocument();
    await user.type(area, 'Hello there');
    expect(screen.getByText('11 ký tự')).toBeInTheDocument();
    expect(screen.getByText(/Viết thêm khoảng 9 ký tự/)).toBeInTheDocument();
    await user.type(area, ' my friend!!');
    expect(screen.getByText(/Độ dài phù hợp/)).toBeInTheDocument();
    await user.type(area, ' and a lot more words here');
    expect(screen.getByText(/Dài hơn gợi ý/)).toBeInTheDocument();
    expect(onAnswer).toHaveBeenLastCalledWith('Hello there my friend!! and a lot more words here');
  });

  it('listening: plays through onListen and counts down the remaining plays', async () => {
    const user = userEvent.setup();
    const onListen = vi.fn().mockResolvedValue(undefined);
    renderExam(
      <QuestionView
        question={LISTEN_QUESTION}
        language="ko"
        listenLimit={2}
        onAnswer={noop}
        onToggleFlag={noop}
        canListen
        onListen={onListen}
      />,
    );
    const play = screen.getByRole('button', { name: /Nghe/ });
    expect(screen.getByText('Còn 2 lượt nghe')).toBeInTheDocument();
    await user.click(play);
    expect(onListen).toHaveBeenCalledWith('가방이 있어요?', null);
    expect(screen.getByText('Còn 1 lượt nghe')).toBeInTheDocument();
    await user.click(play);
    expect(screen.getByText('Đã hết lượt nghe')).toBeInTheDocument();
    expect(play).toBeDisabled();
    expect(screen.queryByText('가방이 있어요?')).not.toBeInTheDocument();
  });

  it('listening without a voice: offers the script as a reading fallback', async () => {
    const user = userEvent.setup();
    renderExam(<QuestionView question={LISTEN_QUESTION} language="ko" listenLimit={2} onAnswer={noop} onToggleFlag={noop} canListen={false} />);
    expect(screen.queryByRole('button', { name: /^Nghe/ })).not.toBeInTheDocument();
    const reveal = screen.getByRole('button', { name: 'Hiện lời thoại' });
    expect(reveal).toHaveAttribute('aria-expanded', 'false');
    await user.click(reveal);
    expect(screen.getByText('가방이 있어요?')).toHaveAttribute('lang', 'ko');
    expect(screen.getByText(/đọc thay nghe/)).toBeInTheDocument();
  });

  it('listening with a recording plays the asset even without a TTS voice', async () => {
    const user = userEvent.setup();
    const onListen = vi.fn().mockResolvedValue(undefined);
    const question = { ...LISTEN_QUESTION, prompt: { ...LISTEN_QUESTION.prompt, audio_asset_id: 'audio/q1.mp3', tts_text: undefined } };
    renderExam(
      <QuestionView question={question} language="ko" listenLimit={null} onAnswer={noop} onToggleFlag={noop} canListen={false} onListen={onListen} />,
    );
    await user.click(screen.getByRole('button', { name: /Nghe/ }));
    expect(onListen).toHaveBeenCalledWith(null, 'audio/q1.mp3');
    expect(screen.getByText('Nghe không giới hạn')).toBeInTheDocument();
  });
});

describe('SubmitDialog', () => {
  it('lists unanswered and flagged counts and confirms', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderExam(<SubmitDialog open unanswered={3} flagged={2} onConfirm={onConfirm} onCancel={noop} />);
    const dialog = screen.getByRole('dialog', { name: 'Nộp bài?' });
    expect(dialog).toHaveTextContent('Còn 3 câu chưa trả lời');
    expect(dialog).toHaveTextContent('2 câu đang đánh dấu xem lại');
    await user.click(within(dialog).getByRole('button', { name: 'Nộp bài' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('says everything is answered, traps focus and cancels on Escape', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderExam(<SubmitDialog open unanswered={0} flagged={0} onConfirm={noop} onCancel={onCancel} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Bạn đã trả lời tất cả câu hỏi.');
    const [first, last] = [within(dialog).getByRole('button', { name: 'Làm tiếp' }), within(dialog).getByRole('button', { name: 'Nộp bài' })];
    expect(first).toHaveFocus();
    await user.tab();
    expect(last).toHaveFocus();
    await user.tab();
    expect(first).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when closed', () => {
    renderExam(<SubmitDialog open={false} unanswered={0} flagged={0} onConfirm={noop} onCancel={noop} />);
    act(() => {});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
