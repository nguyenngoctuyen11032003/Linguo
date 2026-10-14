import { useState } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AiRequestInput } from '@linguo/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiNoticeState as UseAiNotice } from '@/features/ai-tutor/useAiNotice';
import type { AiQuotaState as UseAiQuota } from '@/features/ai-tutor/useAiQuota';
import type { AiTutorState as UseAiTutor } from '@/features/ai-tutor/useAiTutor';
import { renderWithProviders } from '../../../tests/unit/render';
import { stubMatchMedia } from '../../../tests/unit/match-media';
import {
  aiError,
  aiSuccess,
  ANALYZE_DATA,
  EXPLAIN_DATA,
  PLAN_DATA,
  PLAN_LESSON_ID,
  PRACTICE_DATA,
  QUOTA,
  SENTENCE_DATA,
  SUMMARY_DATA,
  WRITING_DATA,
} from './ai-fixtures';
import { AiExplainSheet } from './AiExplainSheet';
import { AiQuotaChip } from './AiQuotaChip';

const mocks = vi.hoisted(() => ({
  ai: null as unknown as UseAiTutor,
  quota: null as unknown as UseAiQuota,
  notice: null as unknown as UseAiNotice,
  report: vi.fn(),
  client: { fake: true },
  track: vi.fn(),
}));
vi.mock('@/features/analytics', () => ({ track: mocks.track }));

vi.mock('@/features/ai-tutor/useAiTutor', () => ({ useAiTutor: () => mocks.ai }));
vi.mock('@/features/ai-tutor/useAiQuota', () => ({ useAiQuota: () => mocks.quota }));
vi.mock('@/features/ai-tutor/useAiNotice', () => ({ useAiNotice: () => mocks.notice }));
vi.mock('@/features/ai-tutor/report', () => ({ AI_REPORT_NOTE_MAX: 500, reportAiResponse: mocks.report }));
vi.mock('@/components/ai/MarkdownLite', () => ({ MarkdownLite: ({ text }: { text: string }) => <p data-testid="md">{text}</p> }));
vi.mock('@/lib/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase')>()),
  requireSupabase: () => mocks.client,
}));

const REQUEST: AiRequestInput = { task: 'explain_concept', language: 'en', level: 'a2', concept: 'present perfect' };
const FALLBACK = { title: 'Thì hiện tại hoàn thành', body: 'Lời giải thích của biên tập viên.' };

function notice(acknowledged: boolean, ack: UseAiNotice['ack']): UseAiNotice {
  return { status: 'ready', acknowledged, ackAt: acknowledged ? '2026-10-01T00:00:00Z' : null, saving: false, error: null, ack };
}

function setAi(value: Partial<UseAiTutor>) {
  mocks.ai = { state: 'idle', result: null, error: null, run: vi.fn().mockResolvedValue(null), reset: vi.fn(), ...value };
}

beforeEach(() => {
  setAi({});
  mocks.quota = { status: 'ready', quota: QUOTA, remaining: 17, error: null, refresh: vi.fn() };
  mocks.notice = notice(true, vi.fn().mockResolvedValue(true));
  mocks.report.mockReset().mockResolvedValue(undefined);
  mocks.track.mockReset();
});

function renderSheet(props: Partial<Parameters<typeof AiExplainSheet>[0]> = {}) {
  const onClose = vi.fn();
  const view = renderWithProviders(<AiExplainSheet open onClose={onClose} request={REQUEST} fallback={FALLBACK} {...props} />);
  return { onClose, ...view };
}

