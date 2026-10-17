import type { ZodType } from 'zod';

/**
 * Tiny per-user "last good" snapshot store (localStorage) for stale-while-revalidate reads of small, always-needed
 * data: the profile and the learning-path list. A provider hydrates from the snapshot (instantly, offline too),
 * revalidates in the background and rewrites it on success.
 *
 * - Scoped by user id; a snapshot of another user is never read.
 * - Zod-validated on read: a shape from an older build (or a tampered value) is discarded, never trusted.
 * - Never throws (blocked/full storage just means no snapshot).
 * - Wiped on sign-out and account deletion through SNAPSHOT_KEY_PREFIX in features/account/service.ts.
 * Bigger or per-lesson data does not belong here (it goes to IndexedDB, features/offline).
 */
export const SNAPSHOT_KEY_PREFIX = 'linguo-snap-v1:';

export interface Snapshot<T> {
  data: T;
  /** Epoch ms when it was written. */
  savedAt: number;
}

const keyOf = (name: string, userId: string) => `${SNAPSHOT_KEY_PREFIX}${name}:${userId}`;

export function readSnapshot<T>(name: string, userId: string, schema: ZodType<T>): Snapshot<T> | null {
  try {
    const raw = localStorage.getItem(keyOf(name, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: unknown; data?: unknown } | null;
    if (!parsed || typeof parsed.savedAt !== 'number') return null;
    const result = schema.safeParse(parsed.data);
    return result.success ? { data: result.data, savedAt: parsed.savedAt } : null;
  } catch {
    return null;
  }
}

export function writeSnapshot<T>(name: string, userId: string, data: T): void {
  try {
    localStorage.setItem(keyOf(name, userId), JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // Quota or blocked storage: the app simply has no offline copy of this on this device.
  }
}

export function removeSnapshot(name: string, userId: string): void {
  try {
    localStorage.removeItem(keyOf(name, userId));
  } catch {
    // Nothing to remove if storage is unavailable.
  }
}
