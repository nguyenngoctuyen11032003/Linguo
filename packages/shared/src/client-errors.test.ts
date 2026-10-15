import { describe, expect, it } from 'vitest';
import { adminAnalyticsSchema } from './admin/contract';
import { ANALYTICS_EVENTS, analyticsEventSchema, clientErrorPropsSchema } from './progress/contract';

describe('client_error contract', () => {
  it('is a closed analytics event', () => {
    expect(ANALYTICS_EVENTS).toContain('client_error');
    const base = { name: 'client_error', props: { kind: 'render_error' }, at: '2026-10-16T00:00:00Z', route: '/app' };
    expect(analyticsEventSchema.safeParse(base).success).toBe(true);
  });

  it('accepts only the whitelisted props', () => {
    expect(clientErrorPropsSchema.safeParse({ kind: 'chunk_load_error', code: 'ChunkLoadError', build: '1.2.3', online: false }).success).toBe(true);
    expect(clientErrorPropsSchema.safeParse({ kind: 'nope' }).success).toBe(false);
    expect(clientErrorPropsSchema.safeParse({ kind: 'render_error', message: 'user text' }).success).toBe(false);
    expect(clientErrorPropsSchema.safeParse({ kind: 'render_error', code: 'has spaces' }).success).toBe(false);
    expect(clientErrorPropsSchema.safeParse({ kind: 'render_error', code: 'x'.repeat(61) }).success).toBe(false);
  });

  it('admin analytics carries a client_errors aggregate (empty by default)', () => {
    const base = {
      days: 7,
      daily: [],
      wau: 0,
      onboarding_completed: 0,
      funnel: { signed_up: 0, onboarded: 0, first_lesson: 0, third_lesson: 0, returned_day7: 0 },
    };
    expect(adminAnalyticsSchema.parse(base).client_errors).toEqual({ total: 0, by_kind: [], top: [] });
    const withErrors = { ...base, client_errors: { total: 2, by_kind: [{ kind: 'render_error', count: 2 }], top: [{ kind: 'render_error', route: null, count: 2 }] } };
    expect(adminAnalyticsSchema.parse(withErrors).client_errors.total).toBe(2);
  });
});
