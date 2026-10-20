import { describe, expect, it } from 'vitest';
import {
  createAssignmentInputSchema,
  createInviteInputSchema,
  ASSIGNMENT_STATES,
  updateAssignmentInputSchema,
  classNameSchema,
  assignmentNoteSchema,
  formatInviteCode,
  inviteCodeInputSchema,
  isInviteCodeShape,
  isTeacherErrorCode,
  learnerAssignmentSchema,
  learnerJoinResultSchema,
  normalizeInviteCode,
  teacherClassSchema,
  teacherRosterSchema,
  TEACHER_ERROR_CODES,
} from './contract';
import { TEACHER_LIMITS as L } from './limits';

const UUID = '6f1c2b8e-1d3a-4b4c-8d9e-0f1a2b3c4d5e';
const UUID2 = '7a1c2b8e-1d3a-4b4c-8d9e-0f1a2b3c4d5e';
const TS = '2026-10-17T08:00:00+00:00';

// The shared package has no Node types; load node:fs through a non-literal specifier, typed by hand.
const FS_MODULE: string = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS_MODULE)) as {
  readFileSync: (path: URL, encoding: 'utf8') => string;
};
const SQL = readFileSync(
  new URL('../../../../supabase/migrations/20261017000400_teacher_tools.sql', import.meta.url),
  'utf8',
);
// The second pass (exam mode, editing and closing assignments) raises invalid_exam_mode and restates the assignment limit.
const SQL2 = readFileSync(
  new URL('../../../../supabase/migrations/20261021000100_teacher_assignments.sql', import.meta.url),
  'utf8',
);

describe('limits and error codes stay in sync with the migration', () => {
  it('raises every error code and nothing else', () => {
    const raised = new Set([...(SQL + SQL2).matchAll(/message = '([a-z_]+)'/g)].map((m) => m[1]));
    // staff_forbidden comes from admin_private.require_role (grant_teacher_role).
    expect([...raised, 'staff_forbidden'].sort()).toEqual([...TEACHER_ERROR_CODES].sort());
  });
  it('enforces the same numbers', () => {
    expect(SQL).toContain(`>= ${L.maxActiveClasses} then`);
    expect(SQL).toContain(`>= ${L.maxMembersPerClass} then`);
    expect(SQL).toContain(`>= ${L.maxClassesPerLearner} then`);
    expect(SQL).toContain(`>= ${L.maxActiveInvitesPerClass} then`);
    expect(SQL).toContain(`>= ${L.maxAssignmentsPerClass} then`);
    expect(SQL).toContain(`interval '1 hour') >= ${L.maxJoinAttemptsPerHour} then`);
    expect(SQL).toContain(`not between ${L.inviteMinHours} and ${L.inviteMaxHours}`);
    expect(SQL).toContain(`p_expires_hours integer default ${L.inviteDefaultHours}`);
    expect(SQL).toContain(`not between 1 and ${L.inviteMaxUses}`);
    expect(SQL).toContain(`not between 1 and ${L.reviewTargetMax}`);
    expect(SQL).toContain(`interval '${L.dueMaxDays} days'`);
    expect(SQL).toContain(`char_length(name) between 1 and ${L.className}`);
    expect(SQL).toContain(`char_length(v_note) > ${L.note}`);
    expect(SQL).toContain(`{${L.codeLength}}$`);
  });
});

describe('invite codes', () => {
  it('normalises, validates and formats', () => {
    expect(normalizeInviteCode(' abcd-efgh ')).toBe('ABCDEFGH');
    expect(isInviteCodeShape('abcd-efgh')).toBe(true);
    expect(isInviteCodeShape('ABCD EFG2')).toBe(true);
    // 0, O, 1, I and L are never generated.
    expect(isInviteCodeShape('ABCDEFG0')).toBe(false);
    expect(isInviteCodeShape('ABCDEFGO')).toBe(false);
    expect(isInviteCodeShape('ABCDEFGI')).toBe(false);
    expect(isInviteCodeShape('ABCDEFG')).toBe(false);
    expect(formatInviteCode('abcdefgh')).toBe('ABCD-EFGH');
    expect(formatInviteCode('abc')).toBe('ABC');
    expect(inviteCodeInputSchema.parse('wxyz-2345')).toBe('WXYZ2345');
    expect(inviteCodeInputSchema.safeParse('short').success).toBe(false);
  });
});

