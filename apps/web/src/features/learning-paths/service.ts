import {
  fromEstimateRecord,
  type CreatePathInput,
  type Database,
  type EstimateResult,
  type GoalType,
  type LanguageCode,
  type PathStatus,
  type ReferenceHours,
  type StartPoint,
  type UpdatePlanInput,
} from '@linguo/shared';
import type { AppSupabaseClient } from '@/lib/supabase';

type PathRow = Database['public']['Tables']['learning_paths']['Row'];

export interface LearningPath {
  id: string;
  language: LanguageCode;
  startPoint: StartPoint;
  goalType: GoalType;
  currentLevel: string;
  targetLevel: string;
  weeklyMinutes: number[];
  targetDate: string | null;
  status: PathStatus;
  estimate: EstimateResult;
  createdAt: string;
  updatedAt: string;
}

export type ReferenceHoursByLanguage = Record<LanguageCode, ReferenceHours[]>;

export function toLearningPath(row: PathRow): LearningPath {
  return {
    id: row.id,
    language: row.language_code as LanguageCode,
    startPoint: row.start_point as StartPoint,
    goalType: row.goal_type as GoalType,
    currentLevel: row.current_level,
    targetLevel: row.target_level,
    weeklyMinutes: row.weekly_minutes,
    targetDate: row.target_date,
    status: row.status as PathStatus,
    estimate: fromEstimateRecord(row.estimate),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listPaths(client: AppSupabaseClient): Promise<LearningPath[]> {
  const { data, error } = await client.from('learning_paths').select('*').neq('status', 'archived').order('created_at').order('id');
  if (error) throw error;
  return (data ?? []).map(toLearningPath);
}

export async function fetchCurrentPathId(client: AppSupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await client.from('profiles').select('current_learning_path_id').eq('id', userId).single();
  if (error) throw error;
  return data.current_learning_path_id;
}

export async function listReferenceHours(client: AppSupabaseClient): Promise<ReferenceHoursByLanguage> {
  const { data, error } = await client
    .from('level_reference_hours')
    .select('language_code, level_code, ordinal, cumulative_hours, reviewed')
    .order('ordinal');
  if (error) throw error;
  const grouped: ReferenceHoursByLanguage = { en: [], ko: [], ja: [] };
  for (const row of data ?? []) {
    const bucket = (grouped as Partial<ReferenceHoursByLanguage>)[row.language_code as LanguageCode];
    if (!bucket) continue; // unknown language code: skip rather than crash
    bucket.push({
      levelCode: row.level_code,
      ordinal: row.ordinal,
      cumulativeHours: row.cumulative_hours,
      reviewed: row.reviewed,
    });
  }
  return grouped;
}

export async function createPath(client: AppSupabaseClient, input: CreatePathInput): Promise<LearningPath> {
  const { data, error } = await client.rpc('create_learning_path', {
    p_language: input.language,
    p_start_point: input.startPoint,
    p_goal_type: input.goalType,
    p_current_level: input.currentLevel,
    p_target_level: input.targetLevel,
    p_weekly_minutes: input.weeklyMinutes,
    ...(input.targetDate ? { p_target_date: input.targetDate } : {}),
  });
  if (error) throw error;
  return toLearningPath(data as PathRow);
}

export async function setCurrentPath(client: AppSupabaseClient, id: string): Promise<void> {
  const { error } = await client.rpc('set_current_learning_path', { p_id: id });
  if (error) throw error;
}

/** Full replace, not a patch: a null/omitted `targetDate` clears the deadline. */
export async function updatePlan(
  client: AppSupabaseClient,
  id: string,
  input: Pick<UpdatePlanInput, 'goalType' | 'targetLevel' | 'weeklyMinutes' | 'targetDate'>,
): Promise<LearningPath> {
  const { data, error } = await client.rpc('update_learning_path_plan', {
    p_id: id,
    p_goal_type: input.goalType,
    p_target_level: input.targetLevel,
    p_weekly_minutes: input.weeklyMinutes,
    ...(input.targetDate != null ? { p_target_date: input.targetDate } : {}),
  });
  if (error) throw error;
  return toLearningPath(data as PathRow);
}

export async function setPathStatus(client: AppSupabaseClient, id: string, status: PathStatus): Promise<LearningPath> {
  const { data, error } = await client.rpc('set_learning_path_status', { p_id: id, p_status: status });
  if (error) throw error;
  return toLearningPath(data as PathRow);
}
