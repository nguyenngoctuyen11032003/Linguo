import { describe, expect, it } from 'vitest';
import { TEACHER_ERROR_CODES } from '@linguo/shared';
import { GENERIC_ERROR_MESSAGE } from '@/lib/error-fallback';
import { LESSON_ID, learnerAssignment } from './class-fixtures';
import { CLASS_NETWORK_MESSAGE, classErrorMessage } from './error-map';
import { assignmentAction, assignmentLink, assignmentStatus, assignmentTitle, formatDue, formatJoined, joinedMessage } from './labels';

describe('assignment labels', () => {
  it('names each kind', () => {
    expect(assignmentTitle(learnerAssignment())).toBe('Chào hỏi cơ bản');
    expect(assignmentTitle(learnerAssignment({ kind: 'review', ref_id: null, title: null, target_count: 30 }))).toBe('Ôn 30 thẻ');
    expect(assignmentTitle(learnerAssignment({ kind: 'exam', title: null }))).toBe('Đề luyện thi');
    expect(assignmentTitle(learnerAssignment({ title: null }))).toBe('Bài học');
  });

  it('links lessons directly, exams to the assigned form in the hub and reviews to the review page', () => {
    expect(assignmentLink(learnerAssignment())).toBe(`/app/hoc-tap/bai/${LESSON_ID}`);
    expect(assignmentLink(learnerAssignment({ kind: 'exam' }))).toBe(`/app/luyen-thi?de=${LESSON_ID}`);
    expect(assignmentLink(learnerAssignment({ kind: 'exam', ref_id: null }))).toBe('/app/luyen-thi');
    expect(assignmentLink(learnerAssignment({ kind: 'review', ref_id: null }))).toBe('/app/on-tap');
  });

  it('words the action and status by state', () => {
    expect(assignmentAction(learnerAssignment())).toBe('Làm bài');
    expect(assignmentAction(learnerAssignment({ state: 'done' }))).toBe('Học lại');
    expect(assignmentAction(learnerAssignment({ kind: 'review' }))).toBe('Ôn ngay');
    expect(assignmentAction(learnerAssignment({ kind: 'exam' }))).toBe('Làm đề');
    expect(assignmentAction(learnerAssignment({ kind: 'exam', state: 'done' }))).toBe('Làm lại đề');
    expect(assignmentStatus(learnerAssignment())).toBe('Chưa làm');
    expect(assignmentStatus(learnerAssignment({ state: 'overdue' }))).toBe('Quá hạn');
    expect(assignmentStatus(learnerAssignment({ state: 'done' }))).toBe('Đã xong');
    const review = learnerAssignment({ kind: 'review', ref_id: null, title: null, target_count: 20, progress_count: 7 });
    expect(assignmentStatus(review)).toBe('Đã ôn 7/20');
    expect(assignmentStatus({ ...review, state: 'overdue' })).toBe('Quá hạn · Đã ôn 7/20');
  });

  it('formats the due date in the learner zone and handles no due date', () => {
    expect(formatDue(null, 'Asia/Ho_Chi_Minh')).toBe('Không có hạn');
    expect(formatDue('not a date', 'Asia/Ho_Chi_Minh')).toBe('Không có hạn');
    // 13:00 UTC is 20:00 in Hanoi, 22:00 in Seoul.
    expect(formatDue('2026-10-20T13:00:00Z', 'Asia/Ho_Chi_Minh')).toMatch(/^Hạn: .*20:00/);
    expect(formatDue('2026-10-20T13:00:00Z', 'Asia/Seoul')).toMatch(/22:00/);
    expect(formatJoined('2026-10-10T20:00:00Z', 'Asia/Ho_Chi_Minh')).toBe('11/10/2026');
  });

  it('words the join toast', () => {
    expect(joinedMessage({ name: 'Lớp A' }, false)).toBe('Đã vào lớp Lớp A. Chào mừng bạn!');
    expect(joinedMessage({ name: 'Lớp A' }, true)).toBe('Bạn đã ở trong lớp Lớp A rồi.');
  });
});

describe('classErrorMessage', () => {
  it('has a Vietnamese message for every teacher RPC code', () => {
    for (const code of TEACHER_ERROR_CODES) {
      const message = classErrorMessage({ message: code, code: 'P0001' });
      expect(message, code).not.toBe(GENERIC_ERROR_MESSAGE);
      expect(message, code).not.toContain(code);
    }
  });

  it('explains network failures and never shows a raw code', () => {
    expect(classErrorMessage(new TypeError('Failed to fetch'))).toBe(CLASS_NETWORK_MESSAGE);
    expect(classErrorMessage({ message: 'TypeError: Failed to fetch', code: '' })).toBe(CLASS_NETWORK_MESSAGE);
    expect(classErrorMessage({ message: 'some_new_code', code: 'P0001' })).toBe(GENERIC_ERROR_MESSAGE);
    expect(classErrorMessage({ message: 'boom', code: '23505' })).toBe(GENERIC_ERROR_MESSAGE);
    expect(classErrorMessage(null)).toBe(GENERIC_ERROR_MESSAGE);
    expect(classErrorMessage(new Error('invalid_payload'))).toContain('không hợp lệ');
  });
});
