import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TeacherAssignment, TeacherClass, TeacherRoster } from '@linguo/shared';
import {
  CLASS_ID,
  EXAM_ID,
  LESSON_ID,
  UNIT_ID,
  fakeTeacherClient,
  rosterMember,
  teacherAssignment,
  teacherClass,
  teacherInvite,
  teacherRoster,
} from '@/features/teacher/teacher-fixtures';
import { resetIsTeacherCache } from '@/features/teacher/useIsTeacher';
import { renderWithProviders } from '../../../tests/unit/render';
import { TeacherClassPage } from './TeacherClassPage';
import { TeacherClassesPage } from './TeacherClassesPage';
import { TeacherRoute } from './TeacherRoute';

const mocks = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client }));

let isTeacher: boolean;
let classes: TeacherClass[];
let roster: TeacherRoster;
let client: ReturnType<typeof fakeTeacherClient>;

beforeEach(() => {
  localStorage.setItem('linguo-reduce-motion', 'true');
  resetIsTeacherCache();
  isTeacher = true;
  classes = [];
  roster = teacherRoster();
  client = fakeTeacherClient(
    (name, args) => {
      switch (name) {
        case 'is_teacher':
          return { data: isTeacher };
        case 'teacher_list_classes':
          return { data: classes };
        case 'teacher_create_class': {
          if (args.p_name === 'Trùng') return { error: { message: 'name_taken', code: 'P0001' } };
          const created = teacherClass({ id: '7c000000-0000-4000-8000-0000000000c2', name: String(args.p_name), language_code: args.p_language as 'en', member_count: 0 });
          classes.push(created);
          return { data: created };
        }
        case 'teacher_class_roster':
          return args.p_class_id === CLASS_ID ? { data: roster } : { error: { message: 'class_not_found', code: 'P0001' } };
        case 'teacher_create_invite':
          return { data: teacherInvite({ code: 'KMNPQRST', expires_at: new Date(Date.now() + 86_400_000 - 60_000).toISOString(), uses: 0, max_uses: 30 }) };
        case 'teacher_revoke_invite':
          return { data: { revoked: true } };
        case 'teacher_create_assignment': {
          const a: TeacherAssignment = teacherAssignment({
            id: '7c000000-0000-4000-8000-0000000000b9',
            kind: args.p_kind as 'lesson',
            ref_id: (args.p_ref_id as string | null) ?? null,
            title: args.p_kind === 'exam' ? 'CEFR A2 mô phỏng' : args.p_kind === 'lesson' ? 'Chào hỏi' : null,
            target_count: (args.p_target_count as number | null) ?? null,
            due_at: (args.p_due_at as string | null) ?? null,
            completed_count: 0,
          });
          return { data: a };
        }
        case 'teacher_delete_assignment':
          roster = { ...roster, assignments: roster.assignments.filter((a) => a.id !== args.p_assignment_id) };
          return { data: { deleted: true } };
        case 'teacher_archive_class':
          return { data: teacherClass({ archived_at: args.p_archived ? '2026-10-16T00:00:00Z' : null }) };
      }
      return { error: { message: `unexpected ${name}` } };
    },
    {
      lessons: [{ id: LESSON_ID, title: { vi: 'Chào hỏi' }, level_code: 'a1', order_index: 1, unit_id: UNIT_ID }],
      units: [{ id: UNIT_ID, title: { vi: 'Làm quen' }, order_index: 1 }],
      exam_forms: [{ id: EXAM_ID, title_vi: 'CEFR A2 mô phỏng', level_from: 'a2' }],
    },
  );
  mocks.client = client;
});
afterEach(() => {
  mocks.client = null;
});

function renderTeacher(route: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/giao-vien" element={<TeacherRoute />}>
        <Route index element={<TeacherClassesPage />} />
        <Route path="lop/:classId" element={<TeacherClassPage />} />
      </Route>
    </Routes>,
    { route },
  );
}

