import { afterEach, describe, expect, it } from 'vitest';
import { addSyncReport, clearSyncReports, dismissSyncReport, readSyncReports, syncReportKey, syncReportMessage } from './sync-report';

afterEach(() => localStorage.clear());

describe('sync report', () => {
  it('records dropped work per user, merging repeats of the same cause', () => {
    addSyncReport('u1', { kind: 'lesson', reason: 'run_not_active', count: 2, runId: 'r1' });
    addSyncReport('u1', { kind: 'lesson', reason: 'run_not_active', count: 1, runId: 'r1' });
    addSyncReport('u1', { kind: 'review', reason: 'expired', count: 4 });
    const reports = readSyncReports('u1');
    expect(reports.map((r) => [r.kind, r.reason, r.count])).toEqual([
      ['lesson', 'run_not_active', 3],
      ['review', 'expired', 4],
    ]);
    expect(readSyncReports('u2')).toEqual([]);
  });

  it('dismisses one report and clears all', () => {
    addSyncReport('u1', { kind: 'lesson', reason: 'expired', count: 1 });
    addSyncReport('u1', { kind: 'personal', reason: 'expired', count: 1 });
    const [first] = readSyncReports('u1');
    dismissSyncReport('u1', first!.id);
    expect(readSyncReports('u1').map((r) => r.kind)).toEqual(['personal']);
    clearSyncReports('u1');
    expect(localStorage.getItem(syncReportKey('u1'))).toBeNull();
  });

  it('ignores corrupt storage and reports older than 30 days', () => {
    localStorage.setItem(syncReportKey('u1'), '{not json');
    expect(readSyncReports('u1')).toEqual([]);
    localStorage.setItem(syncReportKey('u1'), JSON.stringify([{ id: 'a', at: '2020-01-01T00:00:00Z', kind: 'lesson', reason: 'expired', count: 1 }, { nope: true }]));
    expect(readSyncReports('u1')).toEqual([]);
  });

  it('words each report for the learner', () => {
    expect(syncReportMessage({ id: 'x', at: '', kind: 'lesson', reason: 'exercise_version_mismatch', count: 3 })).toBe(
      '3 câu trả lời bài học không đồng bộ được: bài tập đã được cập nhật.',
    );
    expect(syncReportMessage({ id: 'x', at: '', kind: 'review', reason: 'weird', count: 1 })).toBe('1 lượt ôn tập không đồng bộ được.');
  });
});
