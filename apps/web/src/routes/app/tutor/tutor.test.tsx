import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AiError, AiRequestInput, AiSuccess } from '@linguo/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { aiError, aiSuccess, EXPLAIN_DATA, PRACTICE_DATA, QUOTA, SENTENCE_DATA } from '@/components/ai/ai-fixtures';
import type { AiNoticeState } from '@/features/ai-tutor/useAiNotice';
import type { AiQuotaState } from '@/features/ai-tutor/useAiQuota';
import type { AiTutorStatus } from '@/features/ai-tutor/useAiTutor';
import { TEST_KO_PATH } from '../../../../tests/unit/learning-fixtures';
import { renderWithProviders } from '../../../../tests/unit/render';
import { TutorPage } from './TutorPage';

type View = { state: AiTutorStatus; result: AiSuccess | null; error: AiError | null };

const mocks = vi.hoisted(() => ({
  calls: [] as AiRequestInput[],
  respond: null as unknown as (req: AiRequestInput) => View,
  notice: null as unknown as AiNoticeState,
  quota: null as unknown as AiQuotaState,
  report: vi.fn(),
}));

vi.mock('@/features/ai-tutor/useAiTutor', async () => {
  const { useState } = await vi.importActual<typeof import('react')>('react');
  return {
    useAiTutor: () => {
      const [view, setView] = useState<View>({ state: 'idle', result: null, error: null });
      return {
        ...view,
        run: async (req: AiRequestInput) => {
          mocks.calls.push(req);
          setView(mocks.respond(req));
          return null;
        },
        reset: () => setView({ state: 'idle', result: null, error: null }),
      };
    },
  };
});
vi.mock('@/features/ai-tutor/useAiNotice', () => ({ useAiNotice: () => mocks.notice }));
vi.mock('@/features/ai-tutor/useAiQuota', () => ({ useAiQuota: () => mocks.quota }));
vi.mock('@/lib/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase')>()),
  requireSupabase: () => ({}),
}));
vi.mock('@/features/ai-tutor/report', () => ({ AI_REPORT_NOTE_MAX: 500, reportAiResponse: mocks.report }));

function notice(acknowledged: boolean, ack: AiNoticeState['ack'] = vi.fn().mockResolvedValue(true)): AiNoticeState {
  return { status: 'ready', acknowledged, ackAt: acknowledged ? '2026-10-01T00:00:00Z' : null, saving: false, error: null, ack };
}

beforeEach(() => {
  mocks.calls = [];
  mocks.respond = (req) =>
    req.task === 'explain_concept'
      ? { state: 'ok', result: aiSuccess('explain_concept', { ...EXPLAIN_DATA, summary: `Tóm tắt: ${req.concept}` }, { response_id: `u-${req.concept}` }), error: null }
      : { state: 'ok', result: aiSuccess('generate_practice', PRACTICE_DATA, { response_id: 'u-practice' }), error: null };
  mocks.notice = notice(true);
  mocks.quota = { status: 'ready', quota: QUOTA, remaining: 17, error: null, refresh: vi.fn() };
  mocks.report.mockReset().mockResolvedValue('report-1');
});

const render = (paths?: NonNullable<Parameters<typeof renderWithProviders>[1]>['paths']) =>
  renderWithProviders(<TutorPage />, { route: '/app/gia-su', paths });

async function ask(concept: string) {
  const input = screen.getByLabelText('Bạn muốn hiểu điều gì?');
  await userEvent.clear(input);
  await userEvent.type(input, concept);
  await userEvent.click(screen.getByRole('button', { name: 'Hỏi gia sư' }));
}

