import { z } from 'zod';
import { lessonPayloadSchema, type LessonPayload } from '@linguo/shared';

/**
 * Spec 2 §7.4: the text-only payload of the lesson being studied, kept in localStorage so it can be reopened offline
 * even after the installed app is relaunched (a new session would lose sessionStorage). Bounded: entries expire after
 * LESSON_CACHE_MAX_AGE_MS and only the LESSON_CACHE_MAX_PER_USER most recently saved lessons are kept per user.
 */
export const LESSON_CACHE_PREFIX = 'linguo-lesson-v1:';
export const LESSON_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const LESSON_CACHE_MAX_PER_USER = 2;

const entrySchema = z.object({ savedAt: z.number().finite(), payload: z.unknown() });

/** Scoped per user and path: a run belongs to one learning path, so another path must never reuse it offline. */
export function lessonCacheKey(userId: string, pathId: string, lessonId: string): string {
  return `${LESSON_CACHE_PREFIX}${userId}:${pathId}:${lessonId}`;
}

const userPrefix = (userId: string) => `${LESSON_CACHE_PREFIX}${userId}:`;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function remove(store: Storage, key: string): void {
  try {
    store.removeItem(key);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

function keysWithPrefix(store: Storage, prefix: string): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key?.startsWith(prefix)) keys.push(key);
    }
  } catch {
    // Storage blocked: nothing to list.
  }
  return keys;
}

/** The entry when well-formed and fresh; null (and the entry is dropped) when it is corrupt or expired. */
function freshEntry(store: Storage, key: string, now: number): { savedAt: number; payload: unknown } | null {
  let raw: string | null;
  try {
    raw = store.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;
  let entry: z.infer<typeof entrySchema> | null = null;
  try {
    const parsed = entrySchema.safeParse(JSON.parse(raw));
    if (parsed.success) entry = parsed.data;
  } catch {
    entry = null;
  }
  if (!entry || now - entry.savedAt > LESSON_CACHE_MAX_AGE_MS || entry.savedAt > now + LESSON_CACHE_MAX_AGE_MS) {
    remove(store, key);
    return null;
  }
  return entry;
}

/** The cached open run for this key, or null. Corrupt, invalid or expired entries are dropped. */
export function readLessonCache(key: string, now: number = Date.now()): LessonPayload | null {
  const store = storage();
  if (!store) return null;
  const entry = freshEntry(store, key, now);
  if (!entry) return null;
  const parsed = lessonPayloadSchema.safeParse(entry.payload);
  if (!parsed.success) {
    remove(store, key);
    return null;
  }
  // Only an open run is worth reopening offline: a completed one cannot take answers and "Học lại" needs the network.
  return parsed.data.run?.status === 'in_progress' ? parsed.data : null;
}

/** Saves the payload under `key` (a lessonCacheKey of `userId`) and evicts all but the most recent lessons. */
export function writeLessonCache(userId: string, key: string, payload: LessonPayload, now: number = Date.now()): void {
  const store = storage();
  if (!store) return;
  if (payload.run?.status !== 'in_progress') {
    // A finished run is never reopened offline: free its slot.
    remove(store, key);
    return;
  }
  try {
    store.setItem(key, JSON.stringify({ savedAt: now, payload }));
  } catch {
    // Storage full or blocked: offline reopen simply won't be available.
    return;
  }
  const others = keysWithPrefix(store, userPrefix(userId))
    .filter((k) => k !== key)
    .map((k) => ({ key: k, entry: freshEntry(store, k, now) }))
    .filter((e): e is { key: string; entry: { savedAt: number; payload: unknown } } => e.entry !== null)
    .sort((a, b) => b.entry.savedAt - a.entry.savedAt);
  for (const { key: stale } of others.slice(LESSON_CACHE_MAX_PER_USER - 1)) remove(store, stale);
}

/** Drops every cached lesson of the user (sign-out: the next person on this device must not see them). */
export function clearLessonCache(userId: string): void {
  const store = storage();
  if (!store) return;
  for (const key of keysWithPrefix(store, userPrefix(userId))) remove(store, key);
}
