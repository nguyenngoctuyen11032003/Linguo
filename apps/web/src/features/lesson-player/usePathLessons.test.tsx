import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LearningPathsContext, type LearningPathsContextValue } from '@/features/learning-paths/LearningPathsProvider';
import { fakeClient } from '../../../tests/unit/fake-supabase';
import { PATH_ID, pathLesson } from './lesson-fixtures';
import { usePathLessons } from './usePathLessons';

const mocks = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client, requireSupabase: () => mocks.client }));

function paths(overrides: Partial<LearningPathsContextValue> = {}): LearningPathsContextValue {
  return {
    status: 'ready',
    error: null,
    paths: [],
    currentId: PATH_ID,
    current: null,
    reload: vi.fn(),
    setCurrent: vi.fn(),
    upsertPath: vi.fn(),
    ...overrides,
  };
}

function renderLessons(initial: LearningPathsContextValue) {
  let value = initial;
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <LearningPathsContext.Provider value={value}>{children}</LearningPathsContext.Provider>
  );
  const hook = renderHook(() => usePathLessons(), { wrapper: Wrapper });
  return {
    ...hook,
    setPaths(next: LearningPathsContextValue) {
      value = next;
      hook.rerender();
    },
  };
}

describe('usePathLessons', () => {
  it('loads the lessons of the current path', async () => {
    const lessons = [pathLesson(), pathLesson({ lesson_id: '20000000-0000-4000-8000-000000000002', lesson_order: 2 })];
    const client = fakeClient({}, { path_lessons: { data: lessons } });
    mocks.client = client;
    const { result } = renderLessons(paths());
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.lessons).toEqual(lessons);
    expect(result.current.error).toBeNull();
    expect(client.rpcCalls).toEqual([['path_lessons', { p_path_id: PATH_ID }]]);
  });

  it('is empty when there is no path', () => {
    mocks.client = fakeClient({});
    const { result } = renderLessons(paths({ currentId: null }));
    expect(result.current).toMatchObject({ status: 'ready', lessons: [], error: null });
  });

  it('waits while paths are still loading', () => {
    mocks.client = fakeClient({});
    const { result } = renderLessons(paths({ currentId: null, status: 'loading' }));
    expect(result.current.status).toBe('loading');
  });

  it('reports errors in Vietnamese and reloads', async () => {
    const client = fakeClient({}, { path_lessons: { data: null, error: { message: 'path_not_found', code: 'P0001' } } });
    mocks.client = client;
    const { result } = renderLessons(paths());
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Không tìm thấy lộ trình.');
    mocks.client = fakeClient({}, { path_lessons: { data: [pathLesson()] } });
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.lessons).toHaveLength(1);
  });

  it('refetches when the current path changes', async () => {
    const other = '30000000-0000-4000-8000-000000000002';
    const client = fakeClient({}, { path_lessons: { data: [pathLesson()] } });
    mocks.client = client;
    const view = renderLessons(paths());
    await waitFor(() => expect(view.result.current.status).toBe('ready'));
    view.setPaths(paths({ currentId: other }));
    expect(view.result.current).toMatchObject({ status: 'loading', lessons: [] });
    await waitFor(() => expect(view.result.current.status).toBe('ready'));
    expect(client.rpcCalls.map(([, args]) => args)).toEqual([{ p_path_id: PATH_ID }, { p_path_id: other }]);
  });
});
