import {
  examAttemptSchema,
  examFormSummarySchema,
  examHistoryEntrySchema,
  examResultSchema,
  examSaveResultSchema,
  type ExamAttempt,
  type ExamFormSummary,
  type ExamHistoryEntry,
  type ExamMode,
  type ExamResult,
  type ExamSection,
  type LanguageCode,
} from '@linguo/shared';
import type { z } from 'zod';
import { callRpc, LESSON_RPC_TIMEOUT_MS, parse } from '@/features/lesson-player/service';
import type { AppSupabaseClient } from '@/lib/supabase';

// Spec 9 §3–4. Same transport as the lesson, review and diagnostic RPCs: jsonb validated with the shared zod
// contracts, abandoned after 15 s (an AbortError with status 0, which callers treat like a network failure).
// Grading happens on the server only; served questions never carry answers, scripts or rubrics.

export const EXAM_RPC_TIMEOUT_MS = LESSON_RPC_TIMEOUT_MS;

export type ExamSaveResult = z.infer<typeof examSaveResultSchema>;

export type ExamAttemptState = { kind: 'attempt'; attempt: ExamAttempt } | { kind: 'result'; result: ExamResult };

export interface StartExamArgs {
  pathId: string;
  formId: string;
  mode: ExamMode;
  section?: ExamSection | null;
  questionType?: string | null;
}

export interface SaveExamAnswerArgs {
  attemptId: string;
  questionId: string;
  answer: string | null;
  flagged: boolean;
  idempotencyKey: string;
}

export async function listExamForms(client: AppSupabaseClient, language: LanguageCode): Promise<ExamFormSummary[]> {
  const data = await callRpc(client, 'list_exam_forms', { p_language: language });
  return parse(examFormSummarySchema.array(), data ?? []);
}

/** Starts a new attempt; the server closes any other in-progress attempt of the path as expired. */
export async function startExam(client: AppSupabaseClient, a: StartExamArgs): Promise<ExamAttempt> {
  const data = await callRpc(client, 'start_exam', {
    p_path_id: a.pathId,
    p_form_id: a.formId,
    p_mode: a.mode,
    p_section: a.section ?? null,
    p_question_type: a.questionType ?? null,
  });
  return parse(examAttemptSchema, data);
}

/** An in-progress attempt (with saved answers), or the result once submitted / expired. */
export async function getExamAttempt(client: AppSupabaseClient, attemptId: string): Promise<ExamAttemptState> {
  const data = await callRpc(client, 'get_exam_attempt', { p_attempt_id: attemptId });
  if (data && typeof data === 'object' && 'questions' in data) {
    return { kind: 'attempt', attempt: parse(examAttemptSchema, data) };
  }
  return { kind: 'result', result: parse(examResultSchema, data) };
}

/** Idempotent upsert of one answer: a resend under the same key is replayed (`replayed: true`). */
export async function saveExamAnswer(client: AppSupabaseClient, a: SaveExamAnswerArgs): Promise<ExamSaveResult> {
  const data = await callRpc(client, 'save_exam_answer', {
    p_attempt_id: a.attemptId,
    p_question_id: a.questionId,
    p_answer: a.answer,
    p_flagged: a.flagged,
    p_idempotency_key: a.idempotencyKey,
  });
  return parse(examSaveResultSchema, data);
}

/** Grades the attempt; calling it again returns the stored result. */
export async function submitExam(client: AppSupabaseClient, attemptId: string): Promise<ExamResult> {
  return parse(examResultSchema, await callRpc(client, 'submit_exam', { p_attempt_id: attemptId }));
}

/** Newest first. */
export async function examHistory(client: AppSupabaseClient, pathId: string, limit = 10): Promise<ExamHistoryEntry[]> {
  const data = await callRpc(client, 'exam_history', { p_path_id: pathId, p_limit: limit });
  return parse(examHistoryEntrySchema.array(), data ?? []);
}
