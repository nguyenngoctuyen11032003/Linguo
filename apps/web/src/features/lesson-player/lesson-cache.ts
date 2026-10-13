import { readString, removeKey, writeString } from '@/lib/storage';
import { fromRunState, parseLessonPayload, parseRunState, type LessonPayload, type RunState } from './service';

/**
 * Text-only copy of the lesson being studied (spec §7.4) so it can be reopened offline. One lesson per user:
 * opening another lesson replaces it. Read through the same zod schemas as fresh RPC data.
 */

export const lessonCacheKey = (userId: string) => `linguo-lesson-cache-v1:${userId}`;

interface CachedEntry {
  lessonId: string;
  pathId: string;
  savedAt: number;
  /** Raw `get_lesson` JSON. */
  payload: unknown;
  /** Latest known run, server shape. */
  run: unknown;
}

function readEntry(userId: string): CachedEntry | null {
  const raw = readString(lessonCacheKey(userId));
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<CachedEntry> | null;
    if (!v || typeof v !== 'object' || typeof v.lessonId !== 'string' || typeof v.pathId !== 'string') return null;
    return v as CachedEntry;
  } catch {
    return null;
  }
}

export function saveLessonCache(userId: string, entry: { lessonId: string; pathId: string; payload: unknown; run: RunState }): void {
  const value: CachedEntry = { ...entry, savedAt: Date.now(), run: fromRunState(entry.run) };
  writeString(lessonCacheKey(userId), JSON.stringify(value));
}

/** Updates the cached run of this lesson (cursor, queue, confirmed gradings); ignored when another lesson is cached. */
export function updateCachedRun(userId: string, lessonId: string, pathId: string, run: RunState): void {
  const entry = readEntry(userId);
  if (!entry || entry.lessonId !== lessonId || entry.pathId !== pathId) return;
  writeString(lessonCacheKey(userId), JSON.stringify({ ...entry, savedAt: Date.now(), run: fromRunState(run) }));
}

/** The cached lesson with its last known run, or null when absent, for another lesson/path, or corrupted. */
export function readLessonCache(userId: string, lessonId: string, pathId: string): (LessonPayload & { run: RunState }) | null {
  const entry = readEntry(userId);
  if (!entry || entry.lessonId !== lessonId || entry.pathId !== pathId) return null;
  try {
    const payload = parseLessonPayload(entry.payload);
    const run = parseRunState(entry.run, 'lesson_cache');
    return { lesson: payload.lesson, run };
  } catch {
    return null;
  }
}

export function clearLessonCache(userId: string): void {
  removeKey(lessonCacheKey(userId));
}
