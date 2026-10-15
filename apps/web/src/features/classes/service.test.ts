import { describe, expect, it } from 'vitest';
import type { AppSupabaseClient } from '@/lib/supabase';
import { CLASS_ID, fakeClassesClient, learnerAssignment, learnerClass } from './class-fixtures';
import { fetchLearnerAssignments, fetchLearnerClasses, joinClass, leaveClass } from './service';

const asClient = (c: unknown) => c as AppSupabaseClient;

describe('classes service', () => {
  it('lists classes and treats a null answer as no classes', async () => {
    const client = fakeClassesClient((name) => (name === 'learner_list_classes' ? { data: [learnerClass()] } : {}));
    expect(await fetchLearnerClasses(asClient(client))).toEqual([learnerClass()]);
    const empty = fakeClassesClient(() => ({ data: null }));
    expect(await fetchLearnerClasses(asClient(empty))).toEqual([]);
  });

  it('lists all assignments, or those of one class', async () => {
    const a = learnerAssignment();
    const client = fakeClassesClient(() => ({ data: [a] }));
    expect(await fetchLearnerAssignments(asClient(client))).toEqual([a]);
    await fetchLearnerAssignments(asClient(client), CLASS_ID);
    expect(client.calls).toEqual([
      ['learner_list_assignments', {}],
      ['learner_list_assignments', { p_class_id: CLASS_ID }],
    ]);
  });

  it('normalises the code before joining and parses every status', async () => {
    const client = fakeClassesClient((_, args) =>
      args.p_code === 'ABCDEFGH' ? { data: { status: 'joined', class: learnerClass() } } : { data: { status: 'invalid_code' } },
    );
    expect(await joinClass(asClient(client), ' abcd-efgh ')).toEqual({ status: 'joined', class: learnerClass() });
    expect(await joinClass(asClient(client), 'ZZZZZZZZ')).toEqual({ status: 'invalid_code' });
    expect(client.calls[0]).toEqual(['learner_join_class', { p_code: 'ABCDEFGH' }]);
  });

  it('rejects with the RPC error and with invalid_payload on an unexpected shape', async () => {
    const limited = fakeClassesClient(() => ({ error: { message: 'rate_limited', code: 'P0001' } }));
    await expect(joinClass(asClient(limited), 'ABCDEFGH')).rejects.toMatchObject({ message: 'rate_limited' });
    const odd = fakeClassesClient(() => ({ data: { status: 'joined' } }));
    await expect(joinClass(asClient(odd), 'ABCDEFGH')).rejects.toThrow('invalid_payload');
  });

  it('leaves a class', async () => {
    const client = fakeClassesClient(() => ({ data: { left: true } }));
    await leaveClass(asClient(client), CLASS_ID);
    expect(client.calls).toEqual([['learner_leave_class', { p_class_id: CLASS_ID }]]);
    const notMember = fakeClassesClient(() => ({ error: { message: 'not_member', code: 'P0001' } }));
    await expect(leaveClass(asClient(notMember), CLASS_ID)).rejects.toMatchObject({ message: 'not_member' });
  });
});