describe('TutorPage', () => {
  it('shows an empty state without a learning path', () => {
    render({ paths: [] });
    expect(screen.getByRole('heading', { level: 1, name: 'Gia sư AI' })).toBeInTheDocument();
    expect(screen.getByText('Bạn chưa có lộ trình')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tạo lộ trình' })).toHaveAttribute('href', '/app/bat-dau');
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('analyzes a sentence with the current path language and level', async () => {
    mocks.respond = () => ({ state: 'ok', result: aiSuccess('analyze_sentence', SENTENCE_DATA, { response_id: 'u-sentence' }), error: null });
    render({ paths: [TEST_KO_PATH] });
    await userEvent.click(screen.getByRole('tab', { name: 'Phân tích câu' }));
    await userEvent.click(screen.getByRole('button', { name: 'Phân tích câu' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Hãy nhập một câu để phân tích.');
    expect(mocks.calls).toHaveLength(0);
    await userEvent.type(screen.getByLabelText('Câu bạn muốn phân tích'), '저는 학생이에요.');
    await userEvent.click(screen.getByRole('button', { name: 'Phân tích câu' }));
    expect(mocks.calls).toEqual([{ task: 'analyze_sentence', language: 'ko', level: 'hangul', sentence: '저는 학생이에요.' }]);
    expect(screen.getByText('Tôi là học sinh.')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Từ loại từng từ' })).toHaveTextContent('tiểu từ');
  });

  it('shows the path language, level, quota and three tabs', () => {
    render();
    expect(screen.getByText(/Tiếng Anh · trình độ A2/)).toBeInTheDocument();
    expect(screen.getByText('Còn 17/20 lượt')).toBeInTheDocument();
    const tabs = within(screen.getByRole('tablist')).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Hỏi khái niệm', 'Tạo bài luyện', 'Phân tích câu']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('asks about a concept with the current path language and level', async () => {
    render({ paths: [TEST_KO_PATH] });
    await ask('은/는 và 이/가');
    expect(mocks.calls).toEqual([{ task: 'explain_concept', language: 'ko', level: 'hangul', concept: '은/는 và 이/가', variant: 'default' }]);
    expect(screen.getByText('Tóm tắt: 은/는 và 이/가')).toBeInTheDocument();
    expect(screen.getAllByText('Giải thích AI · có thể chưa chính xác').length).toBeGreaterThan(0);
  });

  it('requires a question', async () => {
    render();
    await userEvent.click(screen.getByRole('button', { name: 'Hỏi gia sư' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Hãy nhập điều bạn muốn hỏi.');
    expect(mocks.calls).toHaveLength(0);
  });

  it('keeps a session history, newest first, and re-asks differently', async () => {
    render();
    await ask('present perfect');
    await ask('used to');
    const history = screen.getByRole('region', { name: 'Lịch sử trong phiên' });
    expect(within(history).getByRole('heading', { level: 3, name: 'used to' })).toBeInTheDocument();
    expect(within(history).getByText('present perfect').closest('details')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Giải thích cách khác' }));
    expect(mocks.calls.at(-1)).toEqual({ task: 'explain_concept', language: 'en', level: 'a2', concept: 'used to', variant: 'different' });
  });

  it('shows the privacy notice before the first question', async () => {
    const ack = vi.fn().mockResolvedValue(true);
    mocks.notice = notice(false, ack);
    render();
    await ask('present perfect');
    expect(mocks.calls).toHaveLength(0);
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByRole('link', { name: 'Chính sách quyền riêng tư' })).toHaveAttribute('href', '/quyen-rieng-tu');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tôi đã hiểu, tiếp tục' }));
    expect(ack).toHaveBeenCalled();
    expect(mocks.calls).toHaveLength(1);
  });

  it('does not ask again when the acknowledgement was still loading at submit time', async () => {
    mocks.notice = { ...notice(false), status: 'loading' };
    render();
    await ask('present perfect');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mocks.calls).toHaveLength(0);
    mocks.notice = notice(true);
    // Any re-render picks up the loaded acknowledgement (the mock hook reads it on each render).
    await userEvent.click(screen.getByRole('tab', { name: 'Tạo bài luyện' }));
    expect(mocks.calls).toEqual([expect.objectContaining({ task: 'explain_concept', concept: 'present perfect' })]);
    expect(mocks.calls).toHaveLength(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('does not ask when the notice is dismissed', async () => {
    mocks.notice = notice(false);
    render();
    await ask('present perfect');
    await userEvent.click(screen.getByRole('button', { name: 'Để sau' }));
    expect(mocks.calls).toHaveLength(0);
  });

  it('generates practice with hidden answers', async () => {
    render();
    await userEvent.click(screen.getByRole('tab', { name: 'Tạo bài luyện' }));
    expect(screen.getByRole('tab', { name: 'Tạo bài luyện' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Ngữ pháp' }));
    await userEvent.click(screen.getByRole('button', { name: '2' }));
    await userEvent.click(screen.getByRole('button', { name: 'Tạo bài luyện' }));
    expect(mocks.calls).toEqual([{ task: 'generate_practice', language: 'en', level: 'a2', skill: 'grammar', count: 2 }]);
    expect(screen.queryByText('Đáp án đúng')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'have lived' }));
    expect(screen.getByText('Chính xác!')).toBeInTheDocument();
    expect(screen.getByText(PRACTICE_DATA.items[0]!.explanation_vi)).toBeInTheDocument();
  });

  it('sends the practice focus when given', async () => {
    render();
    await userEvent.click(screen.getByRole('tab', { name: 'Tạo bài luyện' }));
    await userEvent.type(screen.getByLabelText('Chủ đề (không bắt buộc)'), 'đồ ăn');
    await userEvent.click(screen.getByRole('button', { name: 'Tạo bài luyện' }));
    expect(mocks.calls[0]).toMatchObject({ skill: 'vocabulary', count: 3, focus: 'đồ ăn' });
  });

  it('switches tabs with the arrow keys and keeps each tab state', async () => {
    render();
    await ask('present perfect');
    screen.getByRole('tab', { name: 'Hỏi khái niệm' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Tạo bài luyện' })).toHaveFocus();
    expect(screen.getByRole('tabpanel', { name: 'Tạo bài luyện' })).toBeVisible();
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByText('Tóm tắt: present perfect')).toBeVisible();
  });

  it('falls back when out of quota, with a quota title instead of an outage one', async () => {
    mocks.respond = () => ({ state: 'quota', result: null, error: aiError('quota_exceeded', { quota: { ...QUOTA, used: 20 } }) });
    render();
    await ask('present perfect');
    expect(screen.getByRole('alert')).toHaveTextContent('Đã hết lượt hôm nay');
    expect(screen.getByRole('alert')).toHaveTextContent('Bạn đã dùng hết lượt hỏi AI hôm nay.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('Tạm thời không khả dụng');
  });

  it('shows a bad request as fixable, without a retry button', async () => {
    mocks.respond = () => ({ state: 'error', result: null, error: aiError('bad_request') });
    render();
    await ask('present perfect');
    expect(screen.getByRole('alert')).toHaveTextContent('Câu hỏi chưa hợp lệ');
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });

  it('disables submitting on every tab once the daily quota is used up, and says why', async () => {
    mocks.quota = { status: 'ready', quota: { ...QUOTA, used: 20 }, remaining: 0, error: null, refresh: vi.fn() };
    render();
    const button = screen.getByRole('button', { name: 'Hỏi gia sư' });
    expect(button).toBeDisabled();
    const hint = document.getElementById(button.getAttribute('aria-describedby') ?? '');
    expect(hint).toHaveTextContent(/Bạn đã dùng hết lượt hỏi AI hôm nay\. Lượt mới sẽ có lúc \d\d:\d\d\./);
    await userEvent.type(screen.getByLabelText('Bạn muốn hiểu điều gì?'), 'present perfect{Control>}{Enter}{/Control}');
    expect(mocks.calls).toHaveLength(0);
    await userEvent.click(screen.getByRole('tab', { name: 'Tạo bài luyện' }));
    expect(screen.getByRole('button', { name: 'Tạo bài luyện' })).toBeDisabled();
    await userEvent.click(screen.getByRole('tab', { name: 'Phân tích câu' }));
    expect(screen.getByRole('button', { name: 'Phân tích câu' })).toBeDisabled();
  });

  it('keeps the submit button enabled while turns are left', () => {
    render();
    const button = screen.getByRole('button', { name: 'Hỏi gia sư' });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('aria-describedby');
  });

  it('moves focus to the latest answer heading and announces it politely', async () => {
    render();
    await ask('present perfect');
    const heading = screen.getByRole('heading', { level: 3, name: 'present perfect' });
    expect(heading).toHaveFocus();
    expect(screen.getByText('Đã có câu trả lời').closest('[aria-live="polite"]')).not.toBeNull();
    await ask('used to');
    expect(screen.getByRole('heading', { level: 3, name: 'used to' })).toHaveFocus();
  });

  it('focuses the sentence analysis heading too, and marks the sentence with its language', async () => {
    mocks.respond = () => ({ state: 'ok', result: aiSuccess('analyze_sentence', SENTENCE_DATA, { response_id: 'u-sentence' }), error: null });
    render({ paths: [TEST_KO_PATH] });
    await userEvent.click(screen.getByRole('tab', { name: 'Phân tích câu' }));
    await userEvent.type(screen.getByLabelText('Câu bạn muốn phân tích'), '저는 학생이에요.');
    await userEvent.click(screen.getByRole('button', { name: 'Phân tích câu' }));
    const heading = screen.getByRole('heading', { level: 3, name: '저는 학생이에요.' });
    expect(heading).toHaveFocus();
    expect(heading).toHaveAttribute('lang', 'ko');
  });

  it('uses a growing textarea: Enter adds a line, Ctrl/Cmd+Enter submits', async () => {
    render();
    const input = screen.getByLabelText('Bạn muốn hiểu điều gì?');
    expect(input.tagName).toBe('TEXTAREA');
    await userEvent.type(input, 'dòng một{Enter}dòng hai');
    expect(mocks.calls).toHaveLength(0);
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    expect(mocks.calls).toEqual([expect.objectContaining({ task: 'explain_concept', concept: 'dòng một dòng hai' })]);
  });

  it('shows a character counter near the limit', async () => {
    render();
    const input = screen.getByLabelText('Bạn muốn hiểu điều gì?');
    expect(screen.queryByText(/\/300/)).not.toBeInTheDocument();
    await userEvent.click(input);
    await userEvent.paste('a'.repeat(250));
    expect(screen.getByText('250/300')).toBeInTheDocument();
    expect(input.getAttribute('aria-describedby')).toContain(screen.getByText('250/300').id);
    await userEvent.paste('b'.repeat(80));
    expect(screen.getByText(/^300\/300/)).toBeInTheDocument();
  });

  it('retries after an unavailable answer', async () => {
    mocks.respond = () => ({ state: 'unavailable', result: null, error: aiError('ai_unavailable') });
    render();
    await ask('present perfect');
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(mocks.calls).toHaveLength(2);
  });

  it('reports an answer from the history', async () => {
    render();
    await ask('present perfect');
    await userEvent.click(screen.getByRole('button', { name: 'Báo lỗi' }));
    const dialog = screen.getByRole('dialog', { name: 'Báo lỗi giải thích AI' });
    await userEvent.click(within(dialog).getByRole('radio', { name: /Khó hiểu/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Gửi báo lỗi' }));
    expect(mocks.report).toHaveBeenCalledWith(expect.anything(), { usageId: 'u-present perfect', reason: 'unclear', note: null });
  });
});
