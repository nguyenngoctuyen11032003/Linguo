import { describe, expect, it } from 'vitest';
import { fakeClient } from '../../../tests/unit/fake-supabase';
import { lessonPayloadJson, runJson, uuid } from '../../../tests/unit/lesson-fixtures';
import type { AppSupabaseClient } from '@/lib/supabase';
import { lessonErrorCode, lessonErrorMessage } from './error-map';
import {
  completeLesson,
  getLesson,
  InvalidServerResponseError,
  listPathLessons,
  NetworkError,
  parseLessonPayload,
  saveLessonCursor,
  startLesson,
  submitExercise,
} from './service';

const rejectingClient = (error: unknown) => ({ rpc: () => Promise.reject(error) }) as unknown as AppSupabaseClient;

describe('lesson-player service', () => {
  it('loads a lesson and maps the payload and run state', async () => {
    const client = fakeClient(
      {},
      {
        get_lesson: {
          data: lessonPayloadJson({
            run: runJson({
              cursor: 5,
              attempts: [
                { exercise_id: 'e1', attempt_no: 1, verdict: 'correct', is_correct: true, revealed: false, feedback_json: { display_answer: 'Hello' } },
              ],
            }),
          }),
        },
      },
    );
    const { lesson, run } = await getLesson(client, 'lesson-1', 'path-1');
    expect(client.rpcCalls[0]).toEqual(['get_lesson', { p_lesson_id: 'lesson-1', p_path_id: 'path-1' }]);
    expect(lesson).toMatchObject({ id: 'lesson-1', languageCode: 'en', isDemo: true, contentVersion: 1, estimatedMinutes: 10 });
    expect(lesson.exercises.map((e) => [e.id, e.stage, e.version])).toEqual([
      ['e1', 'recognition', 1],
      ['e2', 'recognition', 1],
      ['e3', 'recall', 1],
      ['e4', 'application', 1],
    ]);
    expect(run?.cursor).toBe(5);
    expect(run?.attempts.e1).toEqual({
      attemptNo: 1,
      verdict: 'correct',
      isCorrect: true,
      revealed: false,
      feedback: { feedbackVi: null, errorTags: [], displayAnswer: 'Hello', explanation: null },
    });
  });

  it('keeps the latest attempt when the run lists several for one exercise', () => {
    const { run } = parseLessonPayload(
      lessonPayloadJson({
        run: runJson({
          attempts: [
            { exercise_id: 'e1', attempt_no: 2, verdict: 'incorrect', is_correct: false, revealed: true },
            { exercise_id: 'e1', attempt_no: 1, verdict: 'incorrect', is_correct: false, revealed: false },
          ],
        }),
      }),
    );
    expect(run?.attempts.e1?.attemptNo).toBe(2);
  });

  it('rejects payloads that break the contract', () => {
    expect(() => parseLessonPayload({ ...lessonPayloadJson(), exercises: [{ id: 'x' }] })).toThrow(InvalidServerResponseError);
    expect(() => parseLessonPayload(null)).toThrow(InvalidServerResponseError);
  });

  it('starts a lesson and saves the cursor', async () => {
    const client = fakeClient({}, { start_lesson: { data: runJson() }, save_lesson_cursor: { data: null } });
    expect(await startLesson(client, 'lesson-1', 'path-1')).toMatchObject({ runId: 'run-1', status: 'in_progress', queue: ['e1', 'e2', 'e3', 'e4'] });
    await saveLessonCursor(client, 'run-1', 4);
    expect(client.rpcCalls[1]).toEqual(['save_lesson_cursor', { p_run_id: 'run-1', p_cursor: 4 }]);
  });

  it('submits every parameter and maps the graded result', async () => {
    const client = fakeClient(
      {},
      {
        submit_exercise: {
          data: {
            attempt_id: 'a1',
            attempt_no: 1,
            verdict: 'almost',
            is_correct: true,
            score: '0.80',
            error_tags: ['typo'],
            feedback_vi: null,
            revealed: false,
            display_answer: 'I am a teacher',
            explanation: { vi: 'Vì…' },
            requeued: false,
            replayed: false,
          },
        },
      },
    );
    const result = await submitExercise(client, {
      runId: 'run-1',
      exerciseId: 'e1',
      exerciseVersion: 3,
      idempotencyKey: uuid(1),
      response: { text: 'I am a teachr' },
      confidence: 2,
      responseMs: 1200,
      hintCount: 0,
      clientAt: '2026-10-13T10:00:00.000Z',
    });
    expect(client.rpcCalls[0]).toEqual([
      'submit_exercise',
      {
        p_run_id: 'run-1',
        p_exercise_id: 'e1',
        p_exercise_version: 3,
        p_idempotency_key: uuid(1),
        p_response: { text: 'I am a teachr' },
        p_confidence: 2,
        p_response_ms: 1200,
        p_hint_count: 0,
        p_client_at: '2026-10-13T10:00:00.000Z',
      },
    ]);
    expect(result).toEqual({
      attemptId: 'a1',
      attemptNo: 1,
      verdict: 'almost',
      isCorrect: true,
      score: 0.8,
      revealed: false,
      requeued: false,
      replayed: false,
      feedback: { feedbackVi: null, errorTags: ['typo'], displayAnswer: 'I am a teacher', explanation: { vi: 'Vì…' } },
    });
  });

  it('completes a lesson, accepting the summary under either key', async () => {
    const summary = { accuracy_by_stage: { recognition: 1, recall: 0.5, application: null }, almost_count: 1, confident_wrong: 0, unsure_right: 2 };
    for (const data of [
      { run_id: 'run-1', next_review_at: '2026-10-14T00:00:00+07:00', summary },
      { run_id: 'run-1', next_review_at: '2026-10-14T00:00:00+07:00', summary_json: summary },
    ]) {
      const client = fakeClient({}, { complete_lesson: { data } });
      expect(await completeLesson(client, 'run-1')).toEqual({
        runId: 'run-1',
        nextReviewAt: '2026-10-14T00:00:00+07:00',
        completedAt: null,
        summary: { accuracyByStage: { recognition: 1, recall: 0.5, application: null }, almostCount: 1, confidentWrong: 0, unsureRight: 2 },
      });
    }
  });

  it('lists path lessons', async () => {
    const row = {
      lesson_id: 'lesson-1',
      unit: { id: 'u1', title: { vi: 'Chào hỏi' }, order_index: 1 },
      program: { id: 'p1', title: { vi: 'Nền tảng' } },
      title: { vi: 'Xin chào!' },
      level_code: 'pre_a1',
      estimated_minutes: 10,
      is_demo: true,
      prerequisites_met: false,
      run_status: 'in_progress',
      prerequisites: [{ lesson_id: 'lesson-0', title: { vi: 'Bảng chữ cái' } }],
    };
    const client = fakeClient({}, { path_lessons: { data: [row] } });
    expect(await listPathLessons(client, 'path-1')).toEqual([
      {
        lessonId: 'lesson-1',
        unit: { id: 'u1', title: { vi: 'Chào hỏi' }, orderIndex: 1 },
        program: { id: 'p1', title: { vi: 'Nền tảng' }, orderIndex: null },
        title: { vi: 'Xin chào!' },
        levelCode: 'pre_a1',
        estimatedMinutes: 10,
        isDemo: true,
        prerequisitesMet: false,
        runStatus: 'in_progress',
        prerequisites: [{ lessonId: 'lesson-0', title: { vi: 'Bảng chữ cái' } }],
      },
    ]);
    expect(client.rpcCalls[0]).toEqual(['path_lessons', { p_path_id: 'path-1' }]);
    expect(await listPathLessons(fakeClient({}, { path_lessons: { data: null } }), 'path-1')).toEqual([]);
  });

  it('turns transport failures into NetworkError and rethrows database errors as-is', async () => {
    // supabase-js resolves fetch failures with an empty code instead of rejecting.
    const offline = fakeClient({}, { get_lesson: { data: null, error: { code: '', message: 'TypeError: Failed to fetch' } } });
    await expect(getLesson(offline, 'l', 'p')).rejects.toBeInstanceOf(NetworkError);
    await expect(getLesson(rejectingClient(new TypeError('Failed to fetch')), 'l', 'p')).rejects.toBeInstanceOf(NetworkError);
    const denied = fakeClient({}, { get_lesson: { data: null, error: { code: 'P0001', message: 'lesson_not_in_path' } } });
    await expect(getLesson(denied, 'l', 'p')).rejects.toMatchObject({ code: 'P0001', message: 'lesson_not_in_path' });
  });
});

