import { act, render, screen, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthContext, type AuthState } from '@/features/auth/AuthProvider';
import { LESSON_ID, PATH_ID, RUN_ID, result, run, submitArgs } from './lesson-fixtures';
import { enqueueLessonCompletion, enqueueLessonStart } from './offline-queue';
import { createOutbox } from './outbox';
import { OutboxSyncProvider, useOutboxSyncContext } from './OutboxSyncProvider';
import { readSyncReports } from './sync-report';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const AT = '2026-10-20T08:00:00.000Z';
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));

const auth: AuthState = { status: 'signed-in', session: null, user: { id: USER_ID } as User };
const NETWORK = { data: null, error: { message: 'TypeError: Failed to fetch', code: '' }, status: 0 };

function Probe() {
  const ctx = useOutboxSyncContext();
  return (
    <div>
      <output data-testid="pending">{ctx.pendingCount}</output>
      <output data-testid="all">{ctx.status.pending}</output>
      <output data-testid="by-run">{JSON.stringify(ctx.pendingByRun)}</output>
      <output data-testid="completing">{ctx.completingRuns.join(',')}</output>
      <output data-testid="completions">{Object.keys(ctx.completions).join(',')}</output>
      <output data-testid="reports">{ctx.reports.map((r) => `${r.kind}:${r.reason}:${r.count}`).join('|')}</output>
      <button onClick={() => ctx.dismissReport(ctx.reports[0]!.id)}>dismiss</button>
    </div>
  );
}

function mount() {
  return render(
    <AuthContext.Provider value={auth}>
      <ToastProvider>
        <OutboxSyncProvider>
          <Probe />
        </OutboxSyncProvider>
      </ToastProvider>
    </AuthContext.Provider>,
  );
}

const COMPLETE = {
  accuracy_by_stage: { recognition: 1, recall: null, application: null },
  almost_count: 0,
  confident_wrong: 0,
  unsure_right: 0,
  next_review_at: '2026-10-21T08:00:00Z',
  completed_at: '2026-10-20T08:05:00Z',
};

beforeEach(() => {
  localStorage.clear();
  mocks.rpc.mockReset();
});

describe('OutboxSyncProvider (lesson runs)', () => {
  it('exposes per-run pending counts while offline and replays start, answers and completion once online', async () => {
    mocks.rpc.mockResolvedValue(NETWORK);
    enqueueLessonStart(USER_ID, { runId: RUN_ID, lessonId: LESSON_ID, pathId: PATH_ID, clientAt: AT });
    createOutbox(USER_ID).add({ args: submitArgs({ p_run_id: RUN_ID }), queueIndex: 0 });
    enqueueLessonCompletion(USER_ID, RUN_ID, AT);
    mount();
    // Start + answer must reach the server first; the completion itself is tracked separately.
    expect(screen.getByTestId('by-run')).toHaveTextContent(JSON.stringify({ [RUN_ID]: 2 }));
    expect(screen.getByTestId('completing')).toHaveTextContent(RUN_ID);
    expect(screen.getByTestId('all')).toHaveTextContent('3');

    mocks.rpc.mockImplementation((fn: string) => {
      if (fn === 'start_lesson') return Promise.resolve({ data: run(), error: null });
      if (fn === 'submit_exercise') return Promise.resolve({ data: result(), error: null });
      return Promise.resolve({ data: COMPLETE, error: null });
    });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(screen.getByTestId('all')).toHaveTextContent('0'));
    expect(screen.getByTestId('completions')).toHaveTextContent(RUN_ID);
    expect(screen.getByTestId('by-run')).toHaveTextContent('{}');
    expect(mocks.rpc.mock.calls.map((c) => c[0]).slice(-3)).toEqual(['start_lesson', 'submit_exercise', 'complete_lesson']);
  });

  it('records a persisted report and toasts once when the server refuses a queued run', async () => {
    mocks.rpc.mockImplementation((fn: string) =>
      Promise.resolve(fn === 'start_lesson' ? { data: null, error: { message: 'lesson_not_in_path', code: 'P0001' } } : { data: result(), error: null }),
    );
    enqueueLessonStart(USER_ID, { runId: RUN_ID, lessonId: LESSON_ID, pathId: PATH_ID, clientAt: AT });
    createOutbox(USER_ID).add({ args: submitArgs({ p_run_id: RUN_ID }), queueIndex: 0 });
    mount();
    await waitFor(() => expect(screen.getByTestId('reports')).toHaveTextContent('lesson:lesson_not_in_path:2'));
    expect(readSyncReports(USER_ID)).toHaveLength(1);
    await waitFor(() => expect(document.body).toHaveTextContent('2 câu trả lời bài học không đồng bộ được'));
    await act(async () => {
      screen.getByText('dismiss').click();
    });
    expect(screen.getByTestId('reports')).toHaveTextContent('');
    expect(readSyncReports(USER_ID)).toEqual([]);
  });
});