describe('inputs', () => {
  it('cleans and bounds class names and notes', () => {
    expect(classNameSchema.parse('  Lớp   10A ')).toBe('Lớp 10A');
    expect(classNameSchema.safeParse('   ').success).toBe(false);
    expect(classNameSchema.safeParse('x'.repeat(L.className + 1)).success).toBe(false);
    expect(assignmentNoteSchema.parse('   ')).toBeNull();
    expect(assignmentNoteSchema.parse(' làm  trước thứ Sáu ')).toBe('làm trước thứ Sáu');
    expect(assignmentNoteSchema.safeParse('x'.repeat(L.note + 1)).success).toBe(false);
  });
  it('requires a ref for lesson/exam and a target for review', () => {
    expect(createAssignmentInputSchema.safeParse({ kind: 'lesson', ref_id: UUID }).success).toBe(true);
    expect(createAssignmentInputSchema.safeParse({ kind: 'exam', ref_id: UUID, due_at: TS, note: 'x' }).success).toBe(true);
    expect(createAssignmentInputSchema.safeParse({ kind: 'lesson' }).success).toBe(false);
    expect(createAssignmentInputSchema.safeParse({ kind: 'review', target_count: 20 }).success).toBe(true);
    expect(createAssignmentInputSchema.safeParse({ kind: 'review', target_count: 0 }).success).toBe(false);
    expect(createAssignmentInputSchema.safeParse({ kind: 'review', target_count: L.reviewTargetMax + 1 }).success).toBe(false);
    expect(createAssignmentInputSchema.safeParse({ kind: 'vocab', ref_id: UUID }).success).toBe(false);
  });
  it('takes an exam mode only on exams, with a section only in section mode', () => {
    expect(createAssignmentInputSchema.safeParse({ kind: 'exam', ref_id: UUID, exam_mode: 'full' }).success).toBe(true);
    expect(createAssignmentInputSchema.safeParse({ kind: 'exam', ref_id: UUID, exam_mode: 'section', exam_section: 'reading' }).success).toBe(true);
    expect(createAssignmentInputSchema.safeParse({ kind: 'exam', ref_id: UUID, exam_mode: null, exam_section: null }).success).toBe(true);
    expect(createAssignmentInputSchema.safeParse({ kind: 'exam', ref_id: UUID, exam_mode: 'question_type' }).success).toBe(false);
    expect(createAssignmentInputSchema.safeParse({ kind: 'exam', ref_id: UUID, exam_mode: 'section', exam_section: 'speaking' }).success).toBe(false);
    // Unknown keys are dropped for the other kinds, so an exam mode never reaches a lesson assignment.
    const lesson = createAssignmentInputSchema.parse({ kind: 'lesson', ref_id: UUID, exam_mode: 'full' });
    expect('exam_mode' in lesson).toBe(false);
  });
  it('updates an assignment: the note always, the due date only on request', () => {
    expect(updateAssignmentInputSchema.parse({ note: null, closed: false })).toEqual({ note: null, closed: false, set_due: false, due_at: null });
    expect(updateAssignmentInputSchema.parse({ note: 'x', closed: true, set_due: true, due_at: TS })).toEqual({
      note: 'x', closed: true, set_due: true, due_at: TS,
    });
    expect(updateAssignmentInputSchema.safeParse({ note: 'x'.repeat(L.note + 1), closed: false }).success).toBe(false);
    expect(updateAssignmentInputSchema.safeParse({ note: null }).success).toBe(false);
  });
  it('defaults invite options like the RPC', () => {
    expect(createInviteInputSchema.parse({})).toEqual({ expires_hours: L.inviteDefaultHours, max_uses: null });
    expect(createInviteInputSchema.safeParse({ expires_hours: L.inviteMaxHours + 1 }).success).toBe(false);
    expect(createInviteInputSchema.safeParse({ max_uses: 0 }).success).toBe(false);
  });
});

