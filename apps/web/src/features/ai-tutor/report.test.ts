import { describe, expect, it } from 'vitest';
import { fakeClient } from '../../../tests/unit/fake-supabase';
import { USAGE_ID } from './ai-fixtures';
import { reportAiResponse } from './report';

const REPORT_ID = '60000000-0000-4000-8000-000000000001';

describe('reportAiResponse', () => {
  it('calls ai_report with a trimmed note', async () => {
    const client = fakeClient({}, { ai_report: { data: REPORT_ID } });
    expect(await reportAiResponse(client, { usageId: USAGE_ID, reason: 'wrong', note: '  sai nghĩa  ' })).toBe(REPORT_ID);
    await reportAiResponse(client, { usageId: USAGE_ID, reason: 'unclear', note: '   ' });
    await reportAiResponse(client, { usageId: USAGE_ID, reason: 'other' });
    expect(client.rpcCalls).toEqual([
      ['ai_report', { p_usage_id: USAGE_ID, p_reason: 'wrong', p_note: 'sai nghĩa' }],
      ['ai_report', { p_usage_id: USAGE_ID, p_reason: 'unclear', p_note: null }],
      ['ai_report', { p_usage_id: USAGE_ID, p_reason: 'other', p_note: null }],
    ]);
  });

  it('validates locally', async () => {
    const client = fakeClient({}, { ai_report: { data: REPORT_ID } });
    await expect(reportAiResponse(client, { usageId: USAGE_ID, reason: 'spam' as never })).rejects.toThrow('invalid_reason');
    await expect(reportAiResponse(client, { usageId: USAGE_ID, reason: 'wrong', note: 'x'.repeat(501) })).rejects.toThrow('invalid_note');
    expect(client.rpcCalls).toEqual([]);
  });

  it('rethrows the supabase error and rejects a bad payload', async () => {
    const error = { message: 'usage_not_found', code: 'P0001' };
    await expect(reportAiResponse(fakeClient({}, { ai_report: { data: null, error } }), { usageId: USAGE_ID, reason: 'wrong' })).rejects.toBe(error);
    await expect(reportAiResponse(fakeClient({}, { ai_report: { data: 42 } }), { usageId: USAGE_ID, reason: 'wrong' })).rejects.toThrow(
      'invalid_payload',
    );
  });
});
