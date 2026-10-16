import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AdminStaffMember, AdminTeacher } from '@linguo/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_USER_ID, overviewFixture } from '@/features/admin/admin-fixtures';
import {
  LEARNER_ID,
  STAFF_EDITOR_ID,
  STAFF_REVIEWER_ID,
  TEACHER_ID,
  foundUserFixture,
  staffListFixture,
  teacherFixture,
} from '@/features/admin/staff-fixtures';
import { renderAdmin, routeRpcs } from '../admin-test-utils';

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  return { rpc, client: { rpc } };
});
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client }));

afterEach(() => {
  mocks.rpc.mockReset();
});

const calls = (name: string) => mocks.rpc.mock.calls.filter(([n]) => n === name).map(([, args]) => args as Record<string, unknown>);

/**
 * A tiny stateful backend: admin_grant_role changes what admin_list_staff returns next, grant_teacher_role what
 * admin_list_teachers returns next.
 */
function staffBackend(initial: AdminStaffMember[] = staffListFixture(), grantError?: unknown, initialTeachers: AdminTeacher[] = [teacherFixture()]) {
  let staff = initial.map((m) => ({ ...m }));
  let teachers = initialTeachers.map((t) => ({ ...t }));
  routeRpcs(mocks.rpc, {
    staff_role: { data: 'admin' },
    admin_list_staff: () => ({ data: staff }),
    admin_list_teachers: () => ({ data: teachers }),
    grant_teacher_role: (args) => {
      const id = String(args.p_user_id);
      const grant = args.p_grant === true;
      if (!grant) teachers = teachers.filter((t) => t.user_id !== id);
      else if (!teachers.some((t) => t.user_id === id))
        teachers = [...teachers, teacherFixture({ user_id: id, email: 'mai@example.com', display_name: 'Mai Trần', granted_by: ADMIN_USER_ID, granted_by_email: 'staff@example.com', active_classes: 0 })];
      return { data: { user_id: id, is_teacher: grant } };
    },
    admin_find_user: (args) => {
      const q = String(args.p_query).toLowerCase();
      if (q === 'mai@example.com') return { data: foundUserFixture() };
      if (q === 'staff@example.com') return { data: foundUserFixture({ user_id: ADMIN_USER_ID, email: 'staff@example.com', display_name: 'Quản Trị', role: 'admin' }) };
      return { data: null };
    },
    admin_grant_role: (args) => {
      if (grantError) return { data: null, error: grantError };
      const id = String(args.p_user_id);
      const role = (args.p_role as AdminStaffMember['role'] | null) ?? null;
      if (role === null) staff = staff.filter((m) => m.user_id !== id);
      else if (staff.some((m) => m.user_id === id)) staff = staff.map((m) => (m.user_id === id ? { ...m, role } : m));
      else staff = [...staff, { user_id: id, email: 'mai@example.com', display_name: 'Mai Trần', role, granted_by: ADMIN_USER_ID, granted_by_email: 'staff@example.com', granted_at: '2026-10-15T08:00:00Z' }];
      return { data: { user_id: id, role } };
    },
  });
}

async function openList() {
  renderAdmin('/quan-tri/nhan-su');
  expect(await screen.findByRole('heading', { level: 1, name: 'Nhân sự' })).toBeInTheDocument();
  return screen.findByRole('list', { name: 'Danh sách nhân sự' });
}

describe('StaffPage access', () => {
  it('is admin only: a reviewer sees the admin-only notice and no staff RPC runs', async () => {
    routeRpcs(mocks.rpc, { staff_role: { data: 'reviewer' }, admin_content_overview: { data: overviewFixture() } });
    renderAdmin('/quan-tri/nhan-su');
    expect(await screen.findByRole('heading', { name: 'Trang này chỉ dành cho quản trị viên' })).toBeInTheDocument();
    expect(calls('admin_list_staff')).toEqual([]);
    const nav = screen.getByRole('navigation', { name: 'Điều hướng quản trị' });
    expect(within(nav).queryByRole('link', { name: 'Nhân sự' })).not.toBeInTheDocument();
  });

  it('shows the Nhân sự nav entry to admins', async () => {
    staffBackend();
    renderAdmin('/quan-tri/nhan-su');
    const nav = await screen.findByRole('navigation', { name: 'Điều hướng quản trị' });
    expect(within(nav).getByRole('link', { name: 'Nhân sự' })).toHaveAttribute('href', '/quan-tri/nhan-su');
  });
});

