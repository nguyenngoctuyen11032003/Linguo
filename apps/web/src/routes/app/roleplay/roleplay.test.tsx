import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aiError, aiSuccess, QUOTA, SUMMARY_DATA } from '@/components/ai/ai-fixtures';
import type { AiNoticeState } from '@/features/ai-tutor/useAiNotice';
import type { AiQuotaState } from '@/features/ai-tutor/useAiQuota';
import { TEST_KO_PATH } from '../../../../tests/unit/learning-fixtures';
import { renderWithProviders } from '../../../../tests/unit/render';
import { RoleplayPage } from './RoleplayPage';

type Body = Record<string, unknown>;

/** Saved role-play entries in either storage (v2 lives in localStorage, legacy v1 in sessionStorage). */
const roleplayKeys = () =>
  [localStorage, sessionStorage].reduce((n, store) => n + Object.keys(store).filter((k) => k.startsWith('linguo:roleplay:')).length, 0);

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  notice: null as unknown as AiNoticeState,
  quota: null as unknown as AiQuotaState,
}));

vi.mock('@/lib/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase')>()),
  getSupabase: () => ({ functions: { invoke: mocks.invoke }, rpc: vi.fn(), from: vi.fn() }),
  requireSupabase: () => ({}),
}));
vi.mock('@/features/ai-tutor/useAiNotice', () => ({ useAiNotice: () => mocks.notice }));
vi.mock('@/features/ai-tutor/useAiQuota', () => ({ useAiQuota: () => mocks.quota }));
vi.mock('@/features/ai-tutor/report', () => ({ AI_REPORT_NOTE_MAX: 500, reportAiResponse: vi.fn() }));

const turn = (over: Record<string, unknown> = {}, id = 'u-1') =>
  aiSuccess('roleplay_turn', { partner_reply: 'Sure! Hot or iced?', hint_vi: 'Hãy chọn nóng hoặc lạnh.', corrections: [], goal_progress: [], finished: false, ...over }, { response_id: id });

function reply(handler: (body: Body) => unknown) {
  mocks.invoke.mockImplementation(async (_name: string, opts: { body: Body }) => ({ data: handler(opts.body), error: null }));
}

function notice(acknowledged: boolean, ack: AiNoticeState['ack'] = vi.fn().mockResolvedValue(true)): AiNoticeState {
  return { status: 'ready', acknowledged, ackAt: acknowledged ? '2026-10-01T00:00:00Z' : null, saving: false, error: null, ack };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  mocks.invoke.mockReset();
  mocks.notice = notice(true);
  mocks.quota = { status: 'ready', quota: QUOTA, remaining: 17, error: null, refresh: vi.fn() };
  reply((b) => (b.turn_index === 0 ? turn({ partner_reply: 'Hi! Welcome to Sunny Café. What can I get you?', hint_vi: 'Hãy gọi một đồ uống.' }) : turn()));
});

const render = (paths?: NonNullable<Parameters<typeof renderWithProviders>[1]>['paths']) =>
  renderWithProviders(<RoleplayPage />, { route: '/app/dong-vai', paths });

async function begin(title = 'Gọi đồ ở quán cà phê') {
  await userEvent.click(screen.getByRole('button', { name: `Bắt đầu: ${title}` }));
  await screen.findByText(/Welcome to Sunny Café/);
}

async function say(text: string) {
  await userEvent.type(screen.getByLabelText(/Tin nhắn của bạn/), text);
  await userEvent.click(screen.getByRole('button', { name: 'Gửi' }));
}