describe('lessonErrorMessage', () => {
  it('maps every RPC code in Vietnamese', () => {
    const codes = [
      'not_authenticated',
      'lesson_not_found',
      'path_not_found',
      'lesson_not_in_path',
      'run_not_found',
      'run_not_active',
      'exercise_not_in_lesson',
      'exercise_version_mismatch',
      'invalid_response',
      'rate_limited',
      'idempotency_conflict',
      'attempts_incomplete',
    ];
    for (const code of codes) {
      const message = lessonErrorMessage({ code: 'P0001', message: code });
      expect(message, code).not.toMatch(/mã:|Đã có lỗi/);
    }
    expect(lessonErrorMessage({ code: 'P0001', message: 'attempts_incomplete' })).toBe('Còn bài tập chưa hoàn thành trong bài học.');
  });

  it('maps network, contract and unknown errors', () => {
    expect(lessonErrorMessage(new NetworkError())).toBe('Không kết nối được máy chủ. Kiểm tra mạng và thử lại.');
    expect(lessonErrorMessage(new TypeError('Failed to fetch'))).toBe('Không kết nối được máy chủ. Kiểm tra mạng và thử lại.');
    expect(lessonErrorCode(new InvalidServerResponseError('get_lesson'))).toBe('invalid_server_response');
    expect(lessonErrorMessage(new Error('lesson_unavailable_offline'))).toBe('Bạn đang ngoại tuyến và bài học này chưa được lưu trên máy.');
    expect(lessonErrorMessage({ code: '42501', message: 'permission denied' })).toBe('Đã có lỗi xảy ra (mã: 42501). Vui lòng thử lại.');
    expect(lessonErrorMessage('boom')).toBe('Đã có lỗi xảy ra. Vui lòng thử lại.');
  });
});
