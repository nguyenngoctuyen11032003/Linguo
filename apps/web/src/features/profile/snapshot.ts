import { z } from 'zod';
import { readSnapshot, writeSnapshot } from '@/lib/offline-snapshot';
import type { Profile } from './service';

const SNAPSHOT_NAME = 'profile';

const profileSnapshotSchema = z.object({
  id: z.string().min(1),
  displayName: z.string(),
  timezone: z.string().min(1),
  avatarPath: z.string().nullable().optional(),
});

/** The last profile read from the server for this user (a snapshot of another user's id is dropped). */
export function readProfileSnapshot(userId: string): Profile | null {
  const snap = readSnapshot(SNAPSHOT_NAME, userId, profileSnapshotSchema);
  return snap && snap.data.id === userId ? snap.data : null;
}

export function writeProfileSnapshot(userId: string, profile: Profile): void {
  if (profile.id === userId) writeSnapshot(SNAPSHOT_NAME, userId, profile);
}