describe('RoleplayPage: picker', () => {
  it('shows an empty state without a learning path', () => {
    render({ paths: [] });
    expect(screen.getByRole('heading', { level: 1, name: 'Đóng vai với AI' })).toBeInTheDocument();
    expect(screen.getByText('Bạn chưa có lộ trình')).toBeInTheDocument();
  });

  it('lists the scenarios of the path language, level-appropriate ones first, with their goals', () => {
    render();
    const fit = screen.getByRole('region', { name: 'Hợp trình độ của bạn' });
    expect(within(fit).getByRole('heading', { name: 'Gọi đồ ở quán cà phê' })).toBeInTheDocument();
    expect(within(fit).getByText('Chọn cỡ ly hoặc món kèm')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Tình huống khác' })).toBeInTheDocument();
    expect(screen.getByText('Còn 17/20 lượt')).toBeInTheDocument();
    expect(screen.getByText(/Đối tác là AI nên có thể nói sai/)).toBeInTheDocument();
  });

  it('uses the Korean catalog for a Korean path', () => {
    render({ paths: [TEST_KO_PATH] });
    expect(screen.getByRole('button', { name: 'Bắt đầu: Làm quen và tự giới thiệu' })).toBeInTheDocument();
    expect(screen.getByText(/Tiếng Hàn/)).toBeInTheDocument();
  });

  it('asks for the AI notice before the first turn', async () => {
    const ack = vi.fn().mockResolvedValue(true);
    mocks.notice = notice(false, ack);
    render();
    await userEvent.click(screen.getByRole('button', { name: 'Bắt đầu: Gọi đồ ở quán cà phê' }));
    expect(mocks.invoke).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tôi đã hiểu, tiếp tục' }));
    expect(ack).toHaveBeenCalled();
    await screen.findByText(/Welcome to Sunny Café/);
  });
});

describe('RoleplayPage: conversation', () => {
  it('opens with the partner line, a turn counter, the goal checklist and the hint', async () => {
    render();
    await begin();
    expect(mocks.invoke.mock.calls[0]![1].body).toMatchObject({ task: 'roleplay_turn', scenario_key: 'cafe_order', turn_index: 0, learner_message: '' });
    expect(screen.getByText('Lượt 1/12')).toBeInTheDocument();
    const log = screen.getByRole('log', { name: 'Cuộc trò chuyện' });
    expect(log).toHaveAttribute('aria-live', 'polite');
    expect(within(log).getByText(/Welcome to Sunny Café/)).toHaveAttribute('lang', 'en');
    expect(screen.getByText('Hãy gọi một đồ uống.')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Mục tiêu của tình huống' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/Tin nhắn của bạn/)).toHaveFocus());
  });

  it('shows gentle corrections under the learner message and checks off reached goals', async () => {
    render();
    await begin();
    reply(() =>
      turn({
        partner_reply: 'Hot or iced?',
        corrections: [{ original: 'I want', corrected: 'I would like', note_vi: 'Lịch sự hơn khi gọi đồ.' }],
        goal_progress: ['order_drink'],
      }),
    );
    await say('I want a latte');
    await screen.findByText('Hot or iced?');
    const fix = screen.getByRole('region', { name: 'Gợi ý sửa câu' });
    expect(fix).toHaveTextContent('I would like');
    expect(fix).toHaveTextContent('Lịch sự hơn khi gọi đồ.');
    expect(screen.getByRole('list', { name: 'Mục tiêu của tình huống' })).toHaveTextContent('Gọi một đồ uống (đã đạt)');
    expect(screen.getByText('Lượt 2/12')).toBeInTheDocument();
    expect(mocks.invoke.mock.calls[1]![1].body).toMatchObject({ turn_index: 1, learner_message: 'I want a latte' });
  });

  it('guards an empty message and Ctrl+Enter sends', async () => {
    render();
    await begin();
    await userEvent.click(screen.getByRole('button', { name: 'Gửi' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Hãy viết vài chữ');
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    await userEvent.type(screen.getByLabelText(/Tin nhắn của bạn/), 'A latte{Control>}{Enter}{/Control}');
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(2));
  });

  it('disables sending with the friendly note when today is used up', async () => {
    const first = render();
    await begin();
    first.unmount();
    mocks.quota = { status: 'ready', quota: { ...QUOTA, used: 20 }, remaining: 0, error: null, refresh: vi.fn() };
    render();
    expect(screen.getByRole('button', { name: 'Gửi' })).toBeDisabled();
    expect(screen.getByText(/Bài học và ôn tập vẫn dùng bình thường/)).toBeInTheDocument();
  });

  it('shows the fallback notice when a turn fails and retries it without duplicating the message', async () => {
    render();
    await begin();
    mocks.invoke.mockResolvedValueOnce({
      data: null,
      error: new FunctionsHttpError(new Response(JSON.stringify(aiError('ai_unavailable', { retry_after_sec: 30 })), { status: 503 })),
    });
    await say('A latte please');
    await screen.findByText('Tạm thời không khả dụng');
    expect(screen.getByText('Chưa gửi được tin nhắn này.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gửi' })).toBeInTheDocument();
    reply(() => turn({ partner_reply: 'Coming right up!' }));
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await screen.findByText('Coming right up!');
    expect(screen.getAllByText('A latte please')).toHaveLength(1);
    expect(screen.queryByText('Chưa gửi được tin nhắn này.')).not.toBeInTheDocument();
  });

  it('lets the learner take back a failed message to edit it', async () => {
    render();
    await begin();
    mocks.invoke.mockResolvedValueOnce({
      data: null,
      error: new FunctionsHttpError(new Response(JSON.stringify(aiError('quota_exceeded', { quota: { ...QUOTA, used: 20 } })), { status: 429 })),
    });
    await say('A latte please');
    await screen.findByText('Đã hết lượt hôm nay');
    await userEvent.click(screen.getByRole('button', { name: 'Sửa tin nhắn rồi gửi lại' }));
    expect(screen.getByLabelText(/Tin nhắn của bạn/)).toHaveValue('A latte please');
    expect(screen.queryByText('Chưa gửi được tin nhắn này.')).not.toBeInTheDocument();
  });

  it('finishes into the recap built from numbers only, with the existing recap view', async () => {
    render();
    await begin();
    reply((b) =>
      b.task === 'summarize_session'
        ? aiSuccess('summarize_session', { ...SUMMARY_DATA, errors_to_remember: [] })
        : turn({ corrections: [{ original: 'I want', corrected: 'I would like', note_vi: 'Lịch sự hơn.' }], goal_progress: ['order_drink'] }),
    );
    await say('I want a latte');
    await screen.findByText('Lượt 2/12');
    await userEvent.click(screen.getAllByRole('button', { name: 'Kết thúc và xem tóm tắt' })[0]!);
    await screen.findByRole('heading', { name: 'Tóm tắt buổi đóng vai' });
    const summaryCall = mocks.invoke.mock.calls.find((c) => (c[1].body as Body).task === 'summarize_session')!;
    const body = summaryCall[1].body as Body;
    expect(body).toMatchObject({ language: 'en', activities: [{ kind: 'practice', status: 'done' }], error_tags: [{ tag: 'roleplay_corrections', count: 1 }] });
    expect(JSON.stringify(body)).not.toContain('latte');
    expect(screen.getByText(SUMMARY_DATA.recap_vi)).toBeInTheDocument();
    // The AI recap is reportable like every other AI answer.
    await userEvent.click(within(screen.getByRole('region', { name: 'Nhận xét của AI' })).getByRole('button', { name: 'Báo lỗi' }));
    expect(await screen.findByRole('dialog', { name: 'Báo lỗi giải thích AI' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(screen.getByRole('region', { name: 'Những chỗ nên sửa' })).toHaveTextContent('I would like');
    expect(roleplayKeys()).toBe(0);
    await userEvent.click(screen.getByRole('button', { name: 'Luyện tình huống khác' }));
    expect(screen.getByRole('region', { name: 'Hợp trình độ của bạn' })).toBeInTheDocument();
  });

  it('keeps the conversation after a reload or closing the tab and leaves cleanly', async () => {
    const first = render();
    await begin();
    first.unmount();
    sessionStorage.clear(); // closing the tab drops sessionStorage; the conversation is in localStorage
    render();
    expect(screen.getByText(/Welcome to Sunny Café/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Chọn tình huống khác' }));
    expect(screen.getByRole('region', { name: 'Hợp trình độ của bạn' })).toBeInTheDocument();
    expect(roleplayKeys()).toBe(0);
  });
});

describe('RoleplayPage: UX polish', () => {
  it('names corrections and the hint apart, with a heading under the scenario title', async () => {
    render();
    await begin();
    expect(screen.getByText('Gợi ý cách trả lời:', { exact: false })).toBeInTheDocument();
    reply(() => turn({ corrections: [{ original: 'I want', corrected: 'I would like', note_vi: 'Lịch sự hơn.' }] }));
    await say('I want a latte');
    const fix = await screen.findByRole('region', { name: 'Gợi ý sửa câu' });
    expect(within(fix).getByRole('heading', { level: 3, name: 'Gợi ý sửa câu' })).toBeInTheDocument();
  });

  it('explains why finishing is off before the first message', async () => {
    render();
    await begin();
    const finish = screen.getByRole('button', { name: 'Kết thúc và xem tóm tắt' });
    expect(finish).toBeDisabled();
    expect(finish).toHaveAccessibleDescription('Gửi ít nhất một tin nhắn để xem tóm tắt nhé.');
    await say('A latte');
    await screen.findByText('Lượt 2/12');
    expect(screen.getByRole('button', { name: 'Kết thúc và xem tóm tắt' })).toBeEnabled();
    expect(screen.queryByText('Gửi ít nhất một tin nhắn để xem tóm tắt nhé.')).not.toBeInTheDocument();
  });

  it('brings the whole composer into view after each partner reply and keeps focus in the input', async () => {
    const scroll = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scroll;
    try {
      render();
      await begin();
      await say('A latte');
      await screen.findByText('Lượt 2/12');
      const input = screen.getByLabelText(/Tin nhắn của bạn/);
      await waitFor(() => expect(input).toHaveFocus());
      // The composer is sticky; it is scrolled to, then the end of the log is brought just above it.
      const send = screen.getByRole('button', { name: 'Gửi' });
      expect((scroll.mock.contexts as HTMLElement[]).some((el) => el.contains(input) && el.contains(send))).toBe(true);
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it('leaves at once when nothing was sent yet', async () => {
    render();
    await begin();
    await userEvent.click(screen.getByRole('button', { name: 'Chọn tình huống khác' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Hợp trình độ của bạn' })).toBeInTheDocument();
  });

  it('asks before discarding a chat with learner messages; staying keeps it', async () => {
    render();
    await begin();
    await say('A latte');
    await screen.findByText('Lượt 2/12');
    const leave = screen.getByRole('button', { name: 'Chọn tình huống khác' });
    await userEvent.click(leave);
    const dialog = screen.getByRole('alertdialog', { name: 'Bỏ cuộc trò chuyện này?' });
    expect(dialog).toHaveAccessibleDescription(/sẽ bị xoá/);
    expect(within(dialog).getByRole('button', { name: 'Ở lại trò chuyện' })).toHaveFocus();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ở lại trò chuyện' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByText('A latte')).toBeInTheDocument();
    expect(roleplayKeys()).toBeGreaterThan(0);
    expect(leave).toHaveFocus();

    await userEvent.click(leave);
    await userEvent.click(screen.getByRole('button', { name: 'Bỏ cuộc trò chuyện' }));
    expect(screen.getByRole('region', { name: 'Hợp trình độ của bạn' })).toBeInTheDocument();
    expect(roleplayKeys()).toBe(0);
  });

  it('switches every "Bắt đầu" off with the quota hint when today is used up', () => {
    mocks.quota = { status: 'ready', quota: { ...QUOTA, used: 20 }, remaining: 0, error: null, refresh: vi.fn() };
    render();
    const starts = screen.getAllByRole('button', { name: /^Bắt đầu: / });
    expect(starts.length).toBeGreaterThan(1);
    for (const start of starts) {
      expect(start).toBeDisabled();
      expect(start).toHaveAccessibleDescription(/Bài học và ôn tập vẫn dùng bình thường/);
    }
  });

  it('moves focus to the scenario title on start, the page title on leave and the recap title on finish', async () => {
    render();
    // Hold the opening turn so the chat stays on its loading state.
    let open: (value: unknown) => void = () => {};
    mocks.invoke.mockImplementationOnce(() => new Promise((resolve) => (open = resolve)));
    await userEvent.click(screen.getByRole('button', { name: 'Bắt đầu: Gọi đồ ở quán cà phê' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Gọi đồ ở quán cà phê' })).toHaveFocus();
    open({ data: turn({ partner_reply: 'Hi! Welcome to Sunny Café.' }), error: null });
    await screen.findByText(/Welcome to Sunny Café/);
    await waitFor(() => expect(screen.getByLabelText(/Tin nhắn của bạn/)).toHaveFocus());

    await userEvent.click(screen.getByRole('button', { name: 'Chọn tình huống khác' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Đóng vai với AI' })).toHaveFocus();

    reply((b) => (b.turn_index === 0 ? turn({ partner_reply: 'Hi! Welcome to Sunny Café.' }) : turn()));
    await begin();
    reply((b) => (b.task === 'summarize_session' ? aiSuccess('summarize_session', SUMMARY_DATA) : turn()));
    await say('A latte');
    await screen.findByText('Lượt 2/12');
    await userEvent.click(screen.getByRole('button', { name: 'Kết thúc và xem tóm tắt' }));
    expect(await screen.findByRole('heading', { name: 'Tóm tắt buổi đóng vai' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Luyện tình huống khác' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Đóng vai với AI' })).toHaveFocus();
  });

  it('words the AI notice for the role-play partner', async () => {
    mocks.notice = notice(false);
    render();
    await userEvent.click(screen.getByRole('button', { name: 'Bắt đầu: Gọi đồ ở quán cà phê' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveAccessibleName(/Trước khi trò chuyện với Đối tác AI/);
    expect(dialog).toHaveTextContent('Tin nhắn của bạn được gửi tới Google Gemini');
  });
});


describe('RoleplayPage offline', () => {
  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('says it needs the network instead of offering what cannot work', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    render();
    expect(screen.getByText('Tính năng này cần mạng')).toBeInTheDocument();
    expect(screen.getByText(/Đóng vai với AI cần kết nối mạng/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tiếp tục học ngoại tuyến' })).toHaveAttribute('href', '/app/hoc-tap');
  });
});
