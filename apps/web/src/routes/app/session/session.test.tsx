import { useContext, useState } from 'react';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiRequestInput, StudySession, TodaySessionResult } from '@linguo/shared';
import {
  LESSON_A,
  SESSION_ID,
  inputs,
  mistake,
  plan,
  sessionWithStatuses,
  studySession,
  todayResult,
} from '@/features/session/session-fixtures';
import { LearningPathsContext } from '@/features/learning-paths/LearningPathsProvider';
import { TEST_KO_PATH, TEST_PATH } from '../../../../tests/unit/learning-fixtures';
import { renderWithProviders } from '../../../../tests/unit/render';
import { SessionPage, UNDO_VISIBLE_MS } from './SessionPage';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  request: AiRequestInput;
  fallback?: { title: string; body: string };
}

type Reply = { data?: unknown; error?: unknown };

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  return { rpc, client: { rpc }, sheet: null as SheetProps | null };
});
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client, requireSupabase: () => mocks.client }));
vi.mock('@/components/ai', () => ({
  AiExplainSheet: (props: SheetProps) => {
    mocks.sheet = props;
    return props.open ? <div role="dialog" aria-label="AI sheet" /> : null;
  },
}));

// planSession / shortenPlan are implemented by another task: mock them here.
const planner = vi.hoisted(() => ({ planSession: vi.fn(), shortenPlan: vi.fn() }));
vi.mock('@linguo/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@linguo/shared')>()),
  planSession: planner.planSession,
  shortenPlan: planner.shortenPlan,
}));

/** Per-RPC replies; a function sees the args. Unlisted RPCs answer null. */
let handlers: Record<string, Reply | ((args: Record<string, unknown>) => Reply)> = {};

function serve(today: TodaySessionResult, extra: typeof handlers = {}) {
  handlers = { get_today_session: { data: today }, ...extra };
}

const calls = (name: string) => mocks.rpc.mock.calls.filter(([n]) => n === name).map(([, args]) => args as Record<string, unknown>);

const render = (options: Parameters<typeof renderWithProviders>[1] = {}) =>
  renderWithProviders(<SessionPage />, { route: '/app/phien-hoc', ...options });

const location = () => screen.getByTestId('location').textContent;

async function ready() {
  await waitFor(() => expect(screen.queryByText('Đang tải phiên học…')).not.toBeInTheDocument());
}

const activityTitles = () =>
  within(screen.getByRole('list', { name: 'Các hoạt động của phiên' }))
    .getAllByRole('heading', { level: 3 })
    .map((h) => h.textContent);

beforeEach(() => {
  mocks.rpc.mockImplementation((name: string, args: Record<string, unknown>) => {
    const h = handlers[name];
    const { data = null, error = null } = typeof h === 'function' ? h(args) : (h ?? {});
    return Promise.resolve({ data, error });
  });
});

afterEach(() => {
  mocks.rpc.mockReset();
  mocks.sheet = null;
  planner.planSession.mockReset();
  planner.shortenPlan.mockReset();
  handlers = {};
});

describe('SessionPage states', () => {
  it('announces loading', () => {
    mocks.rpc.mockImplementation(() => new Promise(() => {}));
    render();
    expect(screen.getByRole('heading', { level: 1, name: 'Phiên học hôm nay' })).toBeInTheDocument();
    expect(screen.getByText('Đang tải phiên học…')).toBeInTheDocument();
  });

  it('shows the error with a retry', async () => {
    handlers = { get_today_session: { error: { message: 'TypeError: Failed to fetch', code: '' } } };
    render();
    expect(await screen.findByText('Không tải được phiên học')).toBeInTheDocument();
    expect(screen.getByText('Không kết nối được máy chủ. Kiểm tra mạng và thử lại.')).toBeInTheDocument();
    serve(todayResult(null));
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('button', { name: /^Lập kế hoạch/ })).toBeInTheDocument();
  });

  it('sends a learner without a path to onboarding', () => {
    render({ paths: { paths: [], currentId: null } });
    expect(location()).toBe('/app/bat-dau');
  });
});

