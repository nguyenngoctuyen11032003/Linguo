import { describe, expect, it } from 'vitest';
import { fakeClient } from '../../../tests/unit/fake-supabase';
import { myReportFixture, REPORT_EXERCISE_ID, reportResultFixture } from './content-report-fixtures';
import { listMyReports, reportContent } from './service';

describe('reportContent', () => {
  it('calls report_content with the target, reason and trimmed note', async () => {
    const client = fakeClient({}, { report_content: { data: reportResultFixture() } });
    const result = await reportContent(client, {
      targetKind: 'exercise',
      targetId: REPORT_EXERCISE_ID,
      reason: 'wrong_answer',
      note: '  Đáp án phải là "I am".  ',
    });
    expect(client.rpcCalls).toEqual([
      [
        'report_content',
        { p_target_kind: 'exercise', p_target_id: REPORT_EXERCISE_ID, p_reason: 'wrong_answer', p_note: 'Đáp án phải là "I am".' },
      ],
    ]);
    expect(result).toEqual(reportResultFixture());
  });

  it('sends a blank or missing note as null and accepts a duplicate answer', async () => {
    const client = fakeClient({}, { report_content: { data: reportResultFixture({ status: 'duplicate' }) } });
    const result = await reportContent(client, { targetKind: 'learning_item', targetId: REPORT_EXERCISE_ID, reason: 'typo', note: '   ' });
    expect(client.rpcCalls[0]![1].p_note).toBeNull();
    expect(result.status).toBe('duplicate');
  });

  it('rejects a note over 500 characters without calling the server', async () => {
    const client = fakeClient({}, { report_content: { data: reportResultFixture() } });
    await expect(
      reportContent(client, { targetKind: 'exercise', targetId: REPORT_EXERCISE_ID, reason: 'other', note: 'a'.repeat(501) }),
    ).rejects.toThrow('note_too_long');
    expect(client.rpcCalls).toEqual([]);
  });

  it('rejects a malformed payload and rethrows RPC errors', async () => {
    await expect(
      reportContent(fakeClient({}, { report_content: { data: { report_id: 'x' } } }), {
        targetKind: 'exercise',
        targetId: REPORT_EXERCISE_ID,
        reason: 'other',
      }),
    ).rejects.toThrow('invalid_payload');
    const error = { message: 'rate_limited', code: 'P0001' };
    await expect(
      reportContent(fakeClient({}, { report_content: { data: null, error } }), {
        targetKind: 'exercise',
        targetId: REPORT_EXERCISE_ID,
        reason: 'other',
      }),
    ).rejects.toBe(error);
  });
});

describe('listMyReports', () => {
  it('calls list_my_reports with the limit and parses the rows', async () => {
    const rows = [myReportFixture(), myReportFixture({ id: '30000000-0000-4000-8000-0000000000bb', status: 'fixed' })];
    const client = fakeClient({}, { list_my_reports: { data: rows } });
    await expect(listMyReports(client, 20)).resolves.toEqual(rows);
    expect(client.rpcCalls).toEqual([['list_my_reports', { p_limit: 20 }]]);
  });

  it('defaults to 50, treats null as empty and rejects malformed rows', async () => {
    const client = fakeClient({}, { list_my_reports: { data: null } });
    await expect(listMyReports(client)).resolves.toEqual([]);
    expect(client.rpcCalls[0]![1]).toEqual({ p_limit: 50 });
    await expect(listMyReports(fakeClient({}, { list_my_reports: { data: [{ id: 1 }] } }))).rejects.toThrow('invalid_payload');
  });
});
