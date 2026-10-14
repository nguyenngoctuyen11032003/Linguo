import {
  ADMIN_ANALYTICS_RANGES,
  adminAiUsageSchema,
  adminAnalyticsSchema,
  type AdminAiUsage,
  type AdminAnalytics,
  type AdminAnalyticsRange,
} from '@linguo/shared';
import { callRpc, parse } from '@/features/lesson-player/service';
import type { AppSupabaseClient } from '@/lib/supabase';

// Spec 11 §3–4: admin_analytics / admin_ai_usage (admin only). Aggregates only, never user ids.

export async function getAnalytics(client: AppSupabaseClient, days: AdminAnalyticsRange): Promise<AdminAnalytics> {
  return parse(adminAnalyticsSchema, await callRpc(client, 'admin_analytics', { p_days: days }));
}

export async function getAiUsage(client: AppSupabaseClient, days: AdminAnalyticsRange): Promise<AdminAiUsage> {
  return parse(adminAiUsageSchema, await callRpc(client, 'admin_ai_usage', { p_days: days }));
}

export function parseAnalyticsRange(value: string | null): AdminAnalyticsRange {
  const n = Number(value);
  return (ADMIN_ANALYTICS_RANGES as readonly number[]).includes(n) ? (n as AdminAnalyticsRange) : 28;
}

export const FUNNEL_STEPS = [
  { key: 'signed_up', label: 'Đăng ký' },
  { key: 'onboarded', label: 'Hoàn thành onboarding' },
  { key: 'first_lesson', label: 'Học bài đầu tiên' },
  { key: 'third_lesson', label: 'Học đến bài thứ 3' },
  { key: 'returned_day7', label: 'Quay lại sau 7 ngày' },
] as const satisfies readonly { key: keyof AdminAnalytics['funnel']; label: string }[];

export interface FunnelRow {
  key: keyof AdminAnalytics['funnel'];
  label: string;
  count: number;
  /** Share of the first step (0..1), null when the first step is 0. */
  ofStart: number | null;
  /** Share of the previous step (0..1), null for the first step or when the previous one is 0. */
  ofPrevious: number | null;
}

export function funnelRows(funnel: AdminAnalytics['funnel']): FunnelRow[] {
  const start = funnel.signed_up;
  return FUNNEL_STEPS.map((step, i) => {
    const count = funnel[step.key];
    const prev = i > 0 ? funnel[FUNNEL_STEPS[i - 1]!.key] : null;
    return {
      key: step.key,
      label: step.label,
      count,
      ofStart: start > 0 ? count / start : null,
      ofPrevious: prev !== null && prev > 0 ? count / prev : null,
    };
  });
}

export interface AiTaskRow {
  task: string;
  total: number;
  /** Count per status, in the order of `statuses`. */
  byStatus: Record<string, number>;
}

/** Pivots by_task into one row per task (most used first) and the list of statuses seen. */
export function aiTaskTable(byTask: AdminAiUsage['by_task']): { statuses: string[]; rows: AiTaskRow[] } {
  const statuses = [...new Set(byTask.map((r) => r.status))].sort((a, b) => (a === 'ok' ? -1 : b === 'ok' ? 1 : a.localeCompare(b)));
  const rows = new Map<string, AiTaskRow>();
  for (const r of byTask) {
    const row = rows.get(r.task) ?? { task: r.task, total: 0, byStatus: {} };
    row.byStatus[r.status] = (row.byStatus[r.status] ?? 0) + r.count;
    row.total += r.count;
    rows.set(r.task, row);
  }
  return { statuses, rows: [...rows.values()].sort((a, b) => b.total - a.total || a.task.localeCompare(b.task)) };
}

export const AI_TASK_LABELS_VI: Record<string, string> = {
  explain_concept: 'Giải thích khái niệm',
  generate_practice: 'Tạo bài luyện',
  analyze_error: 'Phân tích lỗi sai',
};

export const AI_STATUS_LABELS_VI: Record<string, string> = {
  ok: 'Thành công',
  cached: 'Từ cache',
  error: 'Lỗi',
  quota_exceeded: 'Hết hạn mức',
  ai_unavailable: 'AI không phản hồi',
  invalid_output: 'Kết quả không hợp lệ',
  bad_request: 'Yêu cầu sai',
  unauthorized: 'Chưa đăng nhập',
};

export const AI_REPORT_REASON_LABELS_VI: Record<string, string> = {
  wrong: 'Sai nội dung',
  unclear: 'Khó hiểu',
  unsafe: 'Không phù hợp',
  other: 'Khác',
};

export const labelOr = (labels: Record<string, string>, key: string) => labels[key] ?? key;

const NUMBER = new Intl.NumberFormat('vi-VN');

export function formatCount(n: number): string {
  return NUMBER.format(n);
}

/** 0.4567 → "46%"; null → "—". */
export function formatShare(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

/** 1234.5 → "1.235 ms"; null → "—". */
export function formatMs(value: number | null): string {
  return value === null ? '—' : `${NUMBER.format(Math.round(value))} ms`;
}

export function analyticsTotals(daily: AdminAnalytics['daily']) {
  return daily.reduce(
    (acc, d) => ({
      lessons: acc.lessons + d.lessons_completed,
      reviews: acc.reviews + d.review_sessions,
      exams: acc.exams + d.exam_attempts,
      peakDau: Math.max(acc.peakDau, d.dau),
    }),
    { lessons: 0, reviews: 0, exams: 0, peakDau: 0 },
  );
}
