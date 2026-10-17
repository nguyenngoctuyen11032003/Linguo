import type { ZodType } from 'zod';
import { readSnapshot, removeSnapshot, writeSnapshot } from './offline-snapshot';

/**
 * Last-known copies of server reads (review summary, progress dashboard, today's session, review queue, personal
 * vocabulary lists/queue) so the learning screens still show something useful offline. A thin, TTL-bound layer over
 * the per-user snapshot store (lib/offline-snapshot.ts): zod-validated on read, scoped by user id, never throws, and
 * wiped on sign-out and account deletion together with the snapshots (SNAPSHOT_KEY_PREFIX in features/account).
 *
 * The pattern in a hook: hydrate from `readCached`, fetch, `writeCached` on success; on a network error keep the
 * cached value on screen and mark it as stale (`stale` + `updatedAt`).
 */
export const READ_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface Cached<T> {
  data: T;
  /** Epoch ms of the save. */
  savedAt: number;
}

/** The cached value, or null when absent, invalid, or older than `ttlMs`. */
export function readCached<T>(name: string, userId: string | null | undefined, schema: ZodType<T>, ttlMs = READ_CACHE_TTL_MS, now = Date.now()): Cached<T> | null {
  if (!userId) return null;
  const snapshot = readSnapshot(name, userId, schema);
  if (!snapshot || now - snapshot.savedAt > ttlMs || snapshot.savedAt > now + 60_000) return null;
  return snapshot;
}

export function writeCached<T>(name: string, userId: string | null | undefined, data: T): void {
  if (userId) writeSnapshot(name, userId, data);
}

export function removeCached(name: string, userId: string | null | undefined): void {
  if (userId) removeSnapshot(name, userId);
}

/** "Cập nhật lúc 14:05", or with the date when the copy is not from today ("Cập nhật 18/10 lúc 14:05"). */
export function formatUpdatedAt(savedAt: number, now = new Date()): string {
  const at = new Date(savedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const sameDay = at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth() && at.getDate() === now.getDate();
  return sameDay ? `Cập nhật lúc ${time}` : `Cập nhật ${pad(at.getDate())}/${pad(at.getMonth() + 1)} lúc ${time}`;
}

