import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AiError, AiRequestInput, AiSuccess } from '@linguo/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { aiError, aiSuccess, EXPLAIN_DATA, PRACTICE_DATA, QUOTA } from '@/components/ai/ai-fixtures';
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

  it('shows the path language, level, quota and two tabs', () => {
    render();
    expect(screen.getByText(/Tiếng Anh · trình độ A2/)).toBeInTheDocument();
    expect(screen.getByText('Còn 17/20 lượt')).toBeInTheDocument();
    const tabs = within(screen.getByRole('tablist')).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Hỏi khái niệm', 'Tạo bài luyện']);
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

  it('falls back when out of quota', async () => {
    mocks.respond = () => ({ state: 'quota', result: null, error: aiError('quota_exceeded', { quota: { ...QUOTA, used: 20 } }) });
    render();
    await ask('present perfect');
    expect(screen.getByRole('alert')).toHaveTextContent('Tạm thời không khả dụng');
    expect(screen.getByRole('alert')).toHaveTextContent('Bạn đã dùng hết lượt hỏi AI hôm nay.');
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
