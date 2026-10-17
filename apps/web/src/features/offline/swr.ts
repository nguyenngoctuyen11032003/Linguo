import { pathLessonSchema, type PathLesson } from '@linguo/shared';
import type { ZodType } from 'zod';
import { getContentStore } from './content-store';

// Stale-while-revalidate cache for the lists the learning screens need to render offline. Stored in the user's
// IndexedDB (not localStorage: the lesson list of a language is ~150 KB). Never throws: a failing cache is just no cache.

export interface Cached<T> {
  data: T;
  /** Epoch ms of the last successful fetch. */
  savedAt: number;
}

export async function readList<T>(userId: string, name: string, schema: ZodType<T>): Promise<Cached<T> | null> {
  try {
    return await (await getContentStore(userId)).getList(name, schema);
  } catch {
    return null;
  }
}

export async function writeList(userId: string, name: string, data: unknown): Promise<void> {
  try {
    await (await getContentStore(userId)).putList(name, data);
  } catch {
    // Disk full or storage blocked: the screen simply has no offline copy of this list.
  }
}

export const pathLessonsListName = (pathId: string): string => `path_lessons:${pathId}`;

const pathLessonsSchema = pathLessonSchema.array();

export function readCachedPathLessons(userId: string, pathId: string): Promise<Cached<PathLesson[]> | null> {
  return readList(userId, pathLessonsListName(pathId), pathLessonsSchema);
}

/** An empty list is never cached: it would hide the real list behind "no lessons yet" if the first answer was empty. */
export function writeCachedPathLessons(userId: string, pathId: string, lessons: readonly PathLesson[]): Promise<void> {
  return lessons.length === 0 ? Promise.resolve() : writeList(userId, pathLessonsListName(pathId), lessons);
}
