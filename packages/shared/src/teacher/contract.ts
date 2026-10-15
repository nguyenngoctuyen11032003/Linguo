import { z } from 'zod';
import { TEACHER_LIMITS as L } from './limits';

// Teacher tools RPCs (PRD P2): JSON exchanged with grant_teacher_role, is_teacher, teacher_* and learner_* in
// supabase/migrations/20261017000400_teacher_tools.sql. snake_case mirrors the SQL jsonb exactly.
// Teachers only ever receive aggregates about members, never answers, AI conversations or personal vocabulary.

export const CLASS_LANGUAGES = ['en', 'ko', 'ja'] as const;
export type ClassLanguage = (typeof CLASS_LANGUAGES)[number];

export const ASSIGNMENT_KINDS = ['lesson', 'review', 'exam'] as const;
export type AssignmentKind = (typeof ASSIGNMENT_KINDS)[number];

export const ASSIGNMENT_STATES = ['pending', 'overdue', 'done'] as const;
export type AssignmentState = (typeof ASSIGNMENT_STATES)[number];

/** Every message raised by the teacher RPCs (42501 not_authenticated, the rest P0001). */
export const TEACHER_ERROR_CODES = [
  'not_authenticated',
  'teacher_forbidden',
  'staff_forbidden',
  'user_not_found',
  'class_not_found',
  'class_archived',
  'invalid_name',
  'name_taken',
  'invalid_language',
  'class_limit',
  'invite_limit',
  'invite_not_found',
  'invalid_expiry',
  'invalid_max_uses',
  'member_not_found',
  'invalid_kind',
  'invalid_ref',
  'invalid_target',
  'invalid_due',
  'note_too_long',
  'assignment_limit',
  'assignment_not_found',
  'own_class',
  'class_full',
  'join_limit',
  'rate_limited',
  'not_member',
] as const;
export type TeacherErrorCode = (typeof TEACHER_ERROR_CODES)[number];

