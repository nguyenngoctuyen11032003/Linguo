import type { TeacherAssignment, TeacherClass, TeacherInvite, TeacherRoster, TeacherRosterMember } from '@linguo/shared';

// Unit-test fixtures for the teacher tools (PRD P2).

export const CLASS_ID = '7c000000-0000-4000-8000-0000000000c1';
export const MEMBER_ID = '7c000000-0000-4000-8000-0000000000d1';
export const LESSON_ID = '7c000000-0000-4000-8000-0000000000e1';
export const UNIT_ID = '7c000000-0000-4000-8000-0000000000f1';
export const EXAM_ID = '7c000000-0000-4000-8000-0000000000a1';

export function teacherInvite(overrides: Partial<TeacherInvite> = {}): TeacherInvite {
  return {
    code: 'ABCDEFGH',
    class_id: CLASS_ID,
    expires_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    max_uses: null,
    uses: 2,
    created_at: '2026-10-14T00:00:00Z',
    ...overrides,
  };
}

export function teacherClass(overrides: Partial<TeacherClass> = {}): TeacherClass {
  return {
    id: CLASS_ID,
    name: 'Lớp giao tiếp tối thứ Ba',
    language_code: 'en',
    archived_at: null,
    created_at: '2026-10-14T00:00:00Z',
    member_count: 1,
    assignment_count: 0,
    invites: [],
    ...overrides,
  };
}

export function rosterMember(overrides: Partial<TeacherRosterMember> = {}): TeacherRosterMember {
  return {
    user_id: MEMBER_ID,
    display_name: 'Lan Anh',
    joined_at: '2026-10-14T01:00:00Z',
    has_path: true,
    streak_current: 4,
    streak_best: 9,
    minutes_7d: 85,
    minutes_30d: 240,
    last_active_day: '2026-10-15',
    lessons_completed: 12,
    lessons_completed_7d: 3,
    reviews_due: 7,
    reviews_30d: 60,
    review_accuracy_30d: 0.82,
    assignments_done: 1,
    assignments_total: 2,
    ...overrides,
  };
}

export function teacherAssignment(overrides: Partial<TeacherAssignment> = {}): TeacherAssignment {
  return {
    id: '7c000000-0000-4000-8000-0000000000b1',
    class_id: CLASS_ID,
    kind: 'lesson',
    ref_id: LESSON_ID,
    title: 'Chào hỏi và giới thiệu',
    target_count: null,
    exam_mode: null,
    exam_section: null,
    due_at: null,
    closed_at: null,
    note: null,
    created_at: '2026-10-14T02:00:00Z',
    completed_count: 1,
    member_count: 1,
    ...overrides,
  };
}

export function teacherRoster(overrides: Partial<TeacherRoster> = {}): TeacherRoster {
  return { class: teacherClass(), members: [rosterMember()], assignments: [], ...overrides };
}

type FakeRpcResponse = { data?: unknown; error?: unknown };

/** A Supabase client double: rpc() goes to `handler`, from(table) resolves to `tables[table]` whatever the filters. */
export function fakeTeacherClient(handler: (name: string, args: Record<string, unknown>) => FakeRpcResponse, tables: Record<string, unknown[]> = {}) {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const from = (table: string) => {
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'order', 'limit']) builder[method] = () => builder;
    builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve({ data: tables[table] ?? [], error: null }).then(resolve, reject);
    return builder;
  };
  return {
    calls,
    from,
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push([name, args]);
      const { data = null, error = null } = handler(name, args);
      return Promise.resolve({ data, error });
    },
  };
}
