import { act, render, screen, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeClient, fakeQuery } from '../../../tests/unit/fake-supabase';
import { ESTIMATE_RECORD, pathRow, TEST_KO_PATH, TEST_PATH } from '../../../tests/unit/learning-fixtures';
import { AuthContext } from '../auth/AuthProvider';
import { learningPathErrorMessage } from './error-map';
import { LearningPathsProvider, useLearningPaths } from './LearningPathsProvider';
import { createPath, fetchCurrentPathId, listPaths, listReferenceHours, setPathStatus, updatePlan } from './service';
import { GENERIC_ERROR_MESSAGE } from '@/lib/error-fallback';

const mocks = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client, requireSupabase: () => mocks.client }));

describe('service', () => {
  it('lists open paths and maps them', async () => {
    const q = fakeQuery({ data: [pathRow()] });
    const paths = await listPaths(fakeClient({ learning_paths: q }));
    expect(paths).toEqual([TEST_PATH]);
    expect(q.calls).toContainEqual(['neq', ['status', 'archived']]);
  });

  it('orders open paths by created_at with an id tie-breaker', async () => {
    const q = fakeQuery({ data: [] });
    await listPaths(fakeClient({ learning_paths: q }));
    const orders = q.calls.filter(([m]) => m === 'order').map(([, args]) => args);
    expect(orders).toEqual([['created_at'], ['id']]);
  });

  it('skips reference rows with an unknown language code', async () => {
    const q = fakeQuery({
      data: [
        { language_code: 'zh', level_code: 'hsk1', ordinal: 1, cumulative_hours: 300, reviewed: true },
        { language_code: 'en', level_code: 'a1', ordinal: 1, cumulative_hours: 90, reviewed: false },
      ],
    });
    const grouped = await listReferenceHours(fakeClient({ level_reference_hours: q }));
    expect(grouped).toEqual({ en: [{ levelCode: 'a1', ordinal: 1, cumulativeHours: 90, reviewed: false }], ko: [], ja: [] });
    expect(q.calls).toContainEqual(['order', ['ordinal']]);
  });

  it('omits the deadline from the plan RPC when targetDate is null (full replace)', async () => {
    const client = fakeClient({}, { update_learning_path_plan: { data: pathRow() } });
    await updatePlan(client, 'path-en', {
      goalType: 'daily_communication',
      targetLevel: 'b1',
      weeklyMinutes: [30, 30, 30, 30, 30, 30, 30],
      targetDate: null,
    });
    expect(client.rpcCalls[0]?.[1]).not.toHaveProperty('p_target_date');
  });

  it('reads the current path id', async () => {
    const q = fakeQuery({ data: { current_learning_path_id: 'path-en' } });
    expect(await fetchCurrentPathId(fakeClient({ profiles: q }), 'u1')).toBe('path-en');
  });

  it('groups reference hours by language', async () => {
    const q = fakeQuery({
      data: [
        { language_code: 'en', level_code: 'a1', ordinal: 1, cumulative_hours: 90, reviewed: false },
        { language_code: 'ko', level_code: 'topik1', ordinal: 1, cumulative_hours: 120, reviewed: true },
      ],
    });
    expect(await listReferenceHours(fakeClient({ level_reference_hours: q }))).toEqual({
      en: [{ levelCode: 'a1', ordinal: 1, cumulativeHours: 90, reviewed: false }],
      ko: [{ levelCode: 'topik1', ordinal: 1, cumulativeHours: 120, reviewed: true }],
      ja: [],
    });
  });

  it('creates through the RPC and omits a null deadline', async () => {
    const client = fakeClient({}, { create_learning_path: { data: pathRow() } });
    const path = await createPath(client, {
      language: 'en',
      startPoint: 'some',
      goalType: 'daily_communication',
      currentLevel: 'a2',
      targetLevel: 'b1',
      weeklyMinutes: [30, 30, 30, 30, 30, 30, 30],
      targetDate: null,
    });
    expect(path).toEqual(TEST_PATH);
    expect(client.rpcCalls[0]).toEqual([
      'create_learning_path',
      {
        p_language: 'en',
        p_start_point: 'some',
        p_goal_type: 'daily_communication',
        p_current_level: 'a2',
        p_target_level: 'b1',
        p_weekly_minutes: [30, 30, 30, 30, 30, 30, 30],
      },
    ]);
  });

  it('updates the plan and status through RPCs and surfaces errors', async () => {
    const client = fakeClient(
      {},
      {
        update_learning_path_plan: { data: pathRow({ target_level: 'b2', target_date: '2027-07-13' }) },
        set_learning_path_status: { data: null, error: { code: 'P0001', message: 'invalid_status_transition' } },
      },
    );
    const updated = await updatePlan(client, 'path-en', {
      goalType: 'daily_communication',
      targetLevel: 'b2',
      weeklyMinutes: [60, 60, 60, 60, 60, 60, 60],
      targetDate: '2027-07-13',
    });
    expect(updated.targetLevel).toBe('b2');
    expect(client.rpcCalls[0]?.[1]).toMatchObject({ p_id: 'path-en', p_target_date: '2027-07-13' });
    await expect(setPathStatus(client, 'path-en', 'completed')).rejects.toMatchObject({ message: 'invalid_status_transition' });
  });
});