describe('StaffPage list', () => {
  it('lists staff with roles and granters, and keeps the admin away from their own row', async () => {
    staffBackend();
    const list = await openList();
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText('Bạn')).toBeInTheDocument();
    expect(within(rows[0]!).queryByRole('button', { name: /Thu hồi/ })).not.toBeInTheDocument();
    expect(within(rows[0]!).queryByRole('combobox')).not.toBeInTheDocument();
    expect(within(rows[0]!).getByText(/không thể tự đổi hoặc thu hồi/)).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Lan Phạm')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('lan@example.com')).toBeInTheDocument();
    expect(within(rows[1]!).getByText(/bởi staff@example\.com/)).toBeInTheDocument();
    // No display name: the email is the name.
    expect(within(rows[2]!).getByRole('button', { name: 'Thu hồi vai trò của huy@example.com' })).toBeInTheDocument();
  });

  it('changes a role and reloads the list', async () => {
    staffBackend();
    const user = userEvent.setup();
    await openList();
    const select = screen.getByRole('combobox', { name: 'Vai trò của huy@example.com' });
    const row = select.closest('li')!;
    const save = within(row).getByRole('button', { name: 'Lưu vai trò' });
    expect(save).toBeDisabled();
    await user.selectOptions(select, 'reviewer');
    await user.click(save);
    expect(await screen.findByRole('status')).toHaveTextContent('Đã đổi vai trò của huy@example.com thành "Người duyệt".');
    expect(calls('admin_grant_role')).toEqual([{ p_user_id: STAFF_EDITOR_ID, p_role: 'reviewer' }]);
    await waitFor(() => expect(calls('admin_list_staff')).toHaveLength(2));
    expect(screen.getByRole('combobox', { name: 'Vai trò của huy@example.com' })).toHaveValue('reviewer');
  });

  it('revokes only after confirming in a dialog', async () => {
    staffBackend();
    const user = userEvent.setup();
    await openList();
    const trigger = screen.getByRole('button', { name: 'Thu hồi vai trò của Lan Phạm' });
    await user.click(trigger);
    let dialog = screen.getByRole('alertdialog', { name: 'Thu hồi vai trò?' });
    expect(dialog).toHaveTextContent('Lan Phạm sẽ mất vai trò Người duyệt');
    await user.click(within(dialog).getByRole('button', { name: 'Huỷ' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(calls('admin_grant_role')).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Thu hồi vai trò của Lan Phạm' }));
    dialog = screen.getByRole('alertdialog', { name: 'Thu hồi vai trò?' });
    await user.click(within(dialog).getByRole('button', { name: 'Thu hồi' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Đã thu hồi vai trò của Lan Phạm.');
    expect(calls('admin_grant_role')).toEqual([{ p_user_id: STAFF_REVIEWER_ID, p_role: null }]);
    await waitFor(() => expect(screen.queryByText('Lan Phạm')).not.toBeInTheDocument());
  });

  it('shows the server refusal in Vietnamese', async () => {
    staffBackend(staffListFixture(), { message: 'last_admin_required', code: 'P0001' });
    const user = userEvent.setup();
    await openList();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Vai trò của Lan Phạm' }), 'admin');
    await user.click(within(screen.getByRole('combobox', { name: 'Vai trò của Lan Phạm' }).closest('li')!).getByRole('button', { name: 'Lưu vai trò' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/^Phải còn ít nhất một quản trị viên/);
  });

  it('offers a retry when the list cannot load', async () => {
    routeRpcs(mocks.rpc, {
      staff_role: { data: 'admin' },
      admin_list_staff: { data: null, error: { message: 'staff_forbidden', code: 'P0001' } },
      admin_list_teachers: { data: [] },
    });
    renderAdmin('/quan-tri/nhan-su');
    expect(await screen.findByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });
});

describe('StaffPage teachers', () => {
  async function openTeachers() {
    renderAdmin('/quan-tri/nhan-su');
    return screen.findByRole('list', { name: 'Danh sách giáo viên' });
  }

  it('lists teachers with granter and class count', async () => {
    staffBackend(staffListFixture(), undefined, [
      teacherFixture(),
      teacherFixture({ user_id: STAFF_EDITOR_ID, email: 'huy@example.com', display_name: null, granted_by: ADMIN_USER_ID, granted_by_email: 'staff@example.com', active_classes: 0 }),
    ]);
    const list = await openTeachers();
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText('Cô Lan')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('colan@example.com')).toBeInTheDocument();
    expect(within(rows[0]!).getByText(/2 lớp đang mở/)).toBeInTheDocument();
    expect(within(rows[1]!).getByText(/bởi staff@example\.com · Chưa mở lớp nào/)).toBeInTheDocument();
    expect(calls('admin_list_teachers')).toEqual([{}]);
  });

  it('shows an empty state without teachers', async () => {
    staffBackend(staffListFixture(), undefined, []);
    renderAdmin('/quan-tri/nhan-su');
    expect(await screen.findByRole('heading', { name: 'Chưa có giáo viên' })).toBeInTheDocument();
  });

  it('revokes teacher status only after confirming, explaining that classes stay', async () => {
    staffBackend();
    const user = userEvent.setup();
    await openTeachers();
    await user.click(screen.getByRole('button', { name: 'Thu hồi quyền giáo viên của Cô Lan' }));
    let dialog = screen.getByRole('alertdialog', { name: 'Thu hồi quyền giáo viên?' });
    expect(dialog).toHaveTextContent('Cô Lan sẽ không mở được khu giáo viên nữa. 2 lớp đang mở vẫn còn');
    await user.click(within(dialog).getByRole('button', { name: 'Huỷ' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(calls('grant_teacher_role')).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Thu hồi quyền giáo viên của Cô Lan' }));
    dialog = screen.getByRole('alertdialog', { name: 'Thu hồi quyền giáo viên?' });
    await user.click(within(dialog).getByRole('button', { name: 'Thu hồi' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Đã thu hồi quyền giáo viên của Cô Lan.');
    expect(calls('grant_teacher_role')).toEqual([{ p_user_id: TEACHER_ID, p_grant: false }]);
    expect(await screen.findByRole('heading', { name: 'Chưa có giáo viên' })).toBeInTheDocument();
    // Staff roles are untouched.
    expect(calls('admin_grant_role')).toEqual([]);
  });

  it('grants teacher status from the account search', async () => {
    staffBackend();
    const user = userEvent.setup();
    await openTeachers();
    await user.type(screen.getByLabelText('Email hoặc mã người dùng'), 'mai@example.com');
    await user.click(screen.getByRole('button', { name: 'Tìm tài khoản' }));
    expect(await screen.findByText('Quyền giáo viên: Chưa có')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cấp quyền giáo viên' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Đã cấp quyền giáo viên cho Mai Trần.');
    expect(calls('grant_teacher_role')).toEqual([{ p_user_id: LEARNER_ID, p_grant: true }]);
    const list = screen.getByRole('list', { name: 'Danh sách giáo viên' });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(2));
    expect(calls('admin_grant_role')).toEqual([]);
  });

  it('does not offer a grant to someone who is already a teacher', async () => {
    staffBackend(staffListFixture(), undefined, [teacherFixture({ user_id: LEARNER_ID })]);
    const user = userEvent.setup();
    await openTeachers();
    await user.type(screen.getByLabelText('Email hoặc mã người dùng'), 'mai@example.com');
    await user.click(screen.getByRole('button', { name: 'Tìm tài khoản' }));
    expect(await screen.findByText('Quyền giáo viên: Đã có')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cấp quyền giáo viên' })).not.toBeInTheDocument();
  });

  it('offers a retry when the teacher list cannot load', async () => {
    routeRpcs(mocks.rpc, {
      staff_role: { data: 'admin' },
      admin_list_staff: { data: staffListFixture() },
      admin_list_teachers: { data: null, error: { message: 'staff_forbidden', code: 'P0001' } },
    });
    renderAdmin('/quan-tri/nhan-su');
    expect(await screen.findByRole('heading', { name: 'Không tải được danh sách giáo viên' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });
});

describe('StaffPage grant', () => {
  it('finds an account by email and grants it a role', async () => {
    staffBackend();
    const user = userEvent.setup();
    await openList();
    await user.type(screen.getByLabelText('Email hoặc mã người dùng'), '  MAI@example.com ');
    await user.click(screen.getByRole('button', { name: 'Tìm tài khoản' }));
    expect(await screen.findByText('Mai Trần')).toBeInTheDocument();
    expect(screen.getByText('Vai trò hiện tại: Chưa có')).toBeInTheDocument();
    expect(calls('admin_find_user')).toEqual([{ p_query: 'MAI@example.com' }]);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Vai trò' }), 'reviewer');
    await user.click(screen.getByRole('button', { name: 'Cấp vai trò' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Đã cấp vai trò "Người duyệt" cho Mai Trần.');
    expect(calls('admin_grant_role')).toEqual([{ p_user_id: LEARNER_ID, p_role: 'reviewer' }]);
    const list = screen.getByRole('list', { name: 'Danh sách nhân sự' });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(4));
  });

  it('rejects free text without asking the server and reports unknown accounts', async () => {
    staffBackend();
    const user = userEvent.setup();
    await openList();
    const input = screen.getByLabelText('Email hoặc mã người dùng');
    await user.type(input, 'mai');
    await user.click(screen.getByRole('button', { name: 'Tìm tài khoản' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Hãy nhập đúng email hoặc mã người dùng (UUID).');
    expect(calls('admin_find_user')).toEqual([]);

    await user.clear(input);
    await user.type(input, 'nobody@example.com');
    await user.click(screen.getByRole('button', { name: 'Tìm tài khoản' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Không tìm thấy tài khoản nào khớp.');
  });

  it('does not let the admin change their own role from the search either', async () => {
    staffBackend();
    const user = userEvent.setup();
    await openList();
    await user.type(screen.getByLabelText('Email hoặc mã người dùng'), 'staff@example.com');
    await user.click(screen.getByRole('button', { name: 'Tìm tài khoản' }));
    expect(await screen.findByText(/Đây là tài khoản của bạn/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cấp vai trò|Đổi vai trò/ })).not.toBeInTheDocument();
  });
});
