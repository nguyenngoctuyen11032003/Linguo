import { FEASIBILITIES, GOAL_TYPES, LANGUAGE_CODES, PATH_STATUSES, START_POINTS } from '@linguo/shared';
import { z } from 'zod';
import { readSnapshot, removeSnapshot, writeSnapshot } from '@/lib/offline-snapshot';
import type { LearningPath } from './service';

const SNAPSHOT_NAME = 'learning-paths';

const learningPathSchema = z.object({
  id: z.string().min(1),
  language: z.enum(LANGUAGE_CODES),
  startPoint: z.enum(START_POINTS),
  goalType: z.enum(GOAL_TYPES),
  currentLevel: z.string(),
  targetLevel: z.string(),
  weeklyMinutes: z.array(z.number()),
  targetDate: z.string().nullable(),
  status: z.enum(PATH_STATUSES),
  estimate: z.object({
    hoursNeeded: z.number(),
    weeksMin: z.number(),
    weeksMid: z.number(),
    weeksMax: z.number(),
    feasibility: z.enum(FEASIBILITIES),
    suggestedMinutesPerDay: z.number().nullable(),
    suggestedDate: z.string().nullable(),
    assumptions: z.object({
      weeklyMinutes: z.number(),
      hoursNeeded: z.number(),
      referenceReviewed: z.boolean(),
      multiplierRange: z.tuple([z.number(), z.number()]),
    }),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const pathsSnapshotSchema = z.object({
  paths: z.array(learningPathSchema),
  currentId: z.string().nullable(),
});

export interface PathsSnapshot {
  paths: LearningPath[];
  currentId: string | null;
}

/** The learner's non-archived paths as last confirmed by the server; never an empty list (see writePathsSnapshot). */
export function readPathsSnapshot(userId: string): PathsSnapshot | null {
  const snap = readSnapshot(SNAPSHOT_NAME, userId, pathsSnapshotSchema);
  if (!snap || snap.data.paths.length === 0) return null;
  return snap.data as PathsSnapshot;
}

/**
 * An empty list is never kept: "no paths" sends a learner to onboarding, so a stale empty copy could trap an
 * offline learner there. Saving an empty list removes the snapshot instead.
 */
export function writePathsSnapshot(userId: string, snapshot: PathsSnapshot): void {
  if (snapshot.paths.length === 0) removeSnapshot(SNAPSHOT_NAME, userId);
  else writeSnapshot(SNAPSHOT_NAME, userId, snapshot);
}
