// Teacher tools (PRD P2 "Công cụ giáo viên"). These limits are enforced by the SQL in
// supabase/migrations/20261017000400_teacher_tools.sql; keep both in sync
// (supabase/tests/teacher.test.sql exercises the SQL side).

export const TEACHER_LIMITS = {
  /** Active (not archived) classes per teacher. */
  maxActiveClasses: 30,
  /** Members per class. */
  maxMembersPerClass: 200,
  /** Classes a learner can belong to. */
  maxClassesPerLearner: 20,
  /** Active invites per class (not revoked, not expired, not used up). */
  maxActiveInvitesPerClass: 10,
  /** Assignments per class. */
  maxAssignmentsPerClass: 300,
  /** learner_join_class calls per learner per rolling hour, failed ones included. */
  maxJoinAttemptsPerHour: 10,
  /** Invite lifetime in hours: 1..720 (30 days), default 7 days. */
  inviteMinHours: 1,
  inviteMaxHours: 720,
  inviteDefaultHours: 168,
  /** Optional cap on an invite's uses. */
  inviteMaxUses: 500,
  /** Graded reviews a review assignment may ask for. */
  reviewTargetMax: 200,
  /** Latest due date, in days from now. */
  dueMaxDays: 366,
  /** Field lengths, in characters after cleaning. */
  className: 60,
  note: 500,
  /** Invite codes: 8 characters without 0/O/1/I/L. */
  codeLength: 8,
} as const;

export type TeacherLimits = typeof TEACHER_LIMITS;
