import { personalQueueSchema, type PersonalList, type PersonalQueue } from '@linguo/shared';
import { readCached, writeCached, type Cached } from '@/lib/read-cache';
import type { AppSupabaseClient } from '@/lib/supabase';
import { getPersonalQueue } from './service';

// A copy of the due-word queue of each personal list (per user, zod-validated, 7 days) so a personal review can run
// with no network; grades go to the personal outbox. A card graded on this device is dropped from the copy at once,
// those still waiting in the outbox are filtered when a session loads from it (usePersonalReview).

/** The most `get_personal_review_queue` serves in one call. */
export const PERSONAL_PREFETCH_LIMIT = 100;
/** Lists whose queue is saved after the lists load (the ones with the most due words first). */
export const PERSONAL_PREFETCH_LISTS = 5;
export const PERSONAL_PREFETCH_MIN_INTERVAL_MS = 2 * 60 * 1000;

const cacheName = (listId: string) => `personal-queue:${listId}`;

export function readPersonalQueueCache(userId: string | null | undefined, listId: string | null | undefined): Cached<PersonalQueue> | null {
  return listId ? readCached(cacheName(listId), userId, personalQueueSchema) : null;
}

export function dropWordFromPersonalQueueCache(userId: string, listId: string | null, wordId: string): void {
  if (!listId) return;
  const cached = readPersonalQueueCache(userId, listId);
  if (!cached || !cached.data.cards.some((c) => c.card_id === wordId)) return;
  writeCached(cacheName(listId), userId, { ...cached.data, cards: cached.data.cards.filter((c) => c.card_id !== wordId) });
}

/** Saves the due words of the lists that have some. Offline: nothing. Never throws. */
export async function prefetchPersonalQueues(client: AppSupabaseClient, userId: string, lists: readonly PersonalList[], now = Date.now()): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const due = lists
    .filter((l) => l.due_count > 0)
    .sort((a, b) => b.due_count - a.due_count)
    .slice(0, PERSONAL_PREFETCH_LISTS);
  for (const list of due) {
    const cached = readPersonalQueueCache(userId, list.id);
    if (cached && now - cached.savedAt < PERSONAL_PREFETCH_MIN_INTERVAL_MS) continue;
    try {
      const queue = await getPersonalQueue(client, list.id, PERSONAL_PREFETCH_LIMIT);
      writeCached(cacheName(list.id), userId, queue);
    } catch {
      return; // the network is gone or the server is struggling: the other lists would fail the same way
    }
  }
}
