import {
  completeResultSchema,
  lessonPayloadSchema,
  lessonRunSchema,
  pathLessonSchema,
  submitResultSchema,
  type CompleteResult,
  type LessonPayload,
  type LessonRun,
  type PathLesson,
  type SubmitArgs,
  type SubmitResult,
} from '@linguo/shared';
import type { z } from 'zod';
import type { AppSupabaseClient } from '@/lib/supabase';

// Spec 2 §6.3. The lesson RPCs return jsonb validated here with the shared contracts.

/** The generated Database types may not list the spec 2 RPCs yet; the zod contracts are the source of truth. */
interface UntypedRpcClient {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
}

async function callRpc(client: AppSupabaseClient, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await (client as unknown as UntypedRpcClient).rpc(fn, args);
  if (error) throw error;
  return data;
}

function parse<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error('invalid_payload');
  return parsed.data;
}

export async function fetchPathLessons(client: AppSupabaseClient, pathId: string): Promise<PathLesson[]> {
  const data = await callRpc(client, 'path_lessons', { p_path_id: pathId });
  return parse(pathLessonSchema.array(), data ?? []);
}

export async function getLesson(client: AppSupabaseClient, lessonId: string, pathId: string): Promise<LessonPayload> {
  return parse(lessonPayloadSchema, await callRpc(client, 'get_lesson', { p_lesson_id: lessonId, p_path_id: pathId }));
}

export async function startLesson(client: AppSupabaseClient, lessonId: string, pathId: string): Promise<LessonRun> {
  return parse(lessonRunSchema, await callRpc(client, 'start_lesson', { p_lesson_id: lessonId, p_path_id: pathId }));
}

export async function saveCursor(client: AppSupabaseClient, runId: string, cursor: number): Promise<void> {
  await callRpc(client, 'save_lesson_cursor', { p_run_id: runId, p_cursor: cursor });
}

export async function submitExercise(client: AppSupabaseClient, args: SubmitArgs): Promise<SubmitResult> {
  return parse(submitResultSchema, await callRpc(client, 'submit_exercise', args));
}

export async function completeLesson(client: AppSupabaseClient, runId: string): Promise<CompleteResult> {
  return parse(completeResultSchema, await callRpc(client, 'complete_lesson', { p_run_id: runId }));
}
