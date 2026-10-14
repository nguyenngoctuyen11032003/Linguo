import { describe, expect, it } from 'vitest';
import { fakeClient } from '../../../tests/unit/fake-supabase';
import { aiTaskTable, analyticsTotals, formatMs, formatShare, funnelRows, getAiUsage, getAnalytics, parseAnalyticsRange } from './analytics';
import { aiUsageFixture, analyticsFixture } from './content-fixtures';

describe('analytics RPCs', () => {
  it('passes the range and validates the aggregates', async () => {
    const client = fakeClient({}, { admin_analytics: { data: analyticsFixture(7) }, admin_ai_usage: { data: aiUsageFixture(7) } });
    await expect(getAnalytics(client, 7)).resolves.toMatchObject({ days: 7, wau: 42 });
    await expect(getAiUsage(client, 7)).resolves.toMatchObject({ cache_hit_rate: 0.375 });
    expect(client.rpcCalls).toEqual([
      ['admin_analytics', { p_days: 7 }],
      ['admin_ai_usage', { p_days: 7 }],
    ]);
  });

  it('rejects payloads carrying unexpected shapes', async () => {
    const client = fakeClient({}, { admin_analytics: { data: { days: 7, daily: [{ day: '2026-10-01', user_id: 'x' }] } } });
    await expect(getAnalytics(client, 7)).rejects.toThrow('invalid_payload');
  });
});

describe('analytics helpers', () => {
  it('parses the range, defaulting to 28', () => {
    expect(parseAnalyticsRange('90')).toBe(90);
    expect(parseAnalyticsRange('30')).toBe(28);
    expect(parseAnalyticsRange(null)).toBe(28);
  });

  it('computes funnel shares', () => {
    const rows = funnelRows(analyticsFixture().funnel);
    expect(rows.map((r) => r.count)).toEqual([100, 80, 60, 30, 15]);
    expect(rows[0]).toMatchObject({ ofStart: 1, ofPrevious: null });
    expect(rows[3]).toMatchObject({ ofStart: 0.3, ofPrevious: 0.5 });
    expect(funnelRows({ signed_up: 0, onboarded: 0, first_lesson: 0, third_lesson: 0, returned_day7: 0 })[1]).toMatchObject({ ofStart: null, ofPrevious: null });
  });

  it('pivots AI usage by task, ok first', () => {
    const { statuses, rows } = aiTaskTable(aiUsageFixture().by_task);
    expect(statuses).toEqual(['ok', 'error']);
    expect(rows[0]).toEqual({ task: 'explain_concept', total: 123, byStatus: { ok: 120, error: 3 } });
    expect(rows[1]?.task).toBe('analyze_error');
  });

  it('totals the daily rows and formats numbers', () => {
    expect(analyticsTotals(analyticsFixture(3).daily)).toEqual({ lessons: 63, reviews: 15, exams: 1, peakDau: 12 });
    expect(formatShare(0.4567)).toBe('46%');
    expect(formatShare(null)).toBe('—');
    expect(formatMs(null)).toBe('—');
    expect(formatMs(820)).toBe('820 ms');
  });
});
