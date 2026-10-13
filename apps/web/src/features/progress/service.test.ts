import { describe, expect, it } from 'vitest';
import { fakeClient, fakeQuery } from '../../../tests/unit/fake-supabase';
import { dashboardFixture, emptyDashboardFixture, PROGRESS_PATH_ID } from './progress-fixtures';
import { getMotivationPrefs, getProgressDashboard, updateMotivationPrefs } from './service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PREFS = { show_motivation: true, analytics_opt_out: false };

describe('getProgressDashboard', () => {
  it('calls the RPC with the path and range and parses the payload', async () => {
    const client = fakeClient({}, { get_progress_dashboard: { data: dashboardFixture({ range_days: 14 }) } });
    const result = await getProgressDashboard(client, PROGRESS_PATH_ID, 14);
    expect(client.rpcCalls).toEqual([['get_progress_dashboard', { p_path_id: PROGRESS_PATH_ID, p_range_days: 14 }]]);
    expect(result.range_days).toBe(14);
    expect(result.days).toHaveLength(14);
  });

  it('accepts the empty fixture and a hidden motivation block', async () => {
    const client = fakeClient({}, { get_progress_dashboard: { data: emptyDashboardFixture({ motivation: null }) } });
    expect((await getProgressDashboard(client, PROGRESS_PATH_ID, 7)).motivation).toBeNull();
  });

  it('rejects a malformed payload', async () => {
    const client = fakeClient({}, { get_progress_dashboard: { data: { path_id: 'nope' } } });
    await expect(getProgressDashboard(client, PROGRESS_PATH_ID, 7)).rejects.toThrow('invalid_payload');
  });

  it('rethrows RPC errors', async () => {
    const error = { message: 'path_not_found', code: 'P0001' };
    const client = fakeClient({}, { get_progress_dashboard: { data: null, error } });
    await expect(getProgressDashboard(client, PROGRESS_PATH_ID, 7)).rejects.toBe(error);
  });
});

describe('getMotivationPrefs', () => {
  it('reads the two columns of the user row', async () => {
    const q = fakeQuery({ data: PREFS });
    const client = fakeClient({ user_preferences: q });
    await expect(getMotivationPrefs(client, USER_ID)).resolves.toEqual(PREFS);
    expect(q.calls).toEqual([
      ['select', ['show_motivation, analytics_opt_out']],
      ['eq', ['user_id', USER_ID]],
      ['single', []],
    ]);
  });

  it('throws on errors and invalid rows', async () => {
    const error = { message: 'boom', code: 'XX000' };
    await expect(getMotivationPrefs(fakeClient({ user_preferences: fakeQuery({ data: null, error }) }), USER_ID)).rejects.toBe(error);
    await expect(
      getMotivationPrefs(fakeClient({ user_preferences: fakeQuery({ data: { show_motivation: 'yes' } }) }), USER_ID),
    ).rejects.toThrow('invalid_payload');
  });
});

describe('updateMotivationPrefs', () => {
  it('updates only the patched columns and returns the saved row', async () => {
    const q = fakeQuery({ data: [{ show_motivation: false, analytics_opt_out: false }] });
    const client = fakeClient({ user_preferences: q });
    await expect(updateMotivationPrefs(client, USER_ID, { show_motivation: false })).resolves.toEqual({
      show_motivation: false,
      analytics_opt_out: false,
    });
    expect(q.calls).toEqual([
      ['update', [{ show_motivation: false }]],
      ['eq', ['user_id', USER_ID]],
      ['select', ['show_motivation, analytics_opt_out']],
    ]);
  });

  it('fails when no row was updated', async () => {
    const client = fakeClient({ user_preferences: fakeQuery({ data: [] }) });
    await expect(updateMotivationPrefs(client, USER_ID, { analytics_opt_out: true })).rejects.toThrow('NO_ROWS_UPDATED');
  });

  it('rethrows update errors', async () => {
    const error = { message: 'permission denied', code: '42501' };
    const client = fakeClient({ user_preferences: fakeQuery({ data: null, error }) });
    await expect(updateMotivationPrefs(client, USER_ID, { analytics_opt_out: true })).rejects.toBe(error);
  });

  it('reads the current values for an empty patch', async () => {
    const q = fakeQuery({ data: PREFS });
    await expect(updateMotivationPrefs(fakeClient({ user_preferences: q }), USER_ID, {})).resolves.toEqual(PREFS);
    expect(q.calls[0]).toEqual(['select', ['show_motivation, analytics_opt_out']]);
  });
});
