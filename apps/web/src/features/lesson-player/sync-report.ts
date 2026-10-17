import { z } from 'zod';
import { removeKey } from '@/lib/storage';

// Queued work the server refused for good (the lesson changed, the run ended, ...) or that expired unsent used to
// vanish silently. Each such event is recorded here, per user, so the sync status chip can tell the learner what did
// not make it until they dismiss it. Kept on sign-out like the outboxes and wiped with the account.

export const SYNC_REPORT_KEY_PREFIX = 'linguo-sync-report-v1:';
export const SYNC_REPORT_CHANGE_EVENT = 'linguo-sync-report-change';
const MAX_REPORTS = 50;
/** Reports older than this are discarded on read. */
const REPORT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type SyncReportKind = 'lesson' | 'review' | 'personal';

export const syncReportEntrySchema = z.object({
  id: z.string(),
  at: z.string(),
  kind: z.enum(['lesson', 'review', 'personal']),
  /** Machine code: the server's error message (`run_not_active`, ...) or `expired`. */
  reason: z.string(),
  /** How many queued items were dropped. */
  count: z.number().int().min(1),
  runId: z.string().optional(),
});
export type SyncReportEntry = z.infer<typeof syncReportEntrySchema>;

export function syncReportKey(userId: string): string {
  return `${SYNC_REPORT_KEY_PREFIX}${userId}`;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function notify(userId: string): void {
  try {
    window.dispatchEvent(new CustomEvent(SYNC_REPORT_CHANGE_EVENT, { detail: { key: syncReportKey(userId) } }));
  } catch {
    // No window.
  }
}

export function readSyncReports(userId: string, now = Date.now()): SyncReportEntry[] {
  try {
    const raw = storage()?.getItem(syncReportKey(userId));
    if (!raw) return [];
    const json: unknown = JSON.parse(raw);
    if (!Array.isArray(json)) return [];
    return json
      .flatMap((item) => {
        const parsed = syncReportEntrySchema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      })
      .filter((e) => now - Date.parse(e.at) <= REPORT_TTL_MS);
  } catch {
    return [];
  }
}

function writeSyncReports(userId: string, reports: SyncReportEntry[]): void {
  try {
    if (reports.length === 0) storage()?.removeItem(syncReportKey(userId));
    else storage()?.setItem(syncReportKey(userId), JSON.stringify(reports.slice(-MAX_REPORTS)));
  } catch {
    // Best effort: the report is a courtesy, never a reason to fail a sync.
  }
  notify(userId);
}

/** Records dropped work; consecutive reports with the same kind, reason and run are merged into one. */
export function addSyncReport(userId: string, entry: Omit<SyncReportEntry, 'id' | 'at'> & { at?: string }): void {
  const reports = readSyncReports(userId);
  const last = reports[reports.length - 1];
  if (last && last.kind === entry.kind && last.reason === entry.reason && last.runId === entry.runId) {
    reports[reports.length - 1] = { ...last, count: last.count + entry.count };
  } else {
    reports.push({ id: crypto.randomUUID(), at: entry.at ?? new Date().toISOString(), kind: entry.kind, reason: entry.reason, count: entry.count, runId: entry.runId });
  }
  writeSyncReports(userId, reports);
}

export function dismissSyncReport(userId: string, id: string): void {
  writeSyncReports(
    userId,
    readSyncReports(userId).filter((e) => e.id !== id),
  );
}

export function clearSyncReports(userId: string): void {
  removeKey(syncReportKey(userId));
  notify(userId);
}

const KIND_LABEL: Record<SyncReportKind, string> = { lesson: 'câu trả lời bài học', review: 'lượt ôn tập', personal: 'lượt ôn từ cá nhân' };

const REASON_LABEL: Record<string, string> = {
  expired: 'đã quá 7 ngày chưa gửi được',
  lesson_not_found: 'bài học không còn tồn tại',
  lesson_not_in_path: 'bài học không còn thuộc lộ trình',
  path_not_found: 'lộ trình không còn tồn tại',
  exercise_version_mismatch: 'bài tập đã được cập nhật',
  run_not_found: 'không tìm thấy lượt học',
  run_not_active: 'lượt học đã kết thúc',
  attempts_incomplete: 'còn câu chưa có kết quả',
};

/** One line for the sync status chip, e.g. “3 câu trả lời bài học không đồng bộ được: bài tập đã được cập nhật.” */
export function syncReportMessage(entry: SyncReportEntry): string {
  const why = REASON_LABEL[entry.reason];
  return `${entry.count} ${KIND_LABEL[entry.kind]} không đồng bộ được${why ? `: ${why}` : ''}.`;
}
