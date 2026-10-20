import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type TeacherAssignment, type TeacherClass, type TeacherRoster } from '@linguo/shared';
import { topikIForm } from '@/features/exam/exam-fixtures';
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

const mocks = vi.hoisted(() => ({ client: null as unknown, download: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client }));
vi.mock('@/lib/download', () => ({ downloadTextFile: mocks.download }));

let isTeacher: boolean;
let classes: TeacherClass[];
let roster: TeacherRoster;
let client: ReturnType<typeof fakeTeacherClient>;

beforeEach(() => {
  localStorage.setItem('linguo-reduce-motion', 'true');
  mocks.download.mockClear();
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
            exam_mode: (args.p_exam_mode as 'full' | null) ?? null,
            exam_section: (args.p_exam_section as 'reading' | null) ?? null,
            due_at: (args.p_due_at as string | null) ?? null,
            completed_count: 0,
          });
          return { data: a };
        }
        case 'teacher_update_assignment': {
          const before = roster.assignments.find((a) => a.id === args.p_assignment_id);
          if (!before) return { error: { message: 'assignment_not_found', code: 'P0001' } };
          if (args.p_note === 'bad due') return { error: { message: 'invalid_due', code: 'P0001' } };
          const updated: TeacherAssignment = {
            ...before,
            note: (args.p_note as string | null) ?? null,
            due_at: args.p_set_due ? ((args.p_due_at as string | null) ?? null) : before.due_at,
            closed_at: args.p_closed ? (before.closed_at ?? '2026-10-20T00:00:00Z') : null,
          };
          roster = { ...roster, assignments: roster.assignments.map((a) => (a.id === updated.id ? updated : a)) };
          return { data: updated };
        }
        case 'list_exam_forms':
          return {
            data: [
              topikIForm({
                form_id: EXAM_ID,
                language_code: 'en',
                family: 'cefr',
                title_vi: 'CEFR A2 mô phỏng',
                level_from: 'a2',
                sections: [
                  { section: 'listening', question_count: 8, minutes: 20 },
                  { section: 'reading', question_count: 10, minutes: 30 },
                ],
              }),
            ],
          };
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
    expect(screen.getByText('Quá hạn · 1 học viên chưa nộp')).toBeInTheDocument();
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

  it('gives an exam with a full-mock or one-section mode', async () => {
    const user = userEvent.setup();
    renderTeacher(`/giao-vien/lop/${CLASS_ID}`);
    await user.click(await screen.findByRole('button', { name: 'Giao bài' }));
    const dialog = await screen.findByRole('dialog', { name: 'Giao bài cho lớp' });
    await user.click(within(dialog).getByRole('radio', { name: 'Đề luyện thi' }));
    // The mode only appears once an exam is chosen.
    expect(within(dialog).queryByRole('group', { name: 'Cách làm đề' })).not.toBeInTheDocument();
    await user.selectOptions(await within(dialog).findByLabelText('Đề luyện thi'), 'CEFR A2 mô phỏng');
    const modes = within(dialog).getByRole('group', { name: 'Cách làm đề' });
    expect(within(modes).getByRole('radio', { name: 'Học viên tự chọn' })).toBeChecked();

    await user.click(within(modes).getByRole('radio', { name: 'Làm một phần' }));
    await user.click(within(dialog).getByRole('button', { name: 'Giao bài' }));
    expect(await within(dialog).findByText('Hãy chọn phần của đề học viên cần làm.')).toBeInTheDocument();
    // Only the sections that have questions are offered (this form has no writing section).
    const section = within(dialog).getByLabelText('Phần của đề');
    expect(within(section).getAllByRole('option').map((o) => o.textContent)).toEqual(['Chọn phần…', 'Nghe', 'Đọc']);
    await user.selectOptions(section, 'Đọc');
    await user.click(within(dialog).getByRole('button', { name: 'Giao bài' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(client.calls.find(([n]) => n === 'teacher_create_assignment')?.[1]).toMatchObject({
      p_kind: 'exam',
      p_ref_id: EXAM_ID,
      p_exam_mode: 'section',
      p_exam_section: 'reading',
    });
    expect(await screen.findByText(/Làm phần Đọc/)).toBeInTheDocument();
  });

  it('sends a full-mock mode and no section', async () => {
    const user = userEvent.setup();
    renderTeacher(`/giao-vien/lop/${CLASS_ID}`);
    await user.click(await screen.findByRole('button', { name: 'Giao bài' }));
    const dialog = await screen.findByRole('dialog', { name: 'Giao bài cho lớp' });
    await user.click(within(dialog).getByRole('radio', { name: 'Đề luyện thi' }));
    await user.selectOptions(await within(dialog).findByLabelText('Đề luyện thi'), 'CEFR A2 mô phỏng');
    await user.click(within(dialog).getByRole('radio', { name: 'Làm trọn đề' }));
    expect(within(dialog).queryByLabelText('Phần của đề')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Giao bài' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(client.calls.find(([n]) => n === 'teacher_create_assignment')?.[1]).toMatchObject({ p_exam_mode: 'full', p_exam_section: null });
  });

  it('edits the note and due date of an assignment, keeping an overdue date that was not touched', async () => {
    const user = userEvent.setup();
    roster = teacherRoster({
      class: teacherClass({ assignment_count: 1 }),
      assignments: [teacherAssignment({ id: '7c000000-0000-4000-8000-0000000000a1', title: 'Bài cũ', note: 'Ghi chú cũ', due_at: '2020-01-01T10:00:00Z', completed_count: 0, member_count: 1 })],
    });
    renderTeacher(`/giao-vien/lop/${CLASS_ID}`);
    await user.click(await screen.findByRole('button', { name: 'Sửa bài giao Bài cũ' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sửa bài giao' });
    const note = within(dialog).getByLabelText(/Lời nhắn cho học viên/);
    expect(note).toHaveValue('Ghi chú cũ');
    await user.clear(note);
    await user.type(note, '  Nộp   sớm nhé ');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // The overdue due date was not touched, so it is not sent.
    expect(client.calls.find(([n]) => n === 'teacher_update_assignment')?.[1]).toEqual({
      p_assignment_id: '7c000000-0000-4000-8000-0000000000a1',
      p_note: 'Nộp sớm nhé',
      p_closed: false,
      p_due_at: null,
      p_set_due: false,
    });
    expect(await screen.findByText('Nộp sớm nhé')).toBeInTheDocument();
  });

  it('sets, refuses and clears a due date', async () => {
    const user = userEvent.setup();
    roster = teacherRoster({
      class: teacherClass({ assignment_count: 1 }),
      assignments: [teacherAssignment({ id: '7c000000-0000-4000-8000-0000000000a1', title: 'Bài A', due_at: '2099-01-01T10:00:00Z', completed_count: 0, member_count: 1 })],
    });
    renderTeacher(`/giao-vien/lop/${CLASS_ID}`);
    await user.click(await screen.findByRole('button', { name: 'Sửa bài giao Bài A' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sửa bài giao' });
    const due = within(dialog).getByLabelText('Hạn hoàn thành');
    // A day in the past is refused before any request.
    fireEvent.change(due, { target: { value: '2020-02-02' } });
    await user.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));
    expect(await within(dialog).findByText(/Hạn nộp cần ở tương lai/)).toBeInTheDocument();
    expect(client.calls.some(([n]) => n === 'teacher_update_assignment')).toBe(false);
    // Clearing the date removes the deadline.
    fireEvent.change(due, { target: { value: '' } });
    await user.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(client.calls.find(([n]) => n === 'teacher_update_assignment')?.[1]).toMatchObject({ p_set_due: true, p_due_at: null });
    expect(await screen.findByText('Không đặt hạn')).toBeInTheDocument();
  });

  it('keeps the dialog open with the reason when an edit is refused', async () => {
    const user = userEvent.setup();
    roster = teacherRoster({
      class: teacherClass({ assignment_count: 1 }),
      assignments: [teacherAssignment({ id: '7c000000-0000-4000-8000-0000000000a1', title: 'Bài A', completed_count: 0 })],
    });
    renderTeacher(`/giao-vien/lop/${CLASS_ID}`);
    await user.click(await screen.findByRole('button', { name: 'Sửa bài giao Bài A' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sửa bài giao' });
    // The mock refuses this note with invalid_due: no raw code reaches the screen.
    await user.type(within(dialog).getByLabelText(/Lời nhắn cho học viên/), 'bad due');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Hạn nộp cần ở tương lai');
    expect(within(dialog).getByRole('alert')).not.toHaveTextContent('invalid_due');
  });

  it('closes an assignment after confirmation, then reopens it, and filters open and closed', async () => {
    const user = userEvent.setup();
    roster = teacherRoster({
      class: teacherClass({ assignment_count: 2 }),
      assignments: [
        teacherAssignment({ id: '7c000000-0000-4000-8000-0000000000a1', title: 'Bài A', completed_count: 0, member_count: 1 }),
        teacherAssignment({ id: '7c000000-0000-4000-8000-0000000000a2', title: 'Bài B', completed_count: 1, member_count: 1 }),
      ],
    });
    renderTeacher(`/giao-vien/lop/${CLASS_ID}`);
    // Nothing is closed yet: no filter.
    expect(await screen.findByRole('heading', { level: 3, name: 'Bài A' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Lọc bài giao' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Đóng bài giao Bài A' }));
    const dialog = await screen.findByRole('dialog', { name: 'Đóng bài giao này?' });
    expect(dialog).toHaveTextContent('không được tính');
    await user.click(within(dialog).getByRole('button', { name: 'Đóng bài' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(client.calls.find(([n]) => n === 'teacher_update_assignment')?.[1]).toMatchObject({ p_assignment_id: '7c000000-0000-4000-8000-0000000000a1', p_closed: true });
    // Closing refetches the completion counts.
    await waitFor(() => expect(client.calls.filter(([n]) => n === 'teacher_class_roster').length).toBeGreaterThan(1));

    // The closed one leaves the default "Đang mở" list.
    const filter = await screen.findByRole('radiogroup', { name: 'Lọc bài giao' });
    expect(within(filter).getByRole('radio', { name: 'Đang mở (1)' })).toBeChecked();
    expect(screen.queryByRole('heading', { level: 3, name: 'Bài A' })).not.toBeInTheDocument();
    await user.click(within(filter).getByRole('radio', { name: 'Đã đóng (1)' }));
    expect(await screen.findByRole('heading', { level: 3, name: 'Bài A' })).toBeInTheDocument();
    expect(screen.getByText('Đã đóng', { selector: 'span' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mở lại bài giao Bài A' }));
    const reopen = await screen.findByRole('dialog', { name: 'Mở lại bài giao này?' });
    await user.click(within(reopen).getByRole('button', { name: 'Mở lại' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(client.calls.filter(([n]) => n === 'teacher_update_assignment').at(-1)?.[1]).toMatchObject({ p_closed: false });
  });

  it('exports the assignment table as CSV', async () => {
    const user = userEvent.setup();
    roster = teacherRoster({
      class: teacherClass({ assignment_count: 1 }),
      assignments: [teacherAssignment({ id: '7c000000-0000-4000-8000-0000000000a1', title: 'Bài A', completed_count: 1, member_count: 2, note: 'riêng tư' })],
    });
    renderTeacher(`/giao-vien/lop/${CLASS_ID}`);
    await screen.findByRole('heading', { level: 3, name: 'Bài A' });
    const section = screen.getByRole('region', { name: /Bài đã giao/ });
    await user.click(within(section).getByRole('button', { name: 'Xuất CSV' }));
    const [text, fileName] = mocks.download.mock.calls[0] as [string, string];
    expect(fileName).toMatch(/^lop-.*-bai-giao-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(text).toContain('Bài A');
    expect(text).not.toContain('riêng tư');
  });

  it('disables edit and close in an archived class but still allows deleting', async () => {
    roster = teacherRoster({
      class: teacherClass({ archived_at: '2026-10-16T00:00:00Z', assignment_count: 1 }),
      assignments: [teacherAssignment({ id: '7c000000-0000-4000-8000-0000000000a1', title: 'Bài A' })],
    });
    renderTeacher(`/giao-vien/lop/${CLASS_ID}`);
    expect(await screen.findByRole('button', { name: 'Sửa bài giao Bài A' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Đóng bài giao Bài A' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Xoá bài giao Bài A' })).toBeEnabled();
  });

  describe('class summary table', () => {
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        rosterMember({
          user_id: `7c000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
          display_name: `Học viên ${String(i + 1).padStart(3, '0')}`,
          streak_current: i % 7,
          minutes_7d: i === 3 ? 0 : 10 + i,
          lessons_completed_7d: i === 3 ? 0 : 1,
          assignments_done: i % 2,
          assignments_total: 1,
        }),
      );

    it('searches by name ignoring accents, filters, sorts, and clears everything at once', async () => {
      const user = userEvent.setup();
      roster = teacherRoster({
        class: teacherClass({ member_count: 4 }),
        members: [
          rosterMember({ user_id: '7c000000-0000-4000-8000-0000000000f1', display_name: 'Nguyễn Văn An', streak_current: 2, minutes_7d: 30 }),
          rosterMember({ user_id: '7c000000-0000-4000-8000-0000000000f2', display_name: 'Trần Thị Bình', streak_current: 9, minutes_7d: 0, lessons_completed_7d: 0 }),
          rosterMember({ user_id: '7c000000-0000-4000-8000-0000000000f3', display_name: 'Đỗ Cường', streak_current: 5, minutes_7d: 90 }),
          rosterMember({ user_id: '7c000000-0000-4000-8000-0000000000f4', display_name: 'Lê Dung', has_path: false, streak_current: 0, minutes_7d: 0, lessons_completed_7d: 0 }),
        ],
      });
      renderTeacher(`/giao-vien/lop/${CLASS_ID}`);
      const names = () => within(screen.getByRole('table')).getAllByRole('rowheader').map((h) => h.querySelector('span')?.textContent);
      await screen.findByRole('table');
      expect(names()).toEqual(['Đỗ Cường', 'Lê Dung', 'Nguyễn Văn An', 'Trần Thị Bình']);

      fireEvent.change(screen.getByLabelText('Tìm học viên'), { target: { value: 'binh' } });
      expect(names()).toEqual(['Trần Thị Bình']);
      expect(screen.getByText(/1 trên 4 học viên khớp/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));
      expect(names()).toHaveLength(4);

      await user.selectOptions(screen.getByLabelText('Lọc'), 'Không học trong 7 ngày');
      expect(names()).toEqual(['Lê Dung', 'Trần Thị Bình']);
      await user.selectOptions(screen.getByLabelText('Lọc'), 'Chưa có lộ trình của lớp');
      expect(names()).toEqual(['Lê Dung']);

      await user.selectOptions(screen.getByLabelText('Lọc'), 'Tất cả học viên');
      await user.selectOptions(screen.getByLabelText('Sắp xếp'), 'Chuỗi ngày dài nhất');
      expect(names()).toEqual(['Trần Thị Bình', 'Đỗ Cường', 'Nguyễn Văn An', 'Lê Dung']);

      fireEvent.change(screen.getByLabelText('Tìm học viên'), { target: { value: 'khong co ai' } });
      expect(screen.getByText('Không có học viên nào khớp.')).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('shows a big class 25 at a time', async () => {
      const user = userEvent.setup();
      roster = teacherRoster({ class: teacherClass({ member_count: 60 }), members: many(60) });
      renderTeacher(`/giao-vien/lop/${CLASS_ID}`);
      const rows = () => within(screen.getByRole('table')).getAllByRole('rowheader');
      await screen.findByRole('table');
      expect(rows()).toHaveLength(25);
      expect(screen.getByRole('heading', { level: 2, name: 'Học viên (60)' })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Hiện thêm 25 học viên' }));
      expect(rows()).toHaveLength(50);
      await user.click(screen.getByRole('button', { name: 'Hiện thêm 10 học viên' }));
      expect(rows()).toHaveLength(60);
      expect(screen.queryByRole('button', { name: /Hiện thêm/ })).not.toBeInTheDocument();
      // A search starts again from the first page.
      fireEvent.change(screen.getByLabelText('Tìm học viên'), { target: { value: 'hoc vien 05' } });
      expect(rows().length).toBeGreaterThan(0);
      expect(rows().length).toBeLessThanOrEqual(25);
    });

    it('exports every member as CSV (aggregates only) even while a filter is on', async () => {
      const user = userEvent.setup();
      roster = teacherRoster({ class: teacherClass({ name: 'Lớp Nhật N5', language_code: 'ja', member_count: 3 }), members: many(3) });
      renderTeacher(`/giao-vien/lop/${CLASS_ID}`);
      await screen.findByRole('table');
      fireEvent.change(screen.getByLabelText('Tìm học viên'), { target: { value: '001' } });
      await user.click(screen.getByRole('button', { name: 'Xuất CSV' }));
      const [text, fileName, type] = mocks.download.mock.calls[0] as [string, string, string];
      expect(fileName).toMatch(/^lop-lớp-nhật-n5-hoc-vien-\d{4}-\d{2}-\d{2}\.csv$/);
      expect(type).toContain('text/csv');
      expect(text.split('\r\n').filter(Boolean)).toHaveLength(4);
      expect(text).toContain('Học viên 003');
      expect(text).not.toMatch(/@|7c000000/);
    });

    it('does not offer search or export for an empty class', async () => {
      roster = teacherRoster({ class: teacherClass({ member_count: 0 }), members: [] });
      renderTeacher(`/giao-vien/lop/${CLASS_ID}`);
      expect(await screen.findByText(/Chưa có học viên nào/)).toBeInTheDocument();
      expect(screen.queryByLabelText('Tìm học viên')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Xuất CSV' })).not.toBeInTheDocument();
    });
  });

  it('shows a not-found page for a class that is not the teacher’s', async () => {
    renderTeacher('/giao-vien/lop/7c000000-0000-4000-8000-0000000000ff');
    expect(await screen.findByRole('heading', { level: 1, name: 'Không tìm thấy lớp' })).toBeInTheDocument();
  });
});
