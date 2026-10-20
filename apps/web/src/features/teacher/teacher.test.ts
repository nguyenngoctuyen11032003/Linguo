import { TEACHER_ERROR_CODES } from '@linguo/shared';
import { describe, expect, it } from 'vitest';
import { topikIForm } from '@/features/exam/exam-fixtures';
import type { AppSupabaseClient } from '@/lib/supabase';
import { teacherErrorCode, teacherErrorMessage } from './error-map';
import { buildAssignmentsCsv, buildRosterCsv, exportFileName } from './export';
import {
  assignmentStatusLabel,
  assignmentTitle,
  examModeLabel,
  cleanClassName,
  completionPercent,
  dueDayToIso,
  expiryLabel,
  formatLocalDay,
  formatShare,
  isDueDayAllowed,
  isOverdue,
  levelLabel,
  memberName,
} from './format';
import { DEFAULT_ROSTER_VIEW, ROSTER_SORTS, isNarrowed, viewRoster } from './roster-view';
import { buildLessonCatalog, createClassAssignment, createClassInvite, fetchTeacherCatalog, updateClassAssignment } from './service';
import { CLASS_ID, EXAM_ID, LESSON_ID, MEMBER_ID, UNIT_ID, fakeTeacherClient, rosterMember, teacherAssignment, teacherInvite } from './teacher-fixtures';
import { sortAssignments } from './useClassRoster';
import { sortClasses } from './useTeacherClasses';

describe('teacherErrorMessage', () => {
  it.each(TEACHER_ERROR_CODES)('maps %s to Vietnamese copy without the raw code', (code) => {
    const message = teacherErrorMessage({ message: code, code: 'P0001' });
    expect(message).not.toContain(code);
    expect(message.length).toBeGreaterThan(10);
  });

  it('falls back to the generic message for unknown codes and prototype keys', () => {
    expect(teacherErrorMessage({ message: 'something_else' })).toMatch(/Có lỗi xảy ra/);
    expect(teacherErrorMessage({ message: 'toString' })).toMatch(/Có lỗi xảy ra/);
    expect(teacherErrorCode({ message: 'constructor' })).toBeNull();
  });

  it('explains network failures', () => {
    expect(teacherErrorMessage(new TypeError('Failed to fetch'))).toMatch(/Không kết nối được máy chủ/);
  });
});

describe('format helpers', () => {
  it('turns a picked day into the end of that local day and checks the server window', () => {
    const iso = dueDayToIso('2026-10-20');
    expect(iso).not.toBeNull();
    const date = new Date(iso ?? '');
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes()]).toEqual([2026, 9, 20, 23, 59]);
    const now = new Date(2026, 9, 16, 12, 0);
    expect(isDueDayAllowed('2026-10-16', now)).toBe(true);
    expect(isDueDayAllowed('2026-10-15', now)).toBe(false);
    expect(isDueDayAllowed('2028-01-01', now)).toBe(false);
    expect(isDueDayAllowed('nope', now)).toBe(false);
    expect(dueDayToIso('2026-1-2')).toBeNull();
  });

  it('formats shares, completion and local days', () => {
    expect(formatShare(null)).toBe('—');
    expect(formatShare(0.826)).toBe('83%');
    expect(completionPercent(0, 0)).toBe(0);
    expect(completionPercent(3, 4)).toBe(75);
    expect(completionPercent(5, 4)).toBe(100);
    expect(formatLocalDay('2026-10-15')).toBe('15/10/2026');
  });

  it('labels expiry and overdue relative to now', () => {
    const now = new Date('2026-10-16T00:00:00Z');
    expect(expiryLabel('2026-10-15T00:00:00Z', now)).toBe('đã hết hạn');
    expect(expiryLabel('2026-10-16T00:30:00Z', now)).toBe('còn dưới 1 giờ');
    expect(expiryLabel('2026-10-16T05:00:00Z', now)).toBe('còn 5 giờ');
    expect(expiryLabel('2026-10-19T01:00:00Z', now)).toBe('còn 3 ngày');
    expect(isOverdue(null, now)).toBe(false);
    expect(isOverdue('2026-10-15T00:00:00Z', now)).toBe(true);
  });

  it('names assignments, members, classes and levels', () => {
    expect(assignmentTitle({ kind: 'review', title: null, target_count: 30 })).toBe('Ôn 30 thẻ');
    expect(assignmentTitle({ kind: 'lesson', title: null, target_count: null })).toBe('Bài học không còn khả dụng');
    expect(assignmentTitle({ kind: 'exam', title: 'TOPIK I', target_count: null })).toBe('TOPIK I');
    expect(memberName({ display_name: '  ' })).toBe('Học viên chưa đặt tên');
    expect(cleanClassName('  Lớp   A \n')).toBe('Lớp A');
    expect(levelLabel('topik1')).toBe('TOPIK 1');
    expect(levelLabel('x9')).toBe('X9');
  });

  it('sorts classes (active first, newest first) and assignments (due first, undated last)', () => {
    const a = { id: 'a', archived_at: null, created_at: '2026-10-01' };
    const b = { id: 'b', archived_at: '2026-10-10', created_at: '2026-10-09' };
    const c = { id: 'c', archived_at: null, created_at: '2026-10-05' };
    expect(sortClasses([a, b, c] as never).map((x) => x.id)).toEqual(['c', 'a', 'b']);
    const list = [
      teacherAssignment({ id: '1', due_at: null, created_at: '2026-10-01' }),
      teacherAssignment({ id: '2', due_at: '2026-10-30T00:00:00Z' }),
      teacherAssignment({ id: '3', due_at: '2026-10-20T00:00:00Z' }),
    ];
    expect(sortAssignments(list).map((x) => x.id)).toEqual(['3', '2', '1']);
  });
});

