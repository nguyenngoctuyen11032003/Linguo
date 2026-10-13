import { act, render, screen, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeClient, fakeQuery } from '../../../tests/unit/fake-supabase';
import { ESTIMATE_RECORD, pathRow, TEST_KO_PATH, TEST_PATH } from '../../../tests/unit/learning-fixtures';
import { AuthContext } from '../auth/AuthProvider';
import { learningPathErrorMessage } from './error-map';
import { LearningPathsProvider, useLearningPaths } from './LearningPathsProvider';
import { createPath, fetchCurrentPathId, listPaths, listReferenceHours, setPathStatus, updatePlan } from './service';

const mocks = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client, requireSupabase: () => mocks.client }));

describe('service', () => {
  it('lists open paths and maps them', async () => {
    const q = fakeQuery({ data: [pathRow()] });
    const paths = await listPaths(fakeClient({ learning_paths: q }));
    expect(paths).toEqual([TEST_PATH]);
    expect(q.calls).toContainEqual(['neq', ['status', 'archived']]);
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
    expect(learningPathErrorMessage({ message: 'weird' })).toBe('Đã có lỗi xảy ra. Vui lòng thử lại.');
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
});