describe('learningPathErrorMessage', () => {
  it('maps RPC codes, network errors and unknown errors', () => {
    expect(learningPathErrorMessage({ code: 'P0001', message: 'path_exists_for_language' })).toBe('Bạn đã có lộ trình cho ngôn ngữ này.');
    expect(learningPathErrorMessage(new TypeError('Failed to fetch'))).toBe('Không kết nối được máy chủ. Kiểm tra mạng và thử lại.');
    expect(learningPathErrorMessage({ code: 'P0001', message: 'invalid_date' })).toBe('Ngày không hợp lệ.');
    expect(learningPathErrorMessage({ message: 'weird' })).toBe(GENERIC_ERROR_MESSAGE);
    expect(learningPathErrorMessage({ code: '42501', message: 'permission denied' })).toBe(GENERIC_ERROR_MESSAGE);
    expect(learningPathErrorMessage({ code: 'P0001', message: 'some_new_code' })).toBe(GENERIC_ERROR_MESSAGE);
    expect(learningPathErrorMessage(null)).toBe(GENERIC_ERROR_MESSAGE);
  });

  it('treats a postgrest-wrapped fetch failure as a network error', () => {
    // supabase-js resolves (does not throw) this shape when the request never reaches the server.
    expect(learningPathErrorMessage({ message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' })).toBe(
      'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.',
    );
    expect(learningPathErrorMessage({ message: 'constructor' })).toBe(GENERIC_ERROR_MESSAGE);
  });
});

describe('LearningPathsProvider', () => {
  beforeEach(() => {
    mocks.client = null;
  });

  function Probe() {
    const ctx = useLearningPaths();
    return (
      <div>
        <span data-testid="state">{`${ctx.status}:${ctx.paths.length}:${ctx.current?.id ?? '-'}`}</span>
        <button onClick={() => void ctx.setCurrent('path-ko')}>switch</button>
        <button onClick={() => ctx.upsertPath({ ...TEST_KO_PATH, id: 'path-new' }, { makeCurrent: true })}>add</button>
        <button onClick={() => void ctx.setCurrent('path-3')}>go-3</button>
        <button onClick={() => ctx.reload()}>reload</button>
        <button onClick={() => ctx.current && ctx.upsertPath({ ...ctx.current, status: 'archived' })}>archive-current</button>
      </div>
    );
  }

  const renderProvider = () =>
    render(
      <AuthContext.Provider value={{ status: 'signed-in', session: null, user: { id: 'u1' } as User }}>
        <LearningPathsProvider>
          <Probe />
        </LearningPathsProvider>
      </AuthContext.Provider>,
    );

  it('loads paths and the current one, switches and upserts', async () => {
    mocks.client = fakeClient(
      {
        learning_paths: fakeQuery({ data: [pathRow(), pathRow({ id: 'path-ko', language_code: 'ko', goal_type: 'hangul_basics', current_level: 'hangul', target_level: 'topik1', estimate: ESTIMATE_RECORD })] }),
        profiles: fakeQuery({ data: { current_learning_path_id: 'path-en' } }),
      },
      { set_current_learning_path: { data: null } },
    );
    renderProvider();
    expect(screen.getByTestId('state')).toHaveTextContent('loading:0:-');
    expect(await screen.findByText('ready:2:path-en')).toBeInTheDocument();
    await act(async () => {
      screen.getByText('switch').click();
    });
    expect(screen.getByTestId('state')).toHaveTextContent('ready:2:path-ko');
    act(() => screen.getByText('add').click());
    expect(screen.getByTestId('state')).toHaveTextContent('ready:3:path-new');
  });

  it('falls back to the first path when no current id is stored', async () => {
    mocks.client = fakeClient({
      learning_paths: fakeQuery({ data: [pathRow()] }),
      profiles: fakeQuery({ data: { current_learning_path_id: null } }),
    });
    renderProvider();
    expect(await screen.findByText('ready:1:path-en')).toBeInTheDocument();
  });

  it('reports load errors', async () => {
    mocks.client = fakeClient({
      learning_paths: fakeQuery({ data: null, error: { message: 'boom' } }),
      profiles: fakeQuery({ data: { current_learning_path_id: null } }),
    });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('error:0:-'));
  });

  it('reports an error when there is no Supabase client', async () => {
    mocks.client = null;
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('error:0:-'));
  });

  /** Query whose result is read when awaited and can be held back until released. */
  function liveQuery(getResult: () => { data: unknown; error?: unknown }) {
    const calls: Array<[string, unknown[]]> = [];
    let gate: Promise<void> = Promise.resolve();
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'neq', 'order', 'single']) {
      builder[method] = (...args: unknown[]) => {
        calls.push([method, args]);
        return builder;
      };
    }
    builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
      const snapshot = getResult();
      return gate.then(() => ({ data: snapshot.data, error: snapshot.error ?? null })).then(resolve, reject);
    };
    return {
      query: { calls, builder } as ReturnType<typeof fakeQuery>,
      selects: () => calls.filter(([m]) => m === 'select').length,
      hold: () => {
        let release!: () => void;
        gate = new Promise<void>((r) => (release = r));
        return release;
      },
    };
  }

  const koRow = () =>
    pathRow({ id: 'path-ko', language_code: 'ko', goal_type: 'hangul_basics', current_level: 'hangul', target_level: 'topik1', estimate: ESTIMATE_RECORD });

  it('falls back to the first remaining path when the current path is archived', async () => {
    mocks.client = fakeClient({
      learning_paths: fakeQuery({ data: [pathRow(), koRow()] }),
      profiles: fakeQuery({ data: { current_learning_path_id: 'path-ko' } }),
    });
    renderProvider();
    expect(await screen.findByText('ready:2:path-ko')).toBeInTheDocument();
    act(() => screen.getByText('archive-current').click());
    expect(screen.getByTestId('state')).toHaveTextContent('ready:1:path-en');
  });

  it('discards a reload that started before a local mutation and fetches again', async () => {
    let rows: unknown[] = [pathRow(), koRow()];
    let current = 'path-en';
    const paths = liveQuery(() => ({ data: rows }));
    const profile = liveQuery(() => ({ data: { current_learning_path_id: current } }));
    mocks.client = fakeClient({ learning_paths: paths.query, profiles: profile.query });
    renderProvider();
    expect(await screen.findByText('ready:2:path-en')).toBeInTheDocument();
    expect(paths.selects()).toBe(1);

    const release = paths.hold();
    await act(async () => screen.getByText('reload').click());
    expect(screen.getByTestId('state')).toHaveTextContent('loading:2:path-en');

    // A local change lands while the reload (which will return the old rows) is in flight.
    act(() => screen.getByText('add').click());
    rows = [pathRow(), koRow(), pathRow({ id: 'path-new', created_at: '2026-10-13T01:00:00Z' })];
    current = 'path-new';
    await act(async () => release());

    expect(await screen.findByText('ready:3:path-new')).toBeInTheDocument();
    expect(paths.selects()).toBe(3); // initial load, stale reload, re-triggered reload
  });

  it('applies only the latest of overlapping setCurrent calls', async () => {
    const client = fakeClient({
      learning_paths: fakeQuery({ data: [pathRow(), koRow(), pathRow({ id: 'path-3' })] }),
      profiles: fakeQuery({ data: { current_learning_path_id: 'path-en' } }),
    });
    const resolvers: Array<() => void> = [];
    (client as unknown as { rpc: unknown }).rpc = () => new Promise((resolve) => resolvers.push(() => resolve({ data: null, error: null })));
    mocks.client = client;
    renderProvider();
    expect(await screen.findByText('ready:3:path-en')).toBeInTheDocument();

    await act(async () => {
      screen.getByText('switch').click(); // -> path-ko
      screen.getByText('go-3').click(); // -> path-3
    });
    expect(resolvers).toHaveLength(2);
    await act(async () => resolvers[1]?.());
    expect(screen.getByTestId('state')).toHaveTextContent('ready:3:path-3');
    await act(async () => resolvers[0]?.());
    expect(screen.getByTestId('state')).toHaveTextContent('ready:3:path-3');
  });

  it('keeps previously loaded paths when a reload fails', async () => {
    let result: { data: unknown; error?: unknown } = { data: [pathRow(), koRow()] };
    mocks.client = fakeClient({
      learning_paths: liveQuery(() => result).query,
      profiles: fakeQuery({ data: { current_learning_path_id: 'path-en' } }),
    });
    renderProvider();
    expect(await screen.findByText('ready:2:path-en')).toBeInTheDocument();
    result = { data: null, error: { message: 'boom' } };
    await act(async () => screen.getByText('reload').click());
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('error:2:path-en'));
  });
});

describe('learningPathErrorMessage fallback', () => {
  it('never shows a raw error code to the learner', () => {
    const unknown = [
      { message: 'brand_new_code' },
      { message: 'Boom', code: '23505' },
      { code: 'weak_password_like_code' },
      new Error('some_other_failure'),
      null,
      undefined,
    ];
    for (const error of unknown) {
      const message = learningPathErrorMessage(error as never);
      expect(message).not.toMatch(/mã/i);
      expect(message).not.toMatch(/23505|brand_new_code|weak_password_like_code|some_other_failure/);
    }
    expect(learningPathErrorMessage({ message: 'brand_new_code' } as never)).toBe(GENERIC_ERROR_MESSAGE);
  });
});
