import {
  learnerAssignmentListSchema,
  learnerClassListSchema,
  learnerJoinResultSchema,
  leftClassSchema,
  normalizeInviteCode,
  type LearnerAssignment,
  type LearnerClass,
  type LearnerJoinResult,
} from '@linguo/shared';
import { callRpc, parse } from '@/features/lesson-player/service';
import type { AppSupabaseClient } from '@/lib/supabase';

// Learner side of the teacher tools (PRD P2 "Lớp học"). Same transport as the other RPC services: jsonb validated
// with the shared zod contracts, abandoned after 15 s. RPCs: supabase/migrations/20261017000400_teacher_tools.sql.

/** The caller's classes that are not archived, oldest membership first. */
export async function fetchLearnerClasses(client: AppSupabaseClient): Promise<LearnerClass[]> {
  return parse(learnerClassListSchema, (await callRpc(client, 'learner_list_classes', {})) ?? []);
}

/** Assignments of the caller's active classes (open ones first, by due date; then done ones). */
export async function fetchLearnerAssignments(client: AppSupabaseClient, classId?: string): Promise<LearnerAssignment[]> {
  const args = classId ? { p_class_id: classId } : {};
  return parse(learnerAssignmentListSchema, (await callRpc(client, 'learner_list_assignments', args)) ?? []);
}

/**
 * Join with an invite code. An unknown, expired, revoked or used-up code resolves to {status: 'invalid_code'};
 * rate_limited, own_class, class_full and join_limit reject like any RPC error.
 */
export async function joinClass(client: AppSupabaseClient, code: string): Promise<LearnerJoinResult> {
  return parse(learnerJoinResultSchema, await callRpc(client, 'learner_join_class', { p_code: normalizeInviteCode(code) }));
}

/** Leave a class: the membership row is deleted, so the teacher stops seeing the learner at once. */
export async function leaveClass(client: AppSupabaseClient, classId: string): Promise<void> {
  parse(leftClassSchema, await callRpc(client, 'learner_leave_class', { p_class_id: classId }));
}
