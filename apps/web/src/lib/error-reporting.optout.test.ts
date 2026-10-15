import { afterEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/features/lesson-player/service', () => ({ callRpc: rpc }));

import { configureAnalytics, flushAnalytics } from '@/features/analytics/client';
import { reportClientError, resetErrorReportingForTests } from './error-reporting';

afterEach(() => {
  configureAnalytics({ client: null, enabled: false });
  resetErrorReportingForTests();
  rpc.mockReset();
});

const fakeClient = {} as never;

describe('client_error with the real analytics queue', () => {
  it('sends nothing when signed out or opted out', async () => {
    configureAnalytics({ client: fakeClient, enabled: false });
    reportClientError({ kind: 'render_error', error: new Error('x'), pathname: '/app' });
    await flushAnalytics();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('sends one track_events batch with a route template and whitelisted props when enabled', async () => {
    rpc.mockResolvedValue(1);
    configureAnalytics({ client: fakeClient, enabled: true });
    reportClientError({ kind: 'render_error', error: new Error('private text'), pathname: '/app/hoc-tap/bai/3f2b8c1e-1a2b-4c3d-8e9f-0123456789ab' });
    await flushAnalytics();
    expect(rpc).toHaveBeenCalledTimes(1);
    const events = rpc.mock.calls[0]![2].p_events as { name: string; props: object; route: string }[];
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ name: 'client_error', route: '/app/hoc-tap/bai/:id', props: { kind: 'render_error', code: 'Error', online: true } });
    expect(JSON.stringify(events)).not.toMatch(/private text|3f2b8c1e/);
  });
});