describe('planning a session', () => {
  it('defaults to the length nearest to the goal and saves the planned session', async () => {
    serve(todayResult(null, { daily_goal_minutes: 25, studied_seconds_today: 300 }), {
      get_session_inputs: { data: inputs() },
      save_session_plan: (args) => ({ data: studySession({ minutes_planned: 15, plan: args.p_plan as StudySession['plan'] }) }),
    });
    planner.planSession.mockReturnValue(plan({ minutes: 15 }));
    render();
    await ready();
    expect(screen.getByText('Mục tiêu hôm nay: 25 phút · Đã học 5 phút')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '30 phút' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: '15 phút' }));
    expect(screen.getByRole('button', { name: '15 phút' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Lập kế hoạch 15 phút' }));

    expect(await screen.findByRole('button', { name: 'Bắt đầu phiên học' })).toBeInTheDocument();
    expect(planner.planSession).toHaveBeenCalledWith(inputs(), 15);
    expect(calls('save_session_plan')).toEqual([{ p_path_id: 'path-en', p_plan: plan({ minutes: 15 }), p_replace: false }]);
    // Plan preview: minutes and reason per activity.
    expect(activityTitles()).toEqual(['Ôn thẻ đến hạn', 'Chào hỏi', 'Luyện ngữ pháp', 'Tổng kết']);
    expect(screen.getByText('18 thẻ đến hạn, 6 thẻ quá hạn')).toBeInTheDocument();
    expect(screen.getByText(/Ôn tập · 6 phút/)).toBeInTheDocument();
    expect(screen.getByText('Tiến độ: 0/4 hoạt động')).toBeInTheDocument();
  });

  it('does not show made-up goal numbers when there is no goal', async () => {
    serve(todayResult(null, { daily_goal_minutes: 0 }));
    render();
    await ready();
    expect(screen.queryByText(/Mục tiêu hôm nay/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '15 phút' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows a planner failure', async () => {
    serve(todayResult(null), { get_session_inputs: { data: inputs() } });
    planner.planSession.mockImplementation(() => {
      throw new Error('nope');
    });
    render();
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Lập kế hoạch 30 phút' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa lập được kế hoạch cho hôm nay');
    expect(calls('save_session_plan')).toEqual([]);
  });

  it('preselects ?phut=10 from the home card, even after a completed session', async () => {
    serve(todayResult(sessionWithStatuses(['done', 'done', 'done', 'done'], { status: 'completed' })));
    render({ route: '/app/phien-hoc?phut=10' });
    await ready();
    expect(screen.queryByRole('heading', { name: 'Hoàn thành phiên học' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '10 phút' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Lập kế hoạch 10 phút' })).toBeInTheDocument();
  });

  it('offers to replan a planned session at ?phut=10', async () => {
    serve(todayResult(studySession()));
    render({ route: '/app/phien-hoc?phut=10' });
    await ready();
    expect(screen.getByRole('button', { name: 'Lập lại kế hoạch 10 phút' })).toBeInTheDocument();
  });

  it('shows a paused path instead of planning', async () => {
    serve(todayResult(null));
    render({ paths: { paths: [{ ...TEST_PATH, status: 'paused' }] } });
    await ready();
    expect(screen.getByRole('heading', { name: 'Lộ trình đang tạm dừng' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Về trang chủ' })).toHaveAttribute('href', '/app');
    expect(screen.queryByRole('button', { name: /^Lập kế hoạch/ })).not.toBeInTheDocument();
  });

  it('shows the paused state when the server refuses to plan with path_not_active', async () => {
    serve(todayResult(null), { get_session_inputs: { error: { message: 'path_not_active', code: 'P0001' } } });
    render();
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Lập kế hoạch 30 phút' }));
    expect(await screen.findByRole('heading', { name: 'Lộ trình đang tạm dừng' })).toBeInTheDocument();
  });

  it('forgets the paused refusal and the chosen length when the learner switches path', async () => {
    serve(todayResult(null), {
      get_session_inputs: (args) =>
        args.p_path_id === TEST_PATH.id ? { error: { message: 'path_not_active', code: 'P0001' } } : { data: inputs() },
    });
    function SwitchablePath() {
      const outer = useContext(LearningPathsContext)!;
      const [current, setCurrent] = useState(TEST_PATH);
      return (
        <LearningPathsContext.Provider value={{ ...outer, paths: [TEST_PATH, TEST_KO_PATH], currentId: current.id, current }}>
          <button type="button" onClick={() => setCurrent(TEST_KO_PATH)}>
            Đổi lộ trình
          </button>
          <SessionPage />
        </LearningPathsContext.Provider>
      );
    }
    renderWithProviders(<SwitchablePath />, { route: '/app/phien-hoc' });
    await ready();
    await userEvent.click(screen.getByRole('button', { name: '15 phút' }));
    await userEvent.click(screen.getByRole('button', { name: 'Lập kế hoạch 15 phút' }));
    expect(await screen.findByRole('heading', { name: 'Lộ trình đang tạm dừng' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Đổi lộ trình' }));
    await waitFor(() => expect(calls('get_today_session')).toContainEqual({ p_path_id: TEST_KO_PATH.id }));
    expect(await screen.findByRole('button', { name: 'Lập kế hoạch 30 phút' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Lộ trình đang tạm dừng' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('replans a planned session with another length, replacing it', async () => {
    serve(todayResult(studySession()), {
      get_session_inputs: { data: inputs() },
      save_session_plan: (args) => ({ data: studySession({ minutes_planned: 45, plan: args.p_plan as StudySession['plan'] }) }),
    });
    planner.planSession.mockReturnValue(plan({ minutes: 45 }));
    render();
    await ready();
    expect(screen.getByRole('button', { name: '30 phút' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: /Lập lại kế hoạch/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '45 phút' }));
    await userEvent.click(screen.getByRole('button', { name: 'Lập lại kế hoạch 45 phút' }));
    await waitFor(() => expect(calls('save_session_plan')).toHaveLength(1));
    expect(calls('save_session_plan')[0]).toMatchObject({ p_replace: true });
    expect(await screen.findByText('Phiên 45 phút')).toBeInTheDocument();
  });
});

describe('a running session', () => {
  it('restores an in-progress session from the server', async () => {
    serve(todayResult(sessionWithStatuses(['done', 'skipped', 'pending', 'pending'])));
    render();
    await ready();
    expect(screen.getByText('Ưu tiên ôn tập: 18 thẻ đến hạn')).toBeInTheDocument();
    expect(screen.getByText('Tiến độ: 2/4 hoạt động')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Tiến độ phiên học' })).toHaveAttribute('aria-valuenow', '2');
    expect(screen.getByText(/Đã xong/)).toBeInTheDocument();
    expect(screen.getByText(/Đã bỏ qua/)).toBeInTheDocument();
    // Only pending activities can be skipped; length chips are only for a session not started yet.
    expect(screen.getAllByRole('button', { name: /^Bỏ qua/ })).toHaveLength(2);
    expect(screen.queryByRole('group', { name: 'Bạn có bao nhiêu phút?' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    expect(location()).toBe(`/app/hoc-tap/bai/50000000-0000-4000-8000-00000000000b?phien=${SESSION_ID}&muc=a3`);
  });

  it('starts with the first pending activity in the review', async () => {
    serve(todayResult(studySession()));
    render();
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Bắt đầu phiên học' }));
    expect(location()).toBe(`/app/on-tap?phien=${SESSION_ID}&muc=a1&so-the=25`);
  });

  it('reorders with the arrow buttons, keeping keyboard focus and announcing the move', async () => {
    serve(todayResult(studySession()), {
      reorder_session: (args) => {
        const order = args.p_order as string[];
        const byId = new Map(plan().activities.map((a) => [a.id, a]));
        return { data: studySession({ plan: { ...plan(), activities: order.map((id) => byId.get(id)!) } }) };
      },
    });
    render();
    await ready();
    expect(screen.getByRole('button', { name: 'Đưa “Ôn thẻ đến hạn” lên' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Đưa “Tổng kết” xuống' })).toBeDisabled();

    // Keyboard: focus "Chào hỏi" up and press Enter.
    screen.getByRole('button', { name: 'Đưa “Chào hỏi” lên' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(activityTitles()).toEqual(['Chào hỏi', 'Ôn thẻ đến hạn', 'Luyện ngữ pháp', 'Tổng kết']);
    expect(screen.getByText('“Chào hỏi”: vị trí 1/4.')).toBeInTheDocument();
    // Now first: its up arrow is disabled, so focus moves to its down arrow.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Đưa “Chào hỏi” xuống' })).toHaveFocus());
    await waitFor(() => expect(calls('reorder_session')).toEqual([{ p_session_id: SESSION_ID, p_order: ['a2', 'a1', 'a3', 'a4'] }]));

    await userEvent.keyboard('{Enter}');
    expect(activityTitles()).toEqual(['Ôn thẻ đến hạn', 'Chào hỏi', 'Luyện ngữ pháp', 'Tổng kết']);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Đưa “Chào hỏi” xuống' })).toHaveFocus());
    await waitFor(() => expect(calls('reorder_session')).toHaveLength(2));
    expect(calls('reorder_session')[1]).toEqual({ p_session_id: SESSION_ID, p_order: ['a1', 'a2', 'a3', 'a4'] });
    // The first pending activity follows the new order.
    await userEvent.click(screen.getByRole('button', { name: 'Đưa “Chào hỏi” lên' }));
    await userEvent.click(screen.getByRole('button', { name: 'Bắt đầu phiên học' }));
    expect(location()).toBe(`/app/hoc-tap/bai/${LESSON_A}?phien=${SESSION_ID}&muc=a2`);
  });

  it('restores the server order when a reorder is refused', async () => {
    let todayCalls = 0;
    serve(todayResult(studySession()), {
      get_today_session: () => {
        todayCalls += 1;
        return { data: todayResult(studySession()) };
      },
      reorder_session: { error: { message: 'invalid_order', code: 'P0001' } },
    });
    render();
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Đưa “Chào hỏi” lên' }));
    expect(await screen.findByText('Thứ tự hoạt động không hợp lệ. Hãy tải lại trang rồi thử lại.')).toBeInTheDocument();
    await waitFor(() => expect(todayCalls).toBe(2));
    await waitFor(() => expect(activityTitles()).toEqual(['Ôn thẻ đến hạn', 'Chào hỏi', 'Luyện ngữ pháp', 'Tổng kết']));
  });

  it('skips an activity', async () => {
    serve(todayResult(studySession()), { update_session_item: { data: sessionWithStatuses(['skipped', 'pending', 'pending', 'pending']) } });
    render();
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Bỏ qua “Ôn thẻ đến hạn”' }));
    expect(await screen.findByText('Tiến độ: 1/4 hoạt động')).toBeInTheDocument();
    expect(calls('update_session_item')).toEqual([{ p_session_id: SESSION_ID, p_item_id: 'a1', p_status: 'skipped', p_seconds: 0 }]);
    expect(screen.getByText('Đã bỏ qua “Ôn thẻ đến hạn”.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tiếp tục' })).toBeInTheDocument();
  });

  it('offers Hoàn tác after a skip and restores the activity through update_session_item', async () => {
    serve(todayResult(studySession()), {
      update_session_item: (args) =>
        args.p_status === 'pending'
          ? { data: sessionWithStatuses(['pending', 'pending', 'pending', 'pending']) }
          : { data: sessionWithStatuses(['skipped', 'pending', 'pending', 'pending']) },
    });
    render();
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Bỏ qua “Ôn thẻ đến hạn”' }));
    expect(await screen.findByText('Tiến độ: 1/4 hoạt động')).toBeInTheDocument();
    expect(document.querySelector('p[aria-live="polite"]')).toHaveTextContent('Đã bỏ qua “Ôn thẻ đến hạn”. Bạn có thể bấm Hoàn tác');
    const undo = screen.getByRole('button', { name: 'Hoàn tác' });
    expect(undo.className).toContain('min-h-11');
    undo.focus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByText('Tiến độ: 0/4 hoạt động')).toBeInTheDocument();
    expect(calls('update_session_item')[1]).toEqual({ p_session_id: SESSION_ID, p_item_id: 'a1', p_status: 'pending', p_seconds: 0 });
    expect(screen.queryByRole('button', { name: 'Hoàn tác' })).not.toBeInTheDocument();
    expect(document.querySelector('p[aria-live="polite"]')).toHaveTextContent('Đã hoàn tác: “Ôn thẻ đến hạn” cần học lại.');
  });

  it('drops the Hoàn tác offer after a few seconds and when the order changes', async () => {
    serve(todayResult(studySession()), { update_session_item: { data: sessionWithStatuses(['skipped', 'pending', 'pending', 'pending']) } });
    render();
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Bỏ qua “Ôn thẻ đến hạn”' }));
    expect(await screen.findByRole('button', { name: 'Hoàn tác' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Đưa “Chào hỏi” xuống' }));
    expect(screen.queryByRole('button', { name: 'Hoàn tác' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Bỏ qua “Luyện ngữ pháp”' }));
    expect(await screen.findByRole('button', { name: 'Hoàn tác' })).toBeInTheDocument();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, UNDO_VISIBLE_MS + 100));
    });
    expect(screen.queryByRole('button', { name: 'Hoàn tác' })).not.toBeInTheDocument();
  }, 20000);

  it('gives the arrows 44 px targets, names with the title and a neutral disabled style', async () => {
    serve(todayResult(studySession()));
    render();
    await ready();
    const up = screen.getByRole('button', { name: 'Đưa “Ôn thẻ đến hạn” lên' });
    const down = screen.getByRole('button', { name: 'Đưa “Ôn thẻ đến hạn” xuống' });
    for (const button of [up, down]) {
      expect(button.className).toContain('size-11');
      expect(button.className).toContain('min-h-11');
      expect(button.className).not.toContain('opacity');
    }
    expect(up).toBeDisabled();
    expect(up.className).toContain('disabled:outline-dashed');
    expect(down).toBeEnabled();
  });

  it('keeps a skip made while a reorder is still in flight', async () => {
    // A tiny server: each call changes its state and answers with the session as it is at that moment.
    let server = studySession();
    const answer = () => ({ data: server, error: null });
    serve(todayResult(server), {
      update_session_item: (args) => {
        const activities = server.plan.activities.map((a) => (a.id === args.p_item_id ? { ...a, status: 'skipped' as const } : a));
        server = { ...server, status: 'in_progress', plan: { ...server.plan, activities } };
        return answer();
      },
    });
    // The reorder is applied at once but its answer is slow to come back.
    let releaseReorder!: () => void;
    const base = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation((name: string, args: Record<string, unknown>) => {
      if (name !== 'reorder_session') return base(name, args);
      const byId = new Map(server.plan.activities.map((a) => [a.id, a]));
      server = { ...server, plan: { ...server.plan, activities: (args.p_order as string[]).map((id) => byId.get(id)!) } };
      const reply = answer();
      return new Promise((resolve) => {
        releaseReorder = () => resolve(reply);
      });
    });
    render();
    await ready();

    await userEvent.click(screen.getByRole('button', { name: 'Đưa “Chào hỏi” xuống' }));
    await userEvent.click(screen.getByRole('button', { name: 'Bỏ qua “Luyện ngữ pháp”' }));
    await waitFor(() => expect(calls('reorder_session')).toHaveLength(1));
    act(() => releaseReorder());
    await waitFor(() => expect(calls('update_session_item')).toHaveLength(1));
    await waitFor(() => expect(screen.getByText('Tiến độ: 1/4 hoạt động')).toBeInTheDocument());
    // Let every pending answer land: the older reorder answer must not bring the skipped activity back.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.getByText('Tiến độ: 1/4 hoạt động')).toBeInTheDocument();
    expect(activityTitles()).toEqual(['Ôn thẻ đến hạn', 'Luyện ngữ pháp', 'Chào hỏi', 'Tổng kết']);
    expect(screen.queryByRole('button', { name: 'Bỏ qua “Luyện ngữ pháp”' })).not.toBeInTheDocument();
  });

  it('shortens to 10 minutes and saves over the open session', async () => {
    const short = plan({ minutes: 10, activities: plan().activities.slice(0, 2).map((a) => ({ ...a, minutes: 5 })) });
    serve(todayResult(studySession()), { save_session_plan: { data: studySession({ minutes_planned: 10, plan: short }) } });
    planner.shortenPlan.mockReturnValue(short);
    render();
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Rút gọn còn 10 phút' }));
    expect(await screen.findByText('Phiên 10 phút')).toBeInTheDocument();
    expect(planner.shortenPlan).toHaveBeenCalledWith(plan(), 10);
    expect(calls('save_session_plan')).toEqual([{ p_path_id: 'path-en', p_plan: short, p_replace: true }]);
    expect(activityTitles()).toEqual(['Ôn thẻ đến hạn', 'Chào hỏi']);
    // Nothing left to shorten.
    expect(screen.queryByRole('button', { name: 'Rút gọn còn 10 phút' })).not.toBeInTheDocument();
    expect(screen.getByText('Đã rút gọn phiên còn 10 phút.')).toBeInTheDocument();
  });

  it('offers to finish when nothing is pending', async () => {
    serve(todayResult(sessionWithStatuses(['done', 'done', 'skipped', 'skipped'])), {
      finish_session: { data: sessionWithStatuses(['done', 'done', 'skipped', 'skipped'], { status: 'completed' }) },
    });
    render();
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Kết thúc phiên' }));
    expect(await screen.findByRole('heading', { name: 'Hoàn thành phiên học' })).toBeInTheDocument();
    expect(calls('finish_session')).toEqual([{ p_session_id: SESSION_ID, p_status: 'completed' }]);
  });
});

describe('recap and completion', () => {
  const mistakes = [mistake(1), mistake(2, { prompt_text: 'Dịch: tạm biệt', expected_answer: null, learner_answer: null })];

  it("lists today's mistakes with an AI explanation, then completes the session", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] });
    const completed = sessionWithStatuses(['done', 'done', 'done', 'done'], { status: 'completed' });
    serve(todayResult(sessionWithStatuses(['done', 'done', 'skipped', 'pending'])), {
      session_recap: { data: mistakes },
      update_session_item: { data: completed },
    });
    render();
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    expect(screen.getByRole('heading', { name: 'Tổng kết: lỗi sai hôm nay' })).toHaveFocus();
    expect(await screen.findByText('Chọn: I ___ a student')).toBeInTheDocument();
    // An answer key never revealed is not shown; a give-up shows as such.
    expect(screen.getAllByText('Đáp án đúng:')).toHaveLength(1);
    expect(screen.getByText('(bỏ qua)')).toBeInTheDocument();
    expect(calls('session_recap')).toEqual([{ p_session_id: SESSION_ID }]);

    await userEvent.click(screen.getAllByRole('button', { name: 'Giải thích AI' })[0]!);
    expect(screen.getByRole('dialog', { name: 'AI sheet' })).toBeInTheDocument();
    expect(mocks.sheet?.request).toEqual({
      task: 'analyze_error',
      language: 'en',
      level: 'a2',
      lesson_id: LESSON_A,
      prompt: 'Chọn: I ___ a student',
      expected: 'am',
      answer: 'is',
    });
    expect(mocks.sheet?.fallback).toEqual({ title: 'Đáp án đúng', body: 'am' });
    act(() => mocks.sheet?.onClose());

    act(() => vi.setSystemTime(Date.now() + 90_000));
    await userEvent.click(screen.getByRole('button', { name: 'Xong phần tổng kết' }));
    expect(await screen.findByRole('heading', { name: 'Hoàn thành phiên học' })).toBeInTheDocument();
    const update = calls('update_session_item')[0]!;
    expect(update).toMatchObject({ p_session_id: SESSION_ID, p_item_id: 'a4', p_status: 'done' });
    expect(update.p_seconds).toBeGreaterThanOrEqual(90);
    vi.useRealTimers();
  });

  it('praises a day without mistakes and goes back to the plan', async () => {
    serve(todayResult(sessionWithStatuses(['done', 'done', 'done', 'pending'])), { session_recap: { data: [] } });
    render();
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    expect(await screen.findByText(/chưa có lỗi sai nào/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Quay lại kế hoạch' }));
    expect(screen.getByText('Tiến độ: 3/4 hoạt động')).toBeInTheDocument();
  });

  it('shows the completion screen and offers another short session', async () => {
    serve(todayResult(sessionWithStatuses(['done', 'done', 'skipped', 'done'], { status: 'completed' })));
    render();
    await ready();
    const heading = screen.getByRole('heading', { name: 'Hoàn thành phiên học' });
    // The focus moves in a passive effect, which React may flush in a later task than the commit `ready()` saw.
    await waitFor(() => expect(heading).toHaveFocus());
    // 6 + 9 + 3 minutes done.
    expect(screen.getByText('18 phút')).toBeInTheDocument();
    expect(screen.getByText('3/4')).toBeInTheDocument();
    expect(screen.getByText(/Đã bỏ qua 1 hoạt động/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Về trang chủ' })).toHaveAttribute('href', '/app');
    await userEvent.click(screen.getByRole('button', { name: 'Học thêm một phiên' }));
    expect(screen.getByRole('heading', { name: 'Thêm một phiên nữa?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '10 phút' })).toHaveAttribute('aria-pressed', 'true');
  });
});