describe('teacher service', () => {
  it('sends p_-prefixed arguments for each assignment kind', async () => {
    const client = fakeTeacherClient(() => ({ data: teacherAssignment() }));
    const c = client as unknown as AppSupabaseClient;
    await createClassAssignment(c, CLASS_ID, { kind: 'lesson', ref_id: LESSON_ID, due_at: '2026-10-20T16:59:00Z', note: 'Làm kỹ nhé' });
    await createClassAssignment(c, CLASS_ID, { kind: 'review', target_count: 20 });
    await createClassAssignment(c, CLASS_ID, { kind: 'exam', ref_id: EXAM_ID });
    await createClassAssignment(c, CLASS_ID, { kind: 'exam', ref_id: EXAM_ID, exam_mode: 'full' });
    await createClassAssignment(c, CLASS_ID, { kind: 'exam', ref_id: EXAM_ID, exam_mode: 'section', exam_section: 'reading' });
    // A section without the section mode is dropped, and no exam mode ever goes with a lesson.
    await createClassAssignment(c, CLASS_ID, { kind: 'exam', ref_id: EXAM_ID, exam_mode: 'full', exam_section: 'reading' });
    const none = { p_exam_mode: null, p_exam_section: null };
    expect(client.calls).toEqual([
      [
        'teacher_create_assignment',
        { p_class_id: CLASS_ID, p_kind: 'lesson', p_ref_id: LESSON_ID, p_target_count: null, p_due_at: '2026-10-20T16:59:00Z', p_note: 'Làm kỹ nhé', ...none },
      ],
      ['teacher_create_assignment', { p_class_id: CLASS_ID, p_kind: 'review', p_ref_id: null, p_target_count: 20, p_due_at: null, p_note: null, ...none }],
      ['teacher_create_assignment', { p_class_id: CLASS_ID, p_kind: 'exam', p_ref_id: EXAM_ID, p_target_count: null, p_due_at: null, p_note: null, ...none }],
      [
        'teacher_create_assignment',
        { p_class_id: CLASS_ID, p_kind: 'exam', p_ref_id: EXAM_ID, p_target_count: null, p_due_at: null, p_note: null, p_exam_mode: 'full', p_exam_section: null },
      ],
      [
        'teacher_create_assignment',
        { p_class_id: CLASS_ID, p_kind: 'exam', p_ref_id: EXAM_ID, p_target_count: null, p_due_at: null, p_note: null, p_exam_mode: 'section', p_exam_section: 'reading' },
      ],
      [
        'teacher_create_assignment',
        { p_class_id: CLASS_ID, p_kind: 'exam', p_ref_id: EXAM_ID, p_target_count: null, p_due_at: null, p_note: null, p_exam_mode: 'full', p_exam_section: null },
      ],
    ]);
  });

  it('updates an assignment with p_-prefixed arguments and validates the answer', async () => {
    const closed = teacherAssignment({ closed_at: '2026-10-20T00:00:00Z' });
    const client = fakeTeacherClient(() => ({ data: closed }));
    const c = client as unknown as AppSupabaseClient;
    await expect(updateClassAssignment(c, closed.id, { note: 'Đã sửa', closed: true })).resolves.toMatchObject({ closed_at: '2026-10-20T00:00:00Z' });
    await updateClassAssignment(c, closed.id, { note: null, closed: false, set_due: true, due_at: '2026-11-01T16:59:00Z' });
    await updateClassAssignment(c, closed.id, { note: null, closed: false, set_due: true, due_at: null });
    expect(client.calls).toEqual([
      ['teacher_update_assignment', { p_assignment_id: closed.id, p_note: 'Đã sửa', p_closed: true, p_due_at: null, p_set_due: false }],
      ['teacher_update_assignment', { p_assignment_id: closed.id, p_note: null, p_closed: false, p_due_at: '2026-11-01T16:59:00Z', p_set_due: true }],
      ['teacher_update_assignment', { p_assignment_id: closed.id, p_note: null, p_closed: false, p_due_at: null, p_set_due: true }],
    ]);
    const bad = fakeTeacherClient(() => ({ data: { id: 1 } }));
    await expect(updateClassAssignment(bad as unknown as AppSupabaseClient, closed.id, { note: null, closed: false })).rejects.toThrow('invalid_payload');
  });

  it('creates invites and rejects malformed payloads', async () => {
    const ok = fakeTeacherClient(() => ({ data: teacherInvite() }));
    await expect(createClassInvite(ok as unknown as AppSupabaseClient, CLASS_ID, { expires_hours: 24, max_uses: 30 })).resolves.toMatchObject({ code: 'ABCDEFGH' });
    expect(ok.calls[0]).toEqual(['teacher_create_invite', { p_class_id: CLASS_ID, p_expires_hours: 24, p_max_uses: 30 }]);
    const bad = fakeTeacherClient(() => ({ data: { code: 1 } }));
    await expect(createClassInvite(bad as unknown as AppSupabaseClient, CLASS_ID, { expires_hours: 24, max_uses: null })).rejects.toThrow('invalid_payload');
  });

  it('orders the lesson catalog by level, unit and position with group labels', () => {
    const units = [
      { id: 'u2', title: 'Gia đình', order_index: 2 },
      { id: 'u1', title: 'Chào hỏi', order_index: 1 },
    ];
    const lessons = [
      { id: 'l3', title: 'Bài B1', level_code: 'b1', order_index: 1, unit_id: 'u1' },
      { id: 'l2', title: 'Gia đình 1', level_code: 'a1', order_index: 1, unit_id: 'u2' },
      { id: 'l1b', title: 'Chào 2', level_code: 'a1', order_index: 2, unit_id: 'u1' },
      { id: 'l1a', title: 'Chào 1', level_code: 'a1', order_index: 1, unit_id: 'u1' },
    ];
    expect(buildLessonCatalog('en', lessons, units, levelLabel)).toEqual([
      { id: 'l1a', title: 'Chào 1', group: 'A1 · Chào hỏi' },
      { id: 'l1b', title: 'Chào 2', group: 'A1 · Chào hỏi' },
      { id: 'l2', title: 'Gia đình 1', group: 'A1 · Gia đình' },
      { id: 'l3', title: 'Bài B1', group: 'B1 · Chào hỏi' },
    ]);
  });

  it('reads the published catalog of a language', async () => {
    const client = fakeTeacherClient(() => ({}), {
      lessons: [{ id: LESSON_ID, title: { vi: 'Chào hỏi', en: 'Greetings' }, level_code: 'a1', order_index: 1, unit_id: UNIT_ID }],
      units: [{ id: UNIT_ID, title: { vi: 'Làm quen' }, order_index: 1 }],
    });
    // The exam forms come from list_exam_forms (published forms of the language with the sections that have questions).
    const withExams = fakeTeacherClient(
      (name) =>
        name === 'list_exam_forms'
          ? {
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
                    { section: 'writing', question_count: 0, minutes: null },
                  ],
                }),
              ],
            }
          : {},
      {
        lessons: [{ id: LESSON_ID, title: { vi: 'Chào hỏi', en: 'Greetings' }, level_code: 'a1', order_index: 1, unit_id: UNIT_ID }],
        units: [{ id: UNIT_ID, title: { vi: 'Làm quen' }, order_index: 1 }],
      },
    );
    const catalog = await fetchTeacherCatalog(withExams as unknown as AppSupabaseClient, 'en', levelLabel);
    expect(withExams.calls[0]).toEqual(['list_exam_forms', { p_language: 'en' }]);
    expect(catalog).toEqual({
      lessons: [{ id: LESSON_ID, title: 'Chào hỏi', group: 'A1 · Làm quen' }],
      exams: [{ id: EXAM_ID, title: 'CEFR A2 mô phỏng', sections: ['listening', 'reading'] }],
    });
    void client;
  });
});

