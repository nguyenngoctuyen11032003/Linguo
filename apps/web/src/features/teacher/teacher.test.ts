import { TEACHER_ERROR_CODES } from '@linguo/shared';
import { describe, expect, it } from 'vitest';
import type { AppSupabaseClient } from '@/lib/supabase';
import { teacherErrorCode, teacherErrorMessage } from './error-map';
import {
  assignmentTitle,
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
import { buildLessonCatalog, createClassAssignment, createClassInvite, fetchTeacherCatalog } from './service';
import { CLASS_ID, EXAM_ID, LESSON_ID, UNIT_ID, fakeTeacherClient, teacherAssignment, teacherInvite } from './teacher-fixtures';
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
    expect(client.calls).toEqual([
      [
        'teacher_create_assignment',
        { p_class_id: CLASS_ID, p_kind: 'lesson', p_ref_id: LESSON_ID, p_target_count: null, p_due_at: '2026-10-20T16:59:00Z', p_note: 'Làm kỹ nhé' },
      ],
      ['teacher_create_assignment', { p_class_id: CLASS_ID, p_kind: 'review', p_ref_id: null, p_target_count: 20, p_due_at: null, p_note: null }],
    ]);
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
      exam_forms: [{ id: EXAM_ID, title_vi: 'CEFR A2 mô phỏng', level_from: 'a2' }],
    });
    const catalog = await fetchTeacherCatalog(client as unknown as AppSupabaseClient, 'en', levelLabel);
    expect(catalog).toEqual({
      lessons: [{ id: LESSON_ID, title: 'Chào hỏi', group: 'A1 · Làm quen' }],
      exams: [{ id: EXAM_ID, title: 'CEFR A2 mô phỏng' }],
    });
  });
});
