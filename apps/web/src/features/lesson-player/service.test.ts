import { describe, expect, it } from 'vitest';
import { fakeClient } from '../../../tests/unit/fake-supabase';
import { LESSON_ID, PATH_ID, RUN_ID, pathLesson, payload, result, run, submitArgs } from './lesson-fixtures';
import { completeLesson, fetchPathLessons, getLesson, saveCursor, startLesson, submitExercise } from './service';

const COMPLETE = {
  accuracy_by_stage: { recognition: 1, recall: 0.5, application: null },
  almost_count: 1,
  confident_wrong: 0,
  unsure_right: 1,
  next_review_at: '2026-10-14T00:00:00+07:00',
  completed_at: '2026-10-13T08:00:00Z',
};

describe('lesson-player service', () => {
  it('fetches and parses the lessons of a path', async () => {
    const client = fakeClient({}, { path_lessons: { data: [pathLesson()] } });
    expect(await fetchPathLessons(client, PATH_ID)).toEqual([pathLesson()]);
    expect(client.rpcCalls).toEqual([['path_lessons', { p_path_id: PATH_ID }]]);
  });

  it('treats a null path_lessons result as an empty list', async () => {
    const client = fakeClient({}, { path_lessons: { data: null } });
    expect(await fetchPathLessons(client, PATH_ID)).toEqual([]);
  });

  it('gets a lesson payload', async () => {
    const client = fakeClient({}, { get_lesson: { data: payload() } });
    expect(await getLesson(client, LESSON_ID, PATH_ID)).toEqual(payload());
    expect(client.rpcCalls).toEqual([['get_lesson', { p_lesson_id: LESSON_ID, p_path_id: PATH_ID }]]);
  });

  it('starts a lesson run', async () => {
    const client = fakeClient({}, { start_lesson: { data: run() } });
    expect(await startLesson(client, LESSON_ID, PATH_ID)).toEqual(run());
    expect(client.rpcCalls).toEqual([['start_lesson', { p_lesson_id: LESSON_ID, p_path_id: PATH_ID }]]);
  });

  it('saves the cursor', async () => {
    const client = fakeClient({}, { save_lesson_cursor: { data: null } });
    await saveCursor(client, RUN_ID, 3);
    expect(client.rpcCalls).toEqual([['save_lesson_cursor', { p_run_id: RUN_ID, p_cursor: 3 }]]);
  });

  it('submits an exercise with the args unchanged', async () => {
    const args = submitArgs();
    const graded = result();
    const client = fakeClient({}, { submit_exercise: { data: graded } });
    expect(await submitExercise(client, args)).toEqual(graded);
    expect(client.rpcCalls).toEqual([['submit_exercise', args]]);
  });

  it('completes a lesson', async () => {
    const client = fakeClient({}, { complete_lesson: { data: COMPLETE } });
    expect(await completeLesson(client, RUN_ID)).toEqual(COMPLETE);
    expect(client.rpcCalls).toEqual([['complete_lesson', { p_run_id: RUN_ID }]]);
  });

  it('rethrows the supabase error as returned', async () => {
    const error = { message: 'lesson_not_found', code: 'P0001' };
    const client = fakeClient({}, { get_lesson: { data: null, error } });
    await expect(getLesson(client, LESSON_ID, PATH_ID)).rejects.toBe(error);
  });

  it('keeps the HTTP status on the thrown error so transient failures can be retried', async () => {
    const error = { message: '<html>Bad gateway</html>', code: '' };
    const client = { rpc: () => Promise.resolve({ data: null, error, status: 502 }) } as unknown as Parameters<typeof getLesson>[0];
    await expect(getLesson(client, LESSON_ID, PATH_ID)).rejects.toMatchObject({ message: error.message, status: 502 });
  });

  it('throws invalid_payload when the response does not match the contract', async () => {
    const client = fakeClient({}, { submit_exercise: { data: { verdict: 'maybe' } }, get_lesson: { data: { lesson: null } } });
    await expect(submitExercise(client, submitArgs())).rejects.toThrow('invalid_payload');
    await expect(getLesson(client, LESSON_ID, PATH_ID)).rejects.toThrow('invalid_payload');
  });
});
