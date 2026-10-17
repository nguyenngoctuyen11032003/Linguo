import type { PathLesson } from '@linguo/shared';
import { getContentStore, type StoredRun } from './content-store';

// Lesson runs made (or adopted) on the device, and what they mean for the lesson list: a lesson finished offline must
// show as completed and unlock the next one before the server has heard about it.

/** Dispatched on window after every change to the local runs so open screens refresh their overlay. */
export const LOCAL_RUNS_EVENT = 'linguo-local-runs-change';

function announce(): void {
  try {
    window.dispatchEvent(new Event(LOCAL_RUNS_EVENT));
  } catch {
    // No window (tests without DOM): nothing is listening.
  }
}

export async function listLocalRuns(userId: string): Promise<StoredRun[]> {
  try {
    return await (await getContentStore(userId)).listRuns();
  } catch {
    return [];
  }
}

/** Persists a run. Returns false when it could not be written (disk full / storage blocked): the caller keeps it in memory only. */
export async function saveLocalRun(userId: string, stored: StoredRun): Promise<boolean> {
  try {
    await (await getContentStore(userId)).saveRun(stored);
    announce();
    return true;
  } catch {
    return false;
  }
}

export async function removeLocalRun(userId: string, runId: string): Promise<void> {
  try {
    await (await getContentStore(userId)).deleteRun(runId);
  } catch {
    // Nothing to remove if storage is unavailable.
  }
  announce();
}

export async function findLocalRun(userId: string, lessonId: string, pathId: string): Promise<StoredRun | null> {
  try {
    return await (await getContentStore(userId)).findRun(lessonId, pathId);
  } catch {
    return null;
  }
}

/** The server confirmed the run's completion: keep it for the overlay until the list was refetched (pruneConfirmedRuns). */
export async function confirmLocalRun(userId: string, runId: string): Promise<void> {
  try {
    const store = await getContentStore(userId);
    const stored = await store.getRun(runId);
    if (stored) await store.saveRun({ ...stored, confirmedAt: Date.now() });
  } catch {
    // Nothing to confirm if storage is unavailable.
  }
  announce();
}

/** Drops confirmed runs (call right after a successful list fetch: the server list now shows them). */
export async function pruneConfirmedRuns(userId: string): Promise<void> {
  try {
    const store = await getContentStore(userId);
    const confirmed = (await store.listRuns()).filter((r) => r.confirmedAt !== undefined);
    for (const r of confirmed) await store.deleteRun(r.run.id);
    if (confirmed.length > 0) announce();
  } catch {
    // Left for the next fetch.
  }
}

export async function remapLocalRun(userId: string, from: string, to: string): Promise<void> {
  try {
    await (await getContentStore(userId)).remapRun(from, to);
  } catch {
    // The run stays under its old id; the queue was remapped, so the next sync report names the mismatch.
  }
  announce();
}

/**
 * The server's lesson list with the device's runs applied: an in-progress local run makes a not-started lesson
 * `in_progress`, a locally completed run makes it `completed`, and a lesson whose prerequisites are all completed
 * (by the server or locally) becomes available. The server's answer wins whenever it already says completed.
 */
export function overlayLocalRuns(lessons: readonly PathLesson[], runs: readonly StoredRun[], pathId: string): PathLesson[] {
  const mine = runs.filter((r) => r.run.path_id === pathId);
  if (mine.length === 0) return lessons as PathLesson[];
  const status = new Map<string, PathLesson['run_status']>();
  for (const lesson of lessons) {
    let next = lesson.run_status;
    if (next !== 'completed') {
      const own = mine.filter((r) => r.run.lesson_id === lesson.lesson_id);
      if (own.some((r) => r.run.status === 'completed')) next = 'completed';
      else if (next === 'not_started' && own.some((r) => r.run.status === 'in_progress')) next = 'in_progress';
    }
    status.set(lesson.lesson_id, next);
  }
  return lessons.map((lesson) => {
    const run_status = status.get(lesson.lesson_id) ?? lesson.run_status;
    let prerequisites_met = lesson.prerequisites_met;
    if (!prerequisites_met && lesson.prerequisite_ids.every((id) => status.get(id) === 'completed')) prerequisites_met = true;
    return run_status === lesson.run_status && prerequisites_met === lesson.prerequisites_met ? lesson : { ...lesson, run_status, prerequisites_met };
  });
}
