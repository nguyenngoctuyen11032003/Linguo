import {
  ADMIN_USER_QUERY_MAX,
  adminFoundUserSchema,
  adminGrantRoleResultSchema,
  adminStaffMemberSchema,
  adminTeacherSchema,
  grantTeacherResultSchema,
  type AdminFoundUser,
  type AdminGrantRoleResult,
  type AdminStaffMember,
  type AdminTeacher,
  type GrantTeacherResult,
  type StaffRole,
} from '@linguo/shared';
import { callRpc, parse } from '@/features/lesson-player/service';
import type { AppSupabaseClient } from '@/lib/supabase';

// Staff management (/quan-tri/nhan-su, admin only): admin_list_staff, admin_find_user (20261017000500_admin_staff.sql)
// and admin_grant_role (20261015000410_admin.sql); teachers: admin_list_teachers (20261018150000_admin_teachers.sql)
// and grant_teacher_role (20261017000400_teacher_tools.sql). Payloads are validated with the shared zod contract.

/** What a staff member may do in the admin area, shown next to each role when granting one. */
export const STAFF_ROLE_DESCRIPTIONS_VI: Record<StaffRole, string> = {
  editor: 'Xem nội dung, nguồn và báo lỗi.',
  reviewer: 'Như biên tập viên, thêm duyệt và xuất bản nội dung, xử lý báo lỗi.',
  admin: 'Toàn quyền: thống kê, nhật ký và quản lý nhân sự.',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^@\s]+@[^@\s]+$/;

/** How admin_find_user will read `query`: a user id, an email address, or neither (rejected before any request). */
export function staffQueryKind(query: string): 'id' | 'email' | null {
  const q = query.trim();
  if (q === '' || q.length > ADMIN_USER_QUERY_MAX) return null;
  if (UUID.test(q)) return 'id';
  if (EMAIL.test(q)) return 'email';
  return null;
}

/**
 * Whether the signed-in admin may change or revoke `member` from this page. Never their own row: an admin who demotes
 * or removes themselves loses the page on the spot (the server additionally keeps the last admin).
 */
export function canManageMember(member: Pick<AdminStaffMember, 'user_id'>, currentUserId: string | null | undefined): boolean {
  return !!currentUserId && member.user_id !== currentUserId;
}

/** Name to show for a staff member or a found user: display name, else email, else a short id. */
export function staffDisplayName(person: Pick<AdminStaffMember, 'user_id' | 'email' | 'display_name'>): string {
  const name = person.display_name?.trim();
  if (name) return name;
  if (person.email) return person.email;
  return `Người dùng ${person.user_id.slice(0, 8)}`;
}

export async function listAdminStaff(client: AppSupabaseClient): Promise<AdminStaffMember[]> {
  const data = await callRpc(client, 'admin_list_staff', {});
  return parse(adminStaffMemberSchema.array(), data ?? []);
}

/** admin_find_user → the account, or null when none matches. Text that is neither an id nor an email throws first. */
export async function findAdminUser(client: AppSupabaseClient, query: string): Promise<AdminFoundUser | null> {
  if (!staffQueryKind(query)) throw new Error('invalid_user_query');
  const data = await callRpc(client, 'admin_find_user', { p_query: query.trim() });
  return parse(adminFoundUserSchema.nullable(), data ?? null);
}

/** "2 lớp đang mở" / "Chưa mở lớp nào" for a teacher row. */
export function teacherClassesLabel(activeClasses: number): string {
  return activeClasses > 0 ? `${activeClasses} lớp đang mở` : 'Chưa mở lớp nào';
}

export async function listAdminTeachers(client: AppSupabaseClient): Promise<AdminTeacher[]> {
  const data = await callRpc(client, 'admin_list_teachers', {});
  return parse(adminTeacherSchema.array(), data ?? []);
}

/** grant_teacher_role: `grant` false revokes teacher status (the teacher's classes stay). */
export async function setTeacherStatus(client: AppSupabaseClient, userId: string, grant: boolean): Promise<GrantTeacherResult> {
  const data = await callRpc(client, 'grant_teacher_role', { p_user_id: userId, p_grant: grant });
  return parse(grantTeacherResultSchema, data);
}

/** admin_grant_role: `role` null revokes. */
export async function grantStaffRole(client: AppSupabaseClient, userId: string, role: StaffRole | null): Promise<AdminGrantRoleResult> {
  const data = await callRpc(client, 'admin_grant_role', { p_user_id: userId, p_role: role });
  return parse(adminGrantRoleResultSchema, data);
}