export function isTeacherErrorCode(value: unknown): value is TeacherErrorCode {
  return typeof value === 'string' && (TEACHER_ERROR_CODES as readonly string[]).includes(value);
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${L.codeLength}}$`);

/** Same normalisation as public.teacher_normalize_code: upper case, spaces and dashes removed. */
export function normalizeInviteCode(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

/** Whether a (normalised) code has the shape of an invite code. */
export function isInviteCodeShape(value: string): boolean {
  return CODE_PATTERN.test(normalizeInviteCode(value));
}

/** "ABCD-EFGH" for display; the server accepts it with or without the dash. */
export function formatInviteCode(code: string): string {
  const c = normalizeInviteCode(code);
  return c.length === L.codeLength ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

/** Input for learner_join_class (normalised; the server normalises again). */
export const inviteCodeInputSchema = z
  .string()
  .transform(normalizeInviteCode)
  .pipe(z.string().regex(CODE_PATTERN));

/** Class name as typed (the server cleans it like personal list names). */
export const classNameSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(1).max(L.className));

export const assignmentNoteSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, ' ').trim())
  .pipe(z.string().max(L.note))
  .transform((value) => (value === '' ? null : value));

/** Arguments of teacher_create_assignment (p_ prefixes added by the caller). */
export const createAssignmentInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('lesson'),
    ref_id: z.uuid(),
    due_at: z.string().nullable().optional(),
    note: z.string().max(L.note).nullable().optional(),
  }),
  z.object({
    kind: z.literal('exam'),
    ref_id: z.uuid(),
    due_at: z.string().nullable().optional(),
    note: z.string().max(L.note).nullable().optional(),
  }),
  z.object({
    kind: z.literal('review'),
    target_count: z.number().int().min(1).max(L.reviewTargetMax),
    due_at: z.string().nullable().optional(),
    note: z.string().max(L.note).nullable().optional(),
  }),
]);
export type CreateAssignmentInput = z.infer<typeof createAssignmentInputSchema>;

export const createInviteInputSchema = z.object({
  expires_hours: z.number().int().min(L.inviteMinHours).max(L.inviteMaxHours).default(L.inviteDefaultHours),
  max_uses: z.number().int().min(1).max(L.inviteMaxUses).nullable().default(null),
});
export type CreateInviteInput = z.infer<typeof createInviteInputSchema>;

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export const grantTeacherResultSchema = z.object({ user_id: z.uuid(), is_teacher: z.boolean() });

/** teacher_create_invite, and each entry of teacherClassSchema.invites (active invites only). */
export const teacherInviteSchema = z.object({
  code: z.string(),
  class_id: z.uuid(),
  expires_at: z.string(),
  max_uses: z.number().int().nullable(),
  uses: z.number().int().min(0),
  created_at: z.string(),
});
export type TeacherInvite = z.infer<typeof teacherInviteSchema>;

/** teacher_list_classes entries; also returned by teacher_create_class, teacher_rename_class, teacher_archive_class. */
export const teacherClassSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  language_code: z.enum(CLASS_LANGUAGES),
  archived_at: z.string().nullable(),
  created_at: z.string(),
  member_count: z.number().int().min(0),
  assignment_count: z.number().int().min(0),
  invites: z.array(teacherInviteSchema),
});
export type TeacherClass = z.infer<typeof teacherClassSchema>;

export const teacherClassListSchema = z.array(teacherClassSchema);

const assignmentBaseSchema = z.object({
  id: z.uuid(),
  class_id: z.uuid(),
  kind: z.enum(ASSIGNMENT_KINDS),
  /** Lesson id (lesson) or exam form id (exam); null for review. */
  ref_id: z.uuid().nullable(),
  /** Vietnamese title of the lesson / exam form; null for review. */
  title: z.string().nullable(),
  /** Graded reviews asked for (review only). */
  target_count: z.number().int().nullable(),
  due_at: z.string().nullable(),
  note: z.string().nullable(),
  created_at: z.string(),
});

/** teacher_create_assignment and teacherRosterSchema.assignments. */
export const teacherAssignmentSchema = assignmentBaseSchema.extend({
  completed_count: z.number().int().min(0),
  member_count: z.number().int().min(0),
});
export type TeacherAssignment = z.infer<typeof teacherAssignmentSchema>;

/** One member as a teacher sees them: identity plus aggregates only. */
export const teacherRosterMemberSchema = z.object({
  user_id: z.uuid(),
  display_name: z.string().nullable(),
  joined_at: z.string(),
  /** False when the learner has no learning path in the class language (all stats are then 0/null). */
  has_path: z.boolean(),
  streak_current: z.number().int().min(0),
  streak_best: z.number().int().min(0),
  minutes_7d: z.number().int().min(0),
  minutes_30d: z.number().int().min(0),
  /** Learner-local date (YYYY-MM-DD) of the last active day, or null. */
  last_active_day: z.string().nullable(),
  lessons_completed: z.number().int().min(0),
  lessons_completed_7d: z.number().int().min(0),
  reviews_due: z.number().int().min(0),
  reviews_30d: z.number().int().min(0),
  /** Share of graded reviews not rated "again" over 30 days; null below 10 reviews. */
  review_accuracy_30d: z.number().min(0).max(1).nullable(),
  assignments_done: z.number().int().min(0),
  assignments_total: z.number().int().min(0),
});
export type TeacherRosterMember = z.infer<typeof teacherRosterMemberSchema>;

export const teacherRosterSchema = z.object({
  class: teacherClassSchema,
  members: z.array(teacherRosterMemberSchema),
  assignments: z.array(teacherAssignmentSchema),
});
export type TeacherRoster = z.infer<typeof teacherRosterSchema>;

export const revokedInviteSchema = z.object({ revoked: z.literal(true) });
export const removedMemberSchema = z.object({ removed: z.literal(true) });
export const deletedAssignmentSchema = z.object({ deleted: z.literal(true) });
export const leftClassSchema = z.object({ left: z.literal(true) });

/** learner_list_classes entries. */
export const learnerClassSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  language_code: z.enum(CLASS_LANGUAGES),
  teacher_name: z.string().nullable(),
  joined_at: z.string(),
  assignment_count: z.number().int().min(0),
  pending_count: z.number().int().min(0),
});
export type LearnerClass = z.infer<typeof learnerClassSchema>;

export const learnerClassListSchema = z.array(learnerClassSchema);

/** learner_join_class. An unknown, expired, revoked or used-up code is {status: 'invalid_code'}, not an error. */
export const learnerJoinResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('joined'), class: learnerClassSchema }),
  z.object({ status: z.literal('already_member'), class: learnerClassSchema }),
  z.object({ status: z.literal('invalid_code') }),
]);
export type LearnerJoinResult = z.infer<typeof learnerJoinResultSchema>;

/** learner_list_assignments entries. */
export const learnerAssignmentSchema = assignmentBaseSchema.extend({
  class_name: z.string(),
  state: z.enum(ASSIGNMENT_STATES),
  completed_at: z.string().nullable(),
  /** Reviews done so far (capped at target_count) for review; 0 or 1 otherwise. */
  progress_count: z.number().int().min(0),
});
export type LearnerAssignment = z.infer<typeof learnerAssignmentSchema>;

export const learnerAssignmentListSchema = z.array(learnerAssignmentSchema);
