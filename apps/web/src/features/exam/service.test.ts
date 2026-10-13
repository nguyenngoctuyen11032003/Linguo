import { describe, expect, it } from 'vitest';
import { fakeClient } from '../../../tests/unit/fake-supabase';
import {
  ATTEMPT_ID,
  PATH_ID,
  TOPIK_I_FORM_ID,
  TOPIK_II_FORM_ID,
  examAttempt,
  examHistory as historyFixture,
  examQuestionId,
  examResult,
  topikIForm,
  topikIIForm,
} from './exam-fixtures';
import { examHistory, getExamAttempt, listExamForms, saveExamAnswer, startExam, submitExam } from './service';

const KEY = 'f0000000-0000-4000-8000-000000000001';

describe('exam service', () => {
  it('lists the forms of a language', async () => {
    const client = fakeClient({}, { list_exam_forms: { data: [topikIForm(), topikIIForm()] } });
    expect(await listExamForms(client, 'ko')).toEqual([topikIForm(), topikIIForm()]);
    expect(client.rpcCalls).toEqual([['list_exam_forms', { p_language: 'ko' }]]);
  });

  it('treats a null form list as empty', async () => {
    const client = fakeClient({}, { list_exam_forms: { data: null } });
    expect(await listExamForms(client, 'en')).toEqual([]);
  });

  it('starts a full mock, a section or a question-type drill', async () => {
    const client = fakeClient({}, { start_exam: { data: examAttempt() } });
    expect(await startExam(client, { pathId: PATH_ID, formId: TOPIK_II_FORM_ID, mode: 'full' })).toEqual(examAttempt());
    await startExam(client, { pathId: PATH_ID, formId: TOPIK_I_FORM_ID, mode: 'section', section: 'reading' });
    await startExam(client, { pathId: PATH_ID, formId: TOPIK_I_FORM_ID, mode: 'question_type', questionType: 'topik_i_read_topic' });
    expect(client.rpcCalls).toEqual([
      ['start_exam', { p_path_id: PATH_ID, p_form_id: TOPIK_II_FORM_ID, p_mode: 'full', p_section: null, p_question_type: null }],
      ['start_exam', { p_path_id: PATH_ID, p_form_id: TOPIK_I_FORM_ID, p_mode: 'section', p_section: 'reading', p_question_type: null }],
      [
        'start_exam',
        { p_path_id: PATH_ID, p_form_id: TOPIK_I_FORM_ID, p_mode: 'question_type', p_section: null, p_question_type: 'topik_i_read_topic' },
      ],
    ]);
  });

  it('gets an in-progress attempt', async () => {
    const client = fakeClient({}, { get_exam_attempt: { data: examAttempt() } });
    expect(await getExamAttempt(client, ATTEMPT_ID)).toEqual({ kind: 'attempt', attempt: examAttempt() });
    expect(client.rpcCalls).toEqual([['get_exam_attempt', { p_attempt_id: ATTEMPT_ID }]]);
  });

  it('gets the result of a closed attempt', async () => {
    const expired = examResult({ status: 'expired' });
    const client = fakeClient({}, { get_exam_attempt: { data: expired } });
    expect(await getExamAttempt(client, ATTEMPT_ID)).toEqual({ kind: 'result', result: expired });
  });

  it('saves an answer with its idempotency key', async () => {
    const saved = { saved: true, status: 'in_progress', server_now: '2026-10-13T02:11:00.000Z', replayed: false };
    const client = fakeClient({}, { save_exam_answer: { data: saved } });
    const args = { attemptId: ATTEMPT_ID, questionId: examQuestionId(2), answer: 'b', flagged: true, idempotencyKey: KEY };
    expect(await saveExamAnswer(client, args)).toEqual(saved);
    await saveExamAnswer(client, { ...args, answer: null, flagged: false });
    expect(client.rpcCalls).toEqual([
      ['save_exam_answer', { p_attempt_id: ATTEMPT_ID, p_question_id: examQuestionId(2), p_answer: 'b', p_flagged: true, p_idempotency_key: KEY }],
      ['save_exam_answer', { p_attempt_id: ATTEMPT_ID, p_question_id: examQuestionId(2), p_answer: null, p_flagged: false, p_idempotency_key: KEY }],
    ]);
  });

  it('submits', async () => {
    const client = fakeClient({}, { submit_exam: { data: examResult() } });
    expect(await submitExam(client, ATTEMPT_ID)).toEqual(examResult());
    expect(client.rpcCalls).toEqual([['submit_exam', { p_attempt_id: ATTEMPT_ID }]]);
  });

  it('reads the history with a default limit', async () => {
    const client = fakeClient({}, { exam_history: { data: historyFixture() } });
    expect(await examHistory(client, PATH_ID)).toEqual(historyFixture());
    await examHistory(client, PATH_ID, 3);
    expect(client.rpcCalls).toEqual([
      ['exam_history', { p_path_id: PATH_ID, p_limit: 10 }],
      ['exam_history', { p_path_id: PATH_ID, p_limit: 3 }],
    ]);
  });

  it('rethrows the supabase error', async () => {
    const error = { message: 'attempt_closed', code: 'P0001' };
    const client = fakeClient({}, { submit_exam: { data: null, error } });
    await expect(submitExam(client, ATTEMPT_ID)).rejects.toBe(error);
  });

  it('throws invalid_payload when the response does not match the contract', async () => {
    const leaky = { ...examAttempt(), questions: [{ question_id: 'x' }] };
    const client = fakeClient(
      {},
      { get_exam_attempt: { data: leaky }, submit_exam: { data: { attempt_id: ATTEMPT_ID } }, list_exam_forms: { data: [{}] } },
    );
    await expect(getExamAttempt(client, ATTEMPT_ID)).rejects.toThrow('invalid_payload');
    await expect(submitExam(client, ATTEMPT_ID)).rejects.toThrow('invalid_payload');
    await expect(listExamForms(client, 'ko')).rejects.toThrow('invalid_payload');
  });
});