describe('teacher area', () => {
  it('explains the area to a signed-in learner without a teacher profile', async () => {
    isTeacher = false;
    renderTeacher('/giao-vien');
    expect(await screen.findByRole('heading', { level: 1, name: 'Khu vực dành cho giáo viên' })).toBeInTheDocument();
    expect(client.calls.map(([n]) => n)).toEqual(['is_teacher']);
  });

  it('creates the first class and keeps server errors in the dialog', async () => {
    const user = userEvent.setup();
    renderTeacher('/giao-vien');
    expect(await screen.findByRole('heading', { name: 'Chưa có lớp nào' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Tạo lớp đầu tiên/ }));
    let dialog = await screen.findByRole('dialog', { name: 'Tạo lớp mới' });
    await user.type(within(dialog).getByLabelText('Tên lớp'), 'Trùng');
    await user.click(within(dialog).getByRole('button', { name: 'Tạo lớp' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('trùng tên');

    await user.clear(within(dialog).getByLabelText('Tên lớp'));
    await user.type(within(dialog).getByLabelText('Tên lớp'), '  Lớp   Hàn  ');
    dialog = screen.getByRole('dialog', { name: 'Tạo lớp mới' });
    await user.click(within(dialog).getByRole('radio', { name: 'Tiếng Hàn' }));
    await user.click(within(dialog).getByRole('button', { name: 'Tạo lớp' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(client.calls.filter(([n]) => n === 'teacher_create_class').at(-1)?.[1]).toEqual({ p_name: 'Lớp Hàn', p_language: 'ko' });
    expect(await screen.findByRole('link', { name: /Lớp Hàn/ })).toHaveAttribute('href', `/giao-vien/lop/7c000000-0000-4000-8000-0000000000c2`);
  });

  it('shows the roster with aggregates only, invites and assignment completion', async () => {
    roster = teacherRoster({
      class: teacherClass({ invites: [teacherInvite()], assignment_count: 1 }),
      members: [rosterMember(), rosterMember({ user_id: '7c000000-0000-4000-8000-0000000000d2', display_name: null, has_path: false, review_accuracy_30d: null })],
      assignments: [teacherAssignment({ completed_count: 1, member_count: 2, due_at: '2020-01-01T00:00:00Z' })],
    });
    renderTeacher(`/giao-vien/lop/${CLASS_ID}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Lớp giao tiếp tối thứ Ba' })).toBeInTheDocument();
    expect(screen.getByText('ABCD-EFGH')).toBeInTheDocument();
    expect(screen.getByText(/học viên đã hoàn thành \(50%\)/)).toBeInTheDocument();
    expect(screen.getByText('Đã quá hạn')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByRole('rowheader', { name: /Lan Anh/ })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: /Học viên chưa đặt tên/ })).toHaveTextContent('Chưa có lộ trình tiếng anh');
    expect(within(table).getByText('82%')).toBeInTheDocument();
  });

  it('copies and revokes an invite', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    roster = teacherRoster({ class: teacherClass({ invites: [teacherInvite()] }) });
    renderTeacher(`/giao-vien/lop/${CLASS_ID}`);
    await user.click(await screen.findByRole('button', { name: 'Chép mã ABCD-EFGH' }));
    expect(writeText).toHaveBeenCalledWith('ABCD-EFGH');
    expect(await screen.findByText('Đã chép mã ABCD-EFGH.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Thu hồi mã ABCD-EFGH' }));
    const dialog = await screen.findByRole('dialog', { name: 'Thu hồi mã mời này?' });
    await user.click(within(dialog).getByRole('button', { name: 'Thu hồi mã' }));
    await waitFor(() => expect(screen.queryByText('ABCD-EFGH')).not.toBeInTheDocument());
    expect(client.calls.find(([n]) => n === 'teacher_revoke_invite')?.[1]).toEqual({ p_code: 'ABCDEFGH' });
  });

  it('creates an invite with a cap and assigns a lesson from the catalog', async () => {
    const user = userEvent.setup();
    renderTeacher(`/giao-vien/lop/${CLASS_ID}`);
    await user.click(await screen.findByRole('button', { name: 'Tạo mã mời' }));
    let dialog = await screen.findByRole('dialog', { name: 'Tạo mã mời' });
    await user.selectOptions(within(dialog).getByLabelText('Hiệu lực trong'), '1 ngày');
    await user.type(within(dialog).getByLabelText(/Giới hạn số học viên/), '30');
    await user.click(within(dialog).getByRole('button', { name: 'Tạo mã' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(client.calls.find(([n]) => n === 'teacher_create_invite')?.[1]).toEqual({ p_class_id: CLASS_ID, p_expires_hours: 24, p_max_uses: 30 });
    expect(await screen.findByText('KMNP-QRST')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Giao bài' }));
    dialog = await screen.findByRole('dialog', { name: 'Giao bài cho lớp' });
    await user.click(within(dialog).getByRole('button', { name: 'Giao bài' }));
    expect(await within(dialog).findByText('Hãy chọn một bài học.')).toBeInTheDocument();
    const select = await within(dialog).findByLabelText('Bài học');
    expect(within(select).getByRole('group', { name: 'A1 · Làm quen' })).toBeInTheDocument();
    await user.selectOptions(select, 'Chào hỏi');
    await user.click(within(dialog).getByRole('button', { name: 'Giao bài' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(client.calls.find(([n]) => n === 'teacher_create_assignment')?.[1]).toMatchObject({ p_kind: 'lesson', p_ref_id: LESSON_ID, p_due_at: null });
    expect(await screen.findByRole('heading', { level: 3, name: 'Chào hỏi' })).toBeInTheDocument();
  });

  it('shows a not-found page for a class that is not the teacher’s', async () => {
    renderTeacher('/giao-vien/lop/7c000000-0000-4000-8000-0000000000ff');
    expect(await screen.findByRole('heading', { level: 1, name: 'Không tìm thấy lớp' })).toBeInTheDocument();
  });
});
