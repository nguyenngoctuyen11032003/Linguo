import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LearningPathsContext, type LearningPathsContextValue } from '@/features/learning-paths/LearningPathsProvider';
import type { LearningPath } from '@/features/learning-paths/service';
import { fakeClient } from '../../../tests/unit/fake-supabase';
import { LESSON_ID, PATH_ID, pathLesson, payload } from '../lesson-player/lesson-fixtures';
import { FALLBACK_SENTENCES } from './content';
import { defaultLessonId, lessonChoices, useSpeakingMaterial } from './useSpeakingMaterial';

const mocks = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client, requireSupabase: () => mocks.client }));

const SECOND = '20000000-0000-4000-8000-000000000002';
const THIRD = '20000000-0000-4000-8000-000000000003';

function paths(language: 'en' | 'ko' = 'en'): LearningPathsContextValue {
  return {
    status: 'ready',
    error: null,
    paths: [],
    currentId: PATH_ID,
    current: { id: PATH_ID, language } as LearningPath,
    reload: vi.fn(),
    setCurrent: vi.fn(),
    upsertPath: vi.fn(),
  };
}

function render(language: 'en' | 'ko' = 'en') {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <LearningPathsContext.Provider value={paths(language)}>{children}</LearningPathsContext.Provider>
  );
  return renderHook(() => useSpeakingMaterial(), { wrapper: Wrapper });
}

const lessonsRpc = [
  pathLesson({ run_status: 'completed' }),
  pathLesson({ lesson_id: SECOND, lesson_order: 2, title: { vi: 'Giới thiệu' }, run_status: 'in_progress' }),
  pathLesson({ lesson_id: THIRD, lesson_order: 3, title: { vi: 'Số đếm' }, run_status: 'not_started' }),
];

describe('lessonChoices / defaultLessonId', () => {
  it('offers studied lessons plus the next startable one, defaulting to the lesson in progress', () => {
    const list = lessonChoices(lessonsRpc.map((l) => ({ ...l })));
    expect(list.map((l) => l.lesson_id)).toEqual([LESSON_ID, SECOND, THIRD]);
    expect(defaultLessonId(list)).toBe(SECOND);
  });
  it('falls back to the last completed lesson, then the first choice', () => {
    const done = [pathLesson({ run_status: 'completed' }), pathLesson({ lesson_id: SECOND, run_status: 'completed' })];
    expect(defaultLessonId(lessonChoices(done))).toBe(SECOND);
    expect(defaultLessonId(lessonChoices([pathLesson()]))).toBe(LESSON_ID);
    expect(defaultLessonId([])).toBeNull();
  });
  it('skips not-started lessons whose prerequisites are unmet', () => {
    expect(lessonChoices([pathLesson({ prerequisites_met: false })])).toEqual([]);
  });
});

describe('useSpeakingMaterial', () => {
  it('loads the sentences of the lesson in progress with get_lesson only (no run is started)', async () => {
    const client = fakeClient({}, { path_lessons: { data: lessonsRpc }, get_lesson: { data: payload() } });
    mocks.client = client;
    const { result } = render();
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.lang).toBe('en');
    expect(result.current.lessonId).toBe(SECOND);
    expect(result.current.lessonTitle).toBe('Giới thiệu');
    expect(result.current.sentences.map((s) => s.text)).toEqual(['Hello']);
    expect(result.current.usingFallback).toBe(false);
    expect(client.rpcCalls.map(([name]) => name).sort()).toEqual(['get_lesson', 'path_lessons']);
    expect(client.rpcCalls.find(([n]) => n === 'get_lesson')?.[1]).toEqual({ p_lesson_id: SECOND, p_path_id: PATH_ID });
  });

  it('switches lesson on request', async () => {
    mocks.client = fakeClient({}, { path_lessons: { data: lessonsRpc }, get_lesson: { data: payload() } });
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.selectLesson(THIRD));
    await waitFor(() => expect(result.current.lessonId).toBe(THIRD));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.lessonTitle).toBe('Số đếm');
  });

  it('uses the built-in sentences when the lesson cannot be read', async () => {
    mocks.client = fakeClient({}, { path_lessons: { data: lessonsRpc }, get_lesson: { data: null, error: new Error('x') } });
    const { result } = render('ko');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.usingFallback).toBe(true);
    expect(result.current.sentences).toEqual(FALLBACK_SENTENCES.ko);
  });

  it('uses the built-in sentences when the path has no lessons', async () => {
    mocks.client = fakeClient({}, { path_lessons: { data: [] } });
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toMatchObject({ usingFallback: true, lessonId: null, lessonTitle: null });
    expect(result.current.sentences).toEqual(FALLBACK_SENTENCES.en);
  });
});