describe('results', () => {
  const cls = {
    id: UUID, name: 'Lớp A', language_code: 'ja', archived_at: null, created_at: TS, member_count: 2,
    assignment_count: 1,
    invites: [{ code: 'ABCDEFGH', class_id: UUID, expires_at: TS, max_uses: null, uses: 0, created_at: TS }],
  };
  it('parses a teacher class and a roster', () => {
    expect(teacherClassSchema.parse(cls).language_code).toBe('ja');
    const roster = teacherRosterSchema.parse({
      class: cls,
      members: [{
        user_id: UUID2, display_name: null, joined_at: TS, has_path: true, streak_current: 3, streak_best: 5,
        minutes_7d: 40, minutes_30d: 90, last_active_day: '2026-10-16', lessons_completed: 4, lessons_completed_7d: 1,
        reviews_due: 7, reviews_30d: 12, review_accuracy_30d: 0.8333, assignments_done: 1, assignments_total: 1,
      }],
      assignments: [{
        id: UUID, class_id: UUID, kind: 'review', ref_id: null, title: null, target_count: 20, due_at: null,
        note: null, created_at: TS, completed_count: 1, member_count: 2,
      }],
    });
    expect(roster.members[0]?.review_accuracy_30d).toBeCloseTo(0.8333);
  });
  it('a roster member never carries raw learner content', () => {
    const keys = Object.keys(teacherRosterSchema.shape.members.element.shape);
    for (const forbidden of ['email', 'answers', 'attempts', 'ai', 'personal_words', 'conversation']) {
      expect(keys).not.toContain(forbidden);
    }
  });
  it('parses join results as a discriminated union', () => {
    expect(learnerJoinResultSchema.parse({ status: 'invalid_code' }).status).toBe('invalid_code');
    const joined = learnerJoinResultSchema.parse({
      status: 'joined',
      class: { id: UUID, name: 'Lớp A', language_code: 'en', teacher_name: 'Cô Lan', joined_at: TS, assignment_count: 0, pending_count: 0 },
    });
    expect(joined.status === 'joined' && joined.class.teacher_name).toBe('Cô Lan');
    expect(learnerJoinResultSchema.safeParse({ status: 'joined' }).success).toBe(false);
  });
  it('parses a learner assignment', () => {
    const a = learnerAssignmentSchema.parse({
      id: UUID, class_id: UUID2, kind: 'lesson', ref_id: UUID, title: 'Chào hỏi', target_count: null, due_at: TS,
      note: 'Làm trước thứ Sáu', created_at: TS, class_name: 'Lớp A', state: 'overdue', completed_at: null,
      progress_count: 0,
    });
    expect(a.state).toBe('overdue');
  });
  it('reads assignments from an older server (no exam mode, no closed_at) and the closed state', () => {
    const a = learnerAssignmentSchema.parse({
      id: UUID, class_id: UUID2, kind: 'exam', ref_id: UUID, title: 'Đề N5', target_count: null, due_at: null,
      note: null, created_at: TS, class_name: 'Lớp A', state: 'closed', completed_at: null, progress_count: 0,
    });
    expect(a.exam_mode).toBeNull();
    expect(a.exam_section).toBeNull();
    expect(a.closed_at).toBeNull();
    expect(ASSIGNMENT_STATES).toEqual(['pending', 'overdue', 'closed', 'done']);
    const b = learnerAssignmentSchema.parse({ ...a, exam_mode: 'section', exam_section: 'listening', closed_at: TS });
    expect([b.exam_mode, b.exam_section, b.closed_at]).toEqual(['section', 'listening', TS]);
  });
  it('recognises error codes', () => {
    expect(isTeacherErrorCode('rate_limited')).toBe(true);
    expect(isTeacherErrorCode('invalid_code')).toBe(false);
    expect(isTeacherErrorCode(42)).toBe(false);
  });
});