describe('assignment labels', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  const base = { closed_at: null, due_at: null, completed_count: 1, member_count: 3 };

  it('says how an exam assignment is to be taken', () => {
    expect(examModeLabel({ exam_mode: null, exam_section: null })).toBe('Học viên tự chọn cách làm');
    expect(examModeLabel({ exam_mode: 'full', exam_section: null })).toBe('Làm trọn đề');
    expect(examModeLabel({ exam_mode: 'section', exam_section: 'listening' })).toBe('Làm phần Nghe');
    expect(examModeLabel({ exam_mode: 'section', exam_section: 'writing' })).toBe('Làm phần Viết');
  });

  it('labels an assignment as closed, overdue with who is missing, or open', () => {
    expect(assignmentStatusLabel({ ...base, closed_at: '2026-10-19T00:00:00Z', due_at: '2026-10-01T00:00:00Z' }, now)).toEqual({ tone: 'closed', text: 'Đã đóng' });
    expect(assignmentStatusLabel({ ...base, due_at: '2026-10-19T00:00:00Z' }, now)).toEqual({ tone: 'overdue', text: 'Quá hạn · 2 học viên chưa nộp' });
    expect(assignmentStatusLabel({ ...base, due_at: '2026-10-19T00:00:00Z', completed_count: 3 }, now)).toEqual({ tone: 'open', text: 'Quá hạn · cả lớp đã nộp' });
    expect(assignmentStatusLabel({ ...base, due_at: '2026-10-25T00:00:00Z' }, now)).toEqual({ tone: 'open', text: 'Đang mở' });
    expect(assignmentStatusLabel(base, now)).toEqual({ tone: 'open', text: 'Đang mở' });
  });

  it('keeps open assignments before closed ones', () => {
    const list = [
      teacherAssignment({ id: 'c', closed_at: '2026-10-19T00:00:00Z', due_at: '2026-10-01T00:00:00Z' }),
      teacherAssignment({ id: 'a', due_at: '2026-10-30T00:00:00Z' }),
      teacherAssignment({ id: 'b', due_at: null }),
    ];
    expect(sortAssignments(list).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('roster view (search, filter, sort)', () => {
  const m = (id: string, over: Parameters<typeof rosterMember>[0]) => rosterMember({ user_id: id, ...over });
  const members = [
    m('u1', { display_name: 'Nguyễn Văn An', streak_current: 2, streak_best: 5, minutes_7d: 30, lessons_completed_7d: 1, last_active_day: '2026-10-19', assignments_done: 2, assignments_total: 2, reviews_due: 0, review_accuracy_30d: 0.9, joined_at: '2026-10-01T00:00:00Z' }),
    m('u2', { display_name: 'Trần Thị Bình', streak_current: 9, streak_best: 9, minutes_7d: 120, lessons_completed_7d: 4, last_active_day: '2026-10-20', assignments_done: 1, assignments_total: 2, reviews_due: 12, review_accuracy_30d: 0.5, joined_at: '2026-10-03T00:00:00Z' }),
    m('u3', { display_name: 'Đỗ Cường', has_path: false, streak_current: 0, streak_best: 0, minutes_7d: 0, lessons_completed_7d: 0, last_active_day: null, assignments_done: 0, assignments_total: 2, reviews_due: 0, review_accuracy_30d: null, joined_at: '2026-10-05T00:00:00Z' }),
    m('u4', { display_name: null, streak_current: 0, streak_best: 3, minutes_7d: 0, lessons_completed_7d: 0, last_active_day: '2026-10-02', assignments_done: 2, assignments_total: 2, reviews_due: 4, review_accuracy_30d: 0.7, joined_at: '2026-10-02T00:00:00Z' }),
  ];
  const ids = (view: Partial<typeof DEFAULT_ROSTER_VIEW>) => viewRoster(members, { ...DEFAULT_ROSTER_VIEW, ...view }).map((x) => x.user_id);

  it('lists everyone by name by default (Vietnamese collation)', () => {
    expect(ids({})).toEqual(['u3', 'u4', 'u1', 'u2']);
    expect(isNarrowed(DEFAULT_ROSTER_VIEW)).toBe(false);
  });

  it('searches names ignoring case and accents, every word in any order', () => {
    expect(ids({ query: 'binh' })).toEqual(['u2']);
    expect(ids({ query: 'TRAN bình' })).toEqual(['u2']);
    expect(ids({ query: 'van an' })).toEqual(['u1']);
    expect(ids({ query: 'do cuong' })).toEqual(['u3']);
    expect(ids({ query: 'chưa đặt tên' })).toEqual(['u4']);
    expect(ids({ query: 'zzz' })).toEqual([]);
    expect(isNarrowed({ ...DEFAULT_ROSTER_VIEW, query: '  ' })).toBe(false);
    expect(isNarrowed({ ...DEFAULT_ROSTER_VIEW, query: 'a' })).toBe(true);
  });

  it('filters by activity, unfinished assignments, missing path and due reviews', () => {
    expect(ids({ filter: 'inactive' })).toEqual(['u3', 'u4']);
    expect(ids({ filter: 'incomplete' })).toEqual(['u3', 'u2']);
    expect(ids({ filter: 'no_path' })).toEqual(['u3']);
    expect(ids({ filter: 'reviews_due' })).toEqual(['u4', 'u2']);
    expect(ids({ filter: 'incomplete', query: 'bình' })).toEqual(['u2']);
    expect(isNarrowed({ ...DEFAULT_ROSTER_VIEW, filter: 'inactive' })).toBe(true);
  });

  it('sorts by every key, ties by name', () => {
    expect(ids({ sort: 'joined' })).toEqual(['u3', 'u2', 'u4', 'u1']);
    expect(ids({ sort: 'streak' })).toEqual(['u2', 'u1', 'u4', 'u3']);
    expect(ids({ sort: 'minutes' })).toEqual(['u2', 'u1', 'u3', 'u4']);
    expect(ids({ sort: 'last_active' })).toEqual(['u3', 'u4', 'u1', 'u2']);
    expect(ids({ sort: 'assignments' })).toEqual(['u3', 'u2', 'u4', 'u1']);
    expect(ids({ sort: 'reviews_due' })).toEqual(['u2', 'u4', 'u3', 'u1']);
    expect(ids({ sort: 'accuracy' })).toEqual(['u2', 'u4', 'u1', 'u3']);
    expect(ROSTER_SORTS.map((o) => o.value)).toHaveLength(8);
  });

  it('never mutates the members it is given', () => {
    const copy = members.map((x) => x.user_id);
    viewRoster(members, { query: '', filter: 'all', sort: 'streak' });
    expect(members.map((x) => x.user_id)).toEqual(copy);
  });

  it('treats a class with no assignments as nobody behind', () => {
    const none = [m('x1', { assignments_total: 0, assignments_done: 0 }), m('x2', { assignments_total: 2, assignments_done: 1, display_name: 'Ba' })];
    expect(viewRoster(none, { ...DEFAULT_ROSTER_VIEW, sort: 'assignments' }).map((x) => x.user_id)).toEqual(['x2', 'x1']);
    expect(viewRoster(none, { ...DEFAULT_ROSTER_VIEW, filter: 'incomplete' }).map((x) => x.user_id)).toEqual(['x2']);
  });
});

describe('class summary exports (aggregates only)', () => {
  it('writes a member table with a header, a BOM and CRLF, and nothing that identifies an account', () => {
    const csv = buildRosterCsv([
      rosterMember({ display_name: 'Lan Anh', review_accuracy_30d: 0.826, last_active_day: '2026-10-15' }),
      rosterMember({ user_id: 'zz', display_name: '=HYPERLINK("http://x")', has_path: false, review_accuracy_30d: null, last_active_day: null }),
    ]);
    expect(csv.startsWith('\ufeffHọc viên,')).toBe(true);
    expect(csv).toContain('\r\n');
    const lines = csv.slice(1).trimEnd().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(
      'Học viên,Ngày vào lớp,Có lộ trình của lớp,Chuỗi ngày hiện tại,Chuỗi ngày dài nhất,Phút học (7 ngày),Phút học (30 ngày),Học gần nhất,Bài học đã xong,Bài học xong (7 ngày),Thẻ ôn đến hạn,Lượt ôn (30 ngày),Tỉ lệ ôn đúng 30 ngày (%),Bài giao đã xong,Tổng bài giao',
    );
    expect(lines[1]).toMatch(/^Lan Anh,2026-10-1[45],Có,4,9,85,240,2026-10-15,12,3,7,60,83,1,2$/);
    // A name that looks like a formula is guarded, an empty accuracy stays empty.
    expect(lines[2]).toMatch(/^'=HYPERLINK\("http:\/\/x"\)"?,/.source ? /^"'=HYPERLINK/ : /x/);
    expect(lines[2]).toContain(',Không,');
    expect(csv).not.toContain(MEMBER_ID);
    expect(csv).not.toContain('@');
  });

  it('quotes names with commas and quotes and keeps other scripts as they are', () => {
    const csv = buildRosterCsv([rosterMember({ display_name: 'Nguyễn, "Văn" An' }), rosterMember({ user_id: 'b', display_name: '日本語 太郎' })]);
    expect(csv).toContain('"Nguyễn, ""Văn"" An",');
    expect(csv).toContain('\r\n日本語 太郎,');
  });

  it('writes an assignment table without the teacher notes', () => {
    const now = new Date('2026-10-20T12:00:00Z');
    const csv = buildAssignmentsCsv(
      [
        teacherAssignment({ id: 'a', kind: 'exam', title: 'JLPT N5', exam_mode: 'section', exam_section: 'reading', due_at: '2026-10-19T10:00:00Z', completed_count: 1, member_count: 4, note: 'riêng tư của giáo viên' }),
        teacherAssignment({ id: 'b', kind: 'review', title: null, target_count: 30, completed_count: 0, member_count: 0, closed_at: '2026-10-18T00:00:00Z' }),
      ],
      now,
    );
    const lines = csv.slice(1).trimEnd().split('\r\n');
    expect(lines[0]).toBe('Loại,Nội dung,Cách làm đề,Ngày giao,Hạn nộp,Trạng thái,Đã hoàn thành,Số học viên,Tỉ lệ hoàn thành (%)');
    expect(lines[1]).toMatch(/^Đề luyện thi,JLPT N5,Làm phần Đọc,2026-10-1[34],2026-10-(19|20),Quá hạn · 3 học viên chưa nộp,1,4,25$/);
    expect(lines[2]).toMatch(/^Ôn tập,Ôn 30 thẻ,,2026-10-1[34],,Đã đóng,0,0,$/);
    expect(csv).not.toContain('riêng tư');
  });

  it('names the file after the class, in any script, with the date', () => {
    const date = new Date(2026, 9, 20, 9, 0);
    expect(exportFileName('Lớp giao tiếp tối thứ Ba', 'hoc-vien', date)).toBe('lop-lớp-giao-tiếp-tối-thứ-ba-hoc-vien-2026-10-20.csv');
    expect(exportFileName('日本語 N5', 'bai-giao', date)).toBe('lop-日本語-n5-bai-giao-2026-10-20.csv');
    expect(exportFileName('???', 'hoc-vien', date)).toBe('lop-hoc-hoc-vien-2026-10-20.csv');
    expect(exportFileName('x'.repeat(80), 'hoc-vien', date)).toBe(`lop-${'x'.repeat(40)}-hoc-vien-2026-10-20.csv`);
  });
});
