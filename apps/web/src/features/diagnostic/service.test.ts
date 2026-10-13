import { describe, expect, it, vi } from 'vitest';
import { isNetworkError } from '@/lib/network-error';
import { fakeClient } from '../../../tests/unit/fake-supabase';
import { ATTEMPT_ID, PATH_ID, diagItem, diagItemId, placement, report, status, step } from './diagnostic-fixtures';
import {
  DIAGNOSTIC_RPC_TIMEOUT_MS,
  acceptPlacement,
  answerDiagnostic,
  diagnosticStatus,
  finishDiagnostic,
  skipDiagnosticSkill,
  startDiagnostic,
} from './service';

describe('diagnostic service', () => {
  it('gets the status of a path', async () => {
    const client = fakeClient({}, { diagnostic_status: { data: status() } });
    expect(await diagnosticStatus(client, PATH_ID)).toEqual(status());
    expect(client.rpcCalls).toEqual([['diagnostic_status', { p_path_id: PATH_ID }]]);
  });

  it('starts in full mode by default, or foundation', async () => {
    const client = fakeClient({}, { start_diagnostic: { data: step(diagItem(1)) } });
    expect(await startDiagnostic(client, PATH_ID)).toEqual(step(diagItem(1)));
    await startDiagnostic(client, PATH_ID, 'foundation');
    expect(client.rpcCalls).toEqual([
      ['start_diagnostic', { p_path_id: PATH_ID, p_mode: 'full' }],
      ['start_diagnostic', { p_path_id: PATH_ID, p_mode: 'foundation' }],
    ]);
  });

  it('answers with a choice or "Tôi không biết" (null), sending no timing', async () => {
    const client = fakeClient({}, { answer_diagnostic: { data: step(diagItem(2)) } });
    expect(await answerDiagnostic(client, ATTEMPT_ID, diagItemId(1), 'b')).toEqual(step(diagItem(2)));
    await answerDiagnostic(client, ATTEMPT_ID, diagItemId(2), null);
    expect(client.rpcCalls).toEqual([
      ['answer_diagnostic', { p_attempt_id: ATTEMPT_ID, p_item_id: diagItemId(1), p_choice: 'b' }],
      ['answer_diagnostic', { p_attempt_id: ATTEMPT_ID, p_item_id: diagItemId(2), p_choice: null }],
    ]);
  });

  it('skips a skill', async () => {
    const client = fakeClient({}, { skip_diagnostic_skill: { data: step(diagItem(3, { skill: 'grammar' })) } });
    await skipDiagnosticSkill(client, ATTEMPT_ID, 'vocabulary', 'too_hard');
    expect(client.rpcCalls).toEqual([['skip_diagnostic_skill', { p_attempt_id: ATTEMPT_ID, p_skill: 'vocabulary', p_reason: 'too_hard' }]]);
  });

  it('finishes and accepts', async () => {
    const client = fakeClient({}, { finish_diagnostic: { data: report() }, accept_diagnostic_placement: { data: placement() } });
    expect(await finishDiagnostic(client, ATTEMPT_ID)).toEqual(report());
    expect(await acceptPlacement(client, ATTEMPT_ID)).toEqual(placement());
    expect(client.rpcCalls).toEqual([
      ['finish_diagnostic', { p_attempt_id: ATTEMPT_ID }],
      ['accept_diagnostic_placement', { p_attempt_id: ATTEMPT_ID }],
    ]);
  });

  it('rethrows the supabase error', async () => {
    const error = { message: 'item_mismatch', code: 'P0001' };
    const client = fakeClient({}, { answer_diagnostic: { data: null, error } });
    await expect(answerDiagnostic(client, ATTEMPT_ID, diagItemId(1), 'a')).rejects.toBe(error);
  });

  it('throws invalid_payload when the response does not match the contract', async () => {
    const leaky = { ...step(diagItem(1)), item: { ...diagItem(1), prompt: { stem: 'x' } } };
    const client = fakeClient({}, { start_diagnostic: { data: leaky }, finish_diagnostic: { data: { attempt_id: ATTEMPT_ID } } });
    await expect(startDiagnostic(client, PATH_ID)).rejects.toThrow('invalid_payload');
    await expect(finishDiagnostic(client, ATTEMPT_ID)).rejects.toThrow('invalid_payload');
  });

  it('abandons a diagnostic RPC after 15 s, reported as a network failure', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const error = { message: 'AbortError: signal timed out', code: '' };
    const client = { rpc: () => ({ abortSignal: () => Promise.resolve({ data: null, error, status: 0 }) }) } as unknown as Parameters<
      typeof answerDiagnostic
    >[0];
    const thrown = await answerDiagnostic(client, ATTEMPT_ID, diagItemId(1), 'a').catch((e: unknown) => e);
    expect(DIAGNOSTIC_RPC_TIMEOUT_MS).toBe(15_000);
    expect(timeout).toHaveBeenCalledWith(DIAGNOSTIC_RPC_TIMEOUT_MS);
    expect(isNetworkError(thrown)).toBe(true);
    timeout.mockRestore();
  });
});
