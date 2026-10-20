import type { LearnerAssignment, LearnerClass } from '@linguo/shared';

// Test fixtures for the learner classes feature: plain rows plus a stand-in for the Supabase client whose `rpc`
// is answered by a handler, so hooks and pages can be tested without a network.

export const CLASS_ID = '7c000000-0000-4000-8000-000000000001';
export const CLASS_ID_2 = '7c000000-0000-4000-8000-000000000002';
export const LESSON_ID = '7c100000-0000-4000-8000-000000000001';

export function learnerClass(overrides: Partial<LearnerClass> = {}): LearnerClass {
  return {
    id: CLASS_ID,
    name: 'Tiếng Hàn sơ cấp 1',
    language_code: 'ko',
    teacher_name: 'Cô Lan',
    joined_at: '2026-10-10T02:00:00Z',
    assignment_count: 2,
    pending_count: 1,
    ...overrides,
  };
}

let seq = 0;
export function learnerAssignment(overrides: Partial<LearnerAssignment> = {}): LearnerAssignment {
  seq += 1;
  return {
    id: `7c200000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    class_id: CLASS_ID,
    kind: 'lesson',
    ref_id: LESSON_ID,
    title: 'Chào hỏi cơ bản',
    target_count: null,
    exam_mode: null,
    exam_section: null,
    due_at: '2026-10-20T13:00:00Z',
    closed_at: null,
    note: null,
    created_at: '2026-10-11T00:00:00Z',
    class_name: 'Tiếng Hàn sơ cấp 1',
    state: 'pending',
    completed_at: null,
    progress_count: 0,
    ...overrides,
  };
}

export interface FakeRpcResponse {
  data?: unknown;
  error?: unknown;
}

/** A client whose `rpc` is answered by `handler` (name, args); `calls` records every RPC. */
export function fakeClassesClient(handler: (name: string, args: Record<string, unknown>) => FakeRpcResponse) {
  const calls: Array<[string, Record<string, unknown>]> = [];
  return {
    calls,
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push([name, args]);
      const { data = null, error = null } = handler(name, args);
      return Promise.resolve({ data, error });
    },
  };
}
