import { adminFoundUserSchema, adminStaffMemberSchema, adminTeacherSchema } from '@linguo/shared';
import { describe, expect, it, vi } from 'vitest';
import type { AppSupabaseClient } from '@/lib/supabase';
import { ADMIN_USER_ID } from './admin-fixtures';
import { adminErrorMessage } from './error-map';
import {
  canManageMember,
  findAdminUser,
  grantStaffRole,
  listAdminStaff,
  listAdminTeachers,
  setTeacherStatus,
  staffDisplayName,
  staffQueryKind,
  teacherClassesLabel,
} from './staff';
import { LEARNER_ID, STAFF_EDITOR_ID, TEACHER_ID, foundUserFixture, staffListFixture, staffMemberFixture, teacherFixture } from './staff-fixtures';

function clientReturning(data: unknown, error: unknown = null) {
  const rpc = vi.fn(() => Promise.resolve({ data, error }));
  return { rpc, client: { rpc } as unknown as AppSupabaseClient };
}

describe('staff fixtures', () => {
  it('match the shared contract', () => {
    expect(adminStaffMemberSchema.array().safeParse(staffListFixture()).success).toBe(true);
    expect(adminFoundUserSchema.safeParse(foundUserFixture()).success).toBe(true);
    expect(adminTeacherSchema.safeParse(teacherFixture()).success).toBe(true);
  });
});

describe('teacher service', () => {
  it('lists teachers through admin_list_teachers', async () => {
    const { rpc, client } = clientReturning([teacherFixture()]);
    await expect(listAdminTeachers(client)).resolves.toEqual([teacherFixture()]);
    expect(rpc).toHaveBeenCalledWith('admin_list_teachers', {});
    await expect(listAdminTeachers(clientReturning(null).client)).resolves.toEqual([]);
  });

  it('rejects a malformed teacher payload', async () => {
    const { client } = clientReturning([{ ...teacherFixture(), active_classes: -1 }]);
    await expect(listAdminTeachers(client)).rejects.toThrow('invalid_payload');
  });

  it('grants and revokes through grant_teacher_role', async () => {
    const grant = clientReturning({ user_id: TEACHER_ID, is_teacher: true });
    await expect(setTeacherStatus(grant.client, TEACHER_ID, true)).resolves.toEqual({ user_id: TEACHER_ID, is_teacher: true });
    expect(grant.rpc).toHaveBeenCalledWith('grant_teacher_role', { p_user_id: TEACHER_ID, p_grant: true });
    const revoke = clientReturning({ user_id: TEACHER_ID, is_teacher: false });
    await expect(setTeacherStatus(revoke.client, TEACHER_ID, false)).resolves.toEqual({ user_id: TEACHER_ID, is_teacher: false });
    expect(revoke.rpc).toHaveBeenCalledWith('grant_teacher_role', { p_user_id: TEACHER_ID, p_grant: false });
  });

  it('words the class count', () => {
    expect(teacherClassesLabel(0)).toBe('Chưa mở lớp nào');
    expect(teacherClassesLabel(3)).toBe('3 lớp đang mở');
  });
});

describe('staffQueryKind', () => {
  it.each([
    ['mai@example.com', 'email'],
    ['  Mai@Example.com ', 'email'],
    [LEARNER_ID, 'id'],
    [LEARNER_ID.toUpperCase(), 'id'],
    ['', null],
    ['   ', null],
    ['mai', null],
    ['a b@example.com', null],
    ['a@b@c', null],
    [`${'a'.repeat(320)}@x.dev`, null],
  ] as const)('%j → %s', (query, kind) => {
    expect(staffQueryKind(query)).toBe(kind);
  });
});

describe('canManageMember', () => {
  it('never lets an admin manage their own row', () => {
    expect(canManageMember({ user_id: ADMIN_USER_ID }, ADMIN_USER_ID)).toBe(false);
    expect(canManageMember({ user_id: STAFF_EDITOR_ID }, ADMIN_USER_ID)).toBe(true);
  });

  it('refuses everything without a signed-in user', () => {
    expect(canManageMember({ user_id: STAFF_EDITOR_ID }, null)).toBe(false);
    expect(canManageMember({ user_id: STAFF_EDITOR_ID }, '')).toBe(false);
  });
});

describe('staffDisplayName', () => {
  it('prefers the display name, then the email, then a short id', () => {
    expect(staffDisplayName(staffMemberFixture({ display_name: '  Lan  ' }))).toBe('Lan');
    expect(staffDisplayName(staffMemberFixture({ display_name: ' ', email: 'lan@example.com' }))).toBe('lan@example.com');
    expect(staffDisplayName(staffMemberFixture({ display_name: null, email: null, user_id: STAFF_EDITOR_ID }))).toBe('Người dùng 50000000');
  });
});

describe('staff service', () => {
  it('lists staff through admin_list_staff', async () => {
    const { rpc, client } = clientReturning(staffListFixture());
    await expect(listAdminStaff(client)).resolves.toHaveLength(3);
    expect(rpc).toHaveBeenCalledWith('admin_list_staff', {});
  });

  it('rejects a malformed staff payload', async () => {
    const { client } = clientReturning([{ ...staffMemberFixture(), role: 'owner' }]);
    await expect(listAdminStaff(client)).rejects.toThrow('invalid_payload');
  });

  it('finds a user by trimmed query and returns null when nobody matches', async () => {
    const hit = clientReturning(foundUserFixture());
    await expect(findAdminUser(hit.client, '  mai@example.com ')).resolves.toEqual(foundUserFixture());
    expect(hit.rpc).toHaveBeenCalledWith('admin_find_user', { p_query: 'mai@example.com' });
    const miss = clientReturning(null);
    await expect(findAdminUser(miss.client, LEARNER_ID)).resolves.toBeNull();
  });

  it('does not call the server for text that is neither an email nor an id', async () => {
    const { rpc, client } = clientReturning(null);
    const failure = await findAdminUser(client, 'mai').catch((e: unknown) => e);
    expect(failure).toEqual(new Error('invalid_user_query'));
    expect(adminErrorMessage(failure)).toBe('Hãy nhập đúng email hoặc mã người dùng (UUID).');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('grants and revokes through admin_grant_role', async () => {
    const grant = clientReturning({ user_id: LEARNER_ID, role: 'reviewer' });
    await expect(grantStaffRole(grant.client, LEARNER_ID, 'reviewer')).resolves.toEqual({ user_id: LEARNER_ID, role: 'reviewer' });
    expect(grant.rpc).toHaveBeenCalledWith('admin_grant_role', { p_user_id: LEARNER_ID, p_role: 'reviewer' });
    const revoke = clientReturning({ user_id: LEARNER_ID, role: null });
    await expect(grantStaffRole(revoke.client, LEARNER_ID, null)).resolves.toEqual({ user_id: LEARNER_ID, role: null });
    expect(revoke.rpc).toHaveBeenCalledWith('admin_grant_role', { p_user_id: LEARNER_ID, p_role: null });
  });

  it('surfaces the last-admin refusal in Vietnamese', async () => {
    const { client } = clientReturning(null, { message: 'last_admin_required', code: 'P0001' });
    const failure = await grantStaffRole(client, ADMIN_USER_ID, null).catch((e: unknown) => e);
    expect(adminErrorMessage(failure)).toMatch(/^Phải còn ít nhất một quản trị viên/);
  });
});