describe('AiExplainSheet', () => {
  it('shows the privacy notice first and only asks after it is acknowledged', async () => {
    mocks.notice = notice(false, vi.fn().mockResolvedValue(true));
    renderSheet();
    const dialog = screen.getByRole('alertdialog', { name: /Trước khi dùng Gia sư AI/ });
    expect(dialog).toHaveTextContent('Google Gemini');
    expect(dialog).toHaveTextContent(/cải thiện sản phẩm của Google/);
    expect(dialog).toHaveTextContent(/người đánh giá xem xét/);
    expect(dialog).toHaveTextContent(/Đừng nhập thông tin cá nhân/);
    expect(within(dialog).getByRole('link', { name: 'Chính sách quyền riêng tư' })).toHaveAttribute('href', '/quyen-rieng-tu');
    expect(mocks.ai.run).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tôi đã hiểu, tiếp tục' }));
    expect(mocks.notice.ack).toHaveBeenCalled();
  });

  it('declining the notice closes without asking', async () => {
    mocks.notice = notice(false, vi.fn());
    const { onClose } = renderSheet();
    await userEvent.click(screen.getByRole('button', { name: 'Để sau' }));
    expect(onClose).toHaveBeenCalled();
    expect(mocks.ai.run).not.toHaveBeenCalled();
  });

  it('shows an error when the acknowledgement cannot be saved', async () => {
    mocks.notice = notice(false, vi.fn().mockResolvedValue(false));
    renderSheet();
    await userEvent.click(screen.getByRole('button', { name: 'Tôi đã hiểu, tiếp tục' }));
    expect(await screen.findByText('Chưa lưu được xác nhận. Vui lòng thử lại.')).toBeInTheDocument();
  });

  it('runs the request on open and shows the loading skeleton', () => {
    setAi({ state: 'loading' });
    renderSheet();
    expect(mocks.ai.run).toHaveBeenCalledWith(REQUEST);
    expect(mocks.track).toHaveBeenCalledWith('ai_sheet_opened', { task: 'explain_concept' });
    const dialog = screen.getByRole('dialog', { name: 'Giải thích AI' });
    expect(within(dialog).getByText('Giải thích AI · có thể chưa chính xác')).toBeInTheDocument();
    expect(within(dialog).getByRole('status')).toHaveTextContent('Đang soạn giải thích…');
    expect(within(dialog).getByText('Còn 17/20 lượt')).toBeInTheDocument();
  });

  it('renders an explanation and re-asks with the "different" variant', async () => {
    setAi({ state: 'ok', result: aiSuccess('explain_concept', EXPLAIN_DATA, { quota: { ...QUOTA, used: 4 } }) });
    renderSheet();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(EXPLAIN_DATA.summary);
    expect(within(dialog).getByTestId('md')).toHaveTextContent('Dùng **have/has + V3**.');
    expect(within(dialog).getByText('I have lived here for two years.')).toHaveAttribute('lang', 'en');
    expect(dialog).toHaveTextContent('Dùng với mốc thời gian quá khứ cụ thể.');
    expect(within(dialog).getByText('Còn 16/20 lượt')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Giải thích cách khác' }));
    expect(mocks.ai.run).toHaveBeenLastCalledWith({ ...REQUEST, variant: 'different' });
  });

  it('flags uncertain answers', () => {
    setAi({ state: 'ok', result: aiSuccess('explain_concept', { ...EXPLAIN_DATA, confidence: 'low', uncertainty: 'Quy tắc có ngoại lệ.' }) });
    renderSheet();
    expect(screen.getByText(/AI chưa chắc chắn:/).parentElement).toHaveTextContent('Quy tắc có ngoại lệ.');
  });

  it('renders an error analysis', () => {
    const request: AiRequestInput = { task: 'analyze_error', language: 'en', level: 'a2', prompt: 'She ___ finished.', expected: 'has', answer: 'have' };
    setAi({ state: 'ok', result: aiSuccess('analyze_error', ANALYZE_DATA) });
    renderSheet({ request });
    const dialog = screen.getByRole('dialog', { name: 'Vì sao?' });
    expect(dialog).toHaveTextContent('Chưa đúng');
    expect(dialog).toHaveTextContent('Loại lỗi: Chia động từ');
    expect(within(dialog).getByText('She has finished.')).toHaveAttribute('lang', 'en');
    expect(within(dialog).queryByRole('button', { name: 'Giải thích cách khác' })).not.toBeInTheDocument();
  });

  it('keeps practice answers hidden until an option is chosen', async () => {
    const request: AiRequestInput = { task: 'generate_practice', language: 'en', level: 'a2', skill: 'grammar' };
    setAi({ state: 'ok', result: aiSuccess('generate_practice', PRACTICE_DATA) });
    renderSheet({ request });
    expect(screen.queryByText('Đáp án đúng')).not.toBeInTheDocument();
    expect(screen.queryByText(PRACTICE_DATA.items[0]!.explanation_vi)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'live' }));
    expect(screen.getByText('Chưa đúng.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /have lived/ })).toHaveTextContent('Đáp án đúng');
    expect(screen.getByText(PRACTICE_DATA.items[0]!.explanation_vi)).toBeInTheDocument();
    expect(screen.queryByText(PRACTICE_DATA.items[1]!.explanation_vi)).not.toBeInTheDocument();
  });

  it('renders writing feedback as practice feedback, never an official score', () => {
    const request: AiRequestInput = {
      task: 'review_writing',
      language: 'en',
      level: 'a2',
      prompt: 'Write an email to Alex.',
      answer: 'Hi Alex, lets watch Toy Story on Saturday at 6. See you, Lan',
      rubric: [
        { key: 'content', label_vi: 'Nội dung', description_vi: 'Đủ ba ý.', max_points: 4 },
        { key: 'language', label_vi: 'Ngôn ngữ', description_vi: 'Ngữ pháp, chính tả.', max_points: 3 },
      ],
    };
    setAi({ state: 'loading' });
    const loading = renderSheet({ request, fallback: undefined });
    expect(mocks.ai.run).toHaveBeenCalledWith(request);
    expect(mocks.track).toHaveBeenCalledWith('ai_sheet_opened', { task: 'review_writing' });
    expect(screen.getByRole('dialog', { name: 'Nhận xét bài viết' })).toHaveTextContent('Đang đọc bài viết…');
    loading.unmount();

    setAi({ state: 'ok', result: aiSuccess('review_writing', WRITING_DATA) });
    renderSheet({ request, fallback: undefined });
    const dialog = screen.getByRole('dialog', { name: 'Nhận xét bài viết' });
    expect(within(dialog).getByText('Phản hồi luyện tập — không phải điểm chính thức')).toBeInTheDocument();
    const rows = within(within(dialog).getByRole('list', { name: 'Nhận xét theo tiêu chí' })).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Nội dung');
    expect(rows[0]).toHaveTextContent('3/4 điểm');
    expect(rows[0]).toHaveTextContent('Có phim và giờ gặp, còn thiếu chỗ gặp.');
    expect(rows[1]).toHaveTextContent('Ngôn ngữ');
    expect(rows[1]).toHaveTextContent('2/3 điểm');
    expect(dialog).toHaveTextContent('Tổng tham khảo: 5/7 điểm');
    expect(dialog).toHaveTextContent(WRITING_DATA.overall_vi);
    expect(within(dialog).getByText(WRITING_DATA.corrected_version)).toHaveAttribute('lang', 'en');
    expect(within(dialog).getByRole('button', { name: 'Báo lỗi' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Giải thích cách khác' })).not.toBeInTheDocument();
  });

  it('writing feedback without the rubric shows points only and keeps Korean text tagged', () => {
    setAi({ state: 'ok', result: aiSuccess('review_writing', { ...WRITING_DATA, corrected_version: '안녕하세요.' }) });
    const request: AiRequestInput = {
      task: 'review_writing',
      language: 'ko',
      level: 'topik4',
      prompt: '글을 쓰십시오.',
      answer: '안녕하세요',
      rubric: [{ key: 'content', label_vi: 'Nội dung', description_vi: 'Đủ ý.', max_points: 4 }],
    };
    renderSheet({ request });
    const rows = within(screen.getByRole('list', { name: 'Nhận xét theo tiêu chí' })).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('3/4 điểm');
    expect(rows[1]).toHaveTextContent('language');
    expect(rows[1]).toHaveTextContent('2 điểm');
    expect(screen.queryByText(/Tổng tham khảo/)).not.toBeInTheDocument();
    expect(screen.getByText('안녕하세요.')).toHaveAttribute('lang', 'ko');
  });

  it('renders a sentence analysis with parts of speech, components and grammar points', () => {
    const request: AiRequestInput = { task: 'analyze_sentence', language: 'ko', level: 'topik1', sentence: '저는 학생이에요.' };
    setAi({ state: 'loading' });
    const loading = renderSheet({ request, fallback: undefined });
    expect(mocks.ai.run).toHaveBeenCalledWith(request);
    expect(screen.getByRole('dialog', { name: 'Phân tích câu' })).toHaveTextContent('Đang phân tích câu…');
    loading.unmount();

    setAi({ state: 'ok', result: aiSuccess('analyze_sentence', SENTENCE_DATA) });
    renderSheet({ request, fallback: undefined });
    const dialog = screen.getByRole('dialog', { name: 'Phân tích câu' });
    expect(within(dialog).getByText('Tôi là học sinh.')).toBeInTheDocument();
    expect(within(dialog).getByRole('list', { name: 'Nghĩa khác' })).toHaveTextContent('nhấn mạnh nghề');
    const tokens = within(within(dialog).getByRole('list', { name: 'Từ loại từng từ' })).getAllByRole('listitem');
    expect(tokens).toHaveLength(4);
    expect(tokens[1]).toHaveTextContent('tiểu từ');
    expect(within(tokens[1]!).getByText('는')).toHaveAttribute('lang', 'ko');
    expect(within(dialog).getByRole('list', { name: 'Thành phần câu' })).toHaveTextContent('Chủ đề: 저는');
    expect(within(dialog).getByRole('list', { name: 'Điểm ngữ pháp' })).toHaveTextContent('-이에요/예요');
    expect(dialog).toHaveTextContent('Giải thích AI · có thể chưa chính xác');
    expect(within(dialog).queryByRole('button', { name: 'Giải thích cách khác' })).not.toBeInTheDocument();
  });

  it('renders a session recap: errors to remember and one next step', () => {
    const request: AiRequestInput = {
      task: 'summarize_session',
      language: 'en',
      level: 'a2',
      minutes: 12,
      activities: [{ kind: 'review', status: 'done', minutes: 5 }],
      error_tags: [{ tag: 'article', count: 2 }],
    };
    setAi({ state: 'ok', result: aiSuccess('summarize_session', SUMMARY_DATA) });
    renderSheet({ request, fallback: undefined });
    const dialog = screen.getByRole('dialog', { name: 'Tóm tắt phiên học' });
    expect(dialog).toHaveTextContent(SUMMARY_DATA.recap_vi);
    expect(within(dialog).getByRole('list', { name: 'Lỗi cần nhớ' })).toHaveTextContent('Mạo từ a/an/the');
    expect(dialog).toHaveTextContent(SUMMARY_DATA.next_step_vi);
    expect(dialog).toHaveTextContent('Nhận xét AI · có thể chưa chính xác');
  });

  it('renders a review plan whose steps link only to ids of the request', () => {
    const request: AiRequestInput = {
      task: 'plan_review',
      language: 'en',
      level: 'a2',
      gaps: [
        { kind: 'lesson', id: PLAN_LESSON_ID, label: 'Present simple', count: 4 },
        { kind: 'tag', id: 'mcq', label: 'Trắc nghiệm', count: 3 },
      ],
    };
    const invented = { ...PLAN_DATA, steps: [{ kind: 'redo_lesson', target: 'not-in-request', cards: null, reason_vi: 'Bịa.' }, ...PLAN_DATA.steps] };
    setAi({ state: 'ok', result: aiSuccess('plan_review', invented) });
    renderSheet({ request, fallback: undefined });
    const dialog = screen.getByRole('dialog', { name: 'Kế hoạch ôn tập' });
    const steps = within(within(dialog).getByRole('list', { name: 'Các bước ôn tập' })).getAllByRole('listitem');
    expect(steps).toHaveLength(2);
    expect(steps[0]).toHaveTextContent('Học lại bài Present simple');
    expect(within(steps[0]!).getByRole('link', { name: 'Mở bài học' })).toHaveAttribute('href', `/app/hoc-tap/bai/${PLAN_LESSON_ID}`);
    expect(steps[1]).toHaveTextContent('Ôn 10 thẻ: Trắc nghiệm');
    expect(within(steps[1]!).getByRole('link', { name: 'Mở ôn tập' })).toHaveAttribute('href', '/app/on-tap');
    expect(dialog).not.toHaveTextContent('Bịa.');
  });

  it('shows a short error for output that fails its schema', () => {
    setAi({ state: 'ok', result: aiSuccess('explain_concept', { summary: 1 }) });
    renderSheet();
    expect(screen.getByText('Không đọc được câu trả lời của AI. Vui lòng thử lại.')).toBeInTheDocument();
  });

  it('falls back to curated text with the reset time when out of quota', () => {
    setAi({ state: 'quota', error: aiError('quota_exceeded', { quota: { used: 20, limit: 20, resets_at: QUOTA.resets_at } }) });
    renderSheet();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Đã hết lượt hôm nay');
    expect(alert).not.toHaveTextContent('Tạm thời không khả dụng');
    expect(alert).toHaveTextContent(/Bạn đã dùng hết lượt hỏi AI hôm nay\. Lượt mới sẽ có lúc \d\d:\d\d\./);
    expect(alert).toHaveTextContent('Bài học, đáp án và lịch ôn vẫn dùng bình thường');
    expect(screen.getByText(FALLBACK.title)).toBeInTheDocument();
    expect(screen.getByText(FALLBACK.body)).toBeInTheDocument();
    expect(screen.getByText('Còn 0/20 lượt')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });

  it('offers a retry when AI is unavailable', async () => {
    setAi({ state: 'unavailable', error: aiError('ai_unavailable', { retry_after_sec: 120 }) });
    renderSheet();
    expect(screen.getByRole('alert')).toHaveTextContent('Thử lại sau khoảng 2 phút.');
    expect(screen.getByText(FALLBACK.body)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(mocks.ai.run).toHaveBeenCalledTimes(2);
  });

  it('names a user-fixable bad request instead of an outage, without a pointless retry', () => {
    setAi({ state: 'error', error: aiError('bad_request') });
    renderSheet({ fallback: undefined });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Câu hỏi chưa hợp lệ');
    expect(alert).toHaveTextContent('Hãy rút gọn rồi thử lại.');
    expect(alert).not.toHaveTextContent('Tạm thời không khả dụng');
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });

  it('keeps "Tạm thời không khả dụng" for a real outage', () => {
    setAi({ state: 'unavailable', error: aiError('ai_unavailable') });
    renderSheet();
    expect(screen.getByRole('alert')).toHaveTextContent('Tạm thời không khả dụng');
  });

  it('names a burst limit as "Chậm lại một chút" and offers a retry', () => {
    setAi({ state: 'quota', error: aiError('quota_exceeded', { retry_after_sec: 30, quota: null }) });
    renderSheet({ fallback: undefined });
    expect(screen.getByRole('alert')).toHaveTextContent('Chậm lại một chút');
    expect(screen.getByRole('alert')).toHaveTextContent('Thử lại sau khoảng 30 giây.');
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });

  it('explains that lessons still work when there is no curated text', () => {
    setAi({ state: 'error', error: aiError('invalid_output') });
    renderSheet({ fallback: undefined });
    expect(screen.getByRole('alert')).toHaveTextContent('AI chưa đưa ra được câu trả lời hợp lệ.');
    expect(screen.getByText(/vẫn hoạt động bình thường khi không có AI/)).toBeInTheDocument();
  });

  it('closes on Escape and from the close button', async () => {
    setAi({ state: 'ok', result: aiSuccess('explain_concept', EXPLAIN_DATA) });
    const { onClose } = renderSheet();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('resets the request when closed and returns focus to the trigger', async () => {
    setAi({ state: 'ok', result: aiSuccess('explain_concept', EXPLAIN_DATA) });
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Mở
          </button>
          <AiExplainSheet open={open} onClose={() => setOpen(false)} request={REQUEST} />
        </>
      );
    }
    renderWithProviders(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Mở' });
    await userEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(mocks.ai.reset).toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it('traps focus inside the sheet', async () => {
    setAi({ state: 'ok', result: aiSuccess('explain_concept', EXPLAIN_DATA) });
    renderSheet();
    const dialog = screen.getByRole('dialog');
    for (let i = 0; i < 6; i += 1) {
      await userEvent.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it('works as a side panel on wide screens', () => {
    stubMatchMedia((q) => q === '(min-width: 768px)');
    setAi({ state: 'loading' });
    renderSheet();
    expect(screen.getByRole('dialog', { name: 'Giải thích AI' })).toBeInTheDocument();
  });

  it('reports an answer with a reason and a note of at most 500 characters', async () => {
    setAi({ state: 'ok', result: aiSuccess('explain_concept', EXPLAIN_DATA, { response_id: 'usage-42' }) });
    renderSheet();
    await userEvent.click(screen.getByRole('button', { name: 'Báo lỗi' }));
    const dialog = screen.getByRole('dialog', { name: 'Báo lỗi giải thích AI' });
    const send = within(dialog).getByRole('button', { name: 'Gửi báo lỗi' });
    expect(send).toBeDisabled();
    await userEvent.click(within(dialog).getByRole('radio', { name: /Sai kiến thức/ }));
    const note = within(dialog).getByLabelText('Ghi chú (không bắt buộc)');
    expect(note).toHaveAttribute('maxLength', '500');
    await userEvent.type(note, 'Ví dụ sai thì');
    expect(within(dialog).getByText('13/500')).toBeInTheDocument();
    await userEvent.click(send);
    expect(mocks.report).toHaveBeenCalledWith(mocks.client, { usageId: 'usage-42', reason: 'wrong', note: 'Ví dụ sai thì' });
    expect(await screen.findByText('Cảm ơn bạn! Linguo đã nhận báo lỗi.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Báo lỗi giải thích AI' })).not.toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: 'Giải thích AI' })).toBeInTheDocument();
  });

  it('Escape in the report dialog closes only the report', async () => {
    const onClose = vi.fn();
    setAi({ state: 'ok', result: aiSuccess('explain_concept', EXPLAIN_DATA) });
    renderWithProviders(<AiExplainSheet open onClose={onClose} request={REQUEST} />);
    await userEvent.click(screen.getByRole('button', { name: 'Báo lỗi' }));
    expect(screen.getByRole('dialog', { name: 'Báo lỗi giải thích AI' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Báo lỗi giải thích AI' })).not.toBeInTheDocument());
  });

  it('keeps the report open with an error when sending fails', async () => {
    mocks.report.mockRejectedValue(new Error('x'));
    setAi({ state: 'ok', result: aiSuccess('explain_concept', EXPLAIN_DATA) });
    renderSheet();
    await userEvent.click(screen.getByRole('button', { name: 'Báo lỗi' }));
    await userEvent.click(screen.getByRole('radio', { name: /Khó hiểu/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Gửi báo lỗi' }));
    expect(await screen.findByText('Chưa gửi được báo lỗi. Vui lòng thử lại.')).toBeInTheDocument();
    expect(mocks.report).toHaveBeenCalledWith(mocks.client, { usageId: 'usage-1', reason: 'unclear', note: null });
  });
});

describe('AiQuotaChip', () => {
  it('shows remaining requests and hides until known', () => {
    const { unmount } = renderWithProviders(<AiQuotaChip quota={{ used: 5, limit: 20, resets_at: QUOTA.resets_at }} />);
    expect(screen.getByText('Còn 15/20 lượt')).toBeInTheDocument();
    unmount();
    renderWithProviders(<AiQuotaChip quota={null} />);
    expect(screen.queryByText(/lượt/)).not.toBeInTheDocument();
  });
});

