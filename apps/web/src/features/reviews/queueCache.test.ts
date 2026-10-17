import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppSupabaseClient } from '@/lib/supabase';
import {
  REVIEW_PREFETCH_LIMIT,
  REVIEW_PREFETCH_MIN_INTERVAL_MS,
  dropCardFromReviewQueueCache,
  prefetchReviewQueue,
  readReviewQueueCache,
  writeReviewQueueCache,
} from './queueCache';
import { PATH_ID, card, cardId, queue } from './review-fixtures';

const USER = 'u1';

function client(reply: unknown) {
  const rpc = vi.fn().mockResolvedValue(reply);
  return { client: { rpc } as unknown as AppSupabaseClient, rpc };
}

afterEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

describe('review queue cache', () => {
  it('stores the queue per user and path and validates it on read', () => {
    writeReviewQueueCache(USER, PATH_ID, queue([card(1), card(2)]));
    expect(readReviewQueueCache(USER, PATH_ID)?.data.cards).toHaveLength(2);
    expect(readReviewQueueCache('u2', PATH_ID)).toBeNull();
    expect(readReviewQueueCache(USER, 'other')).toBeNull();
    localStorage.setItem(`linguo-snap-v1:review-queue:${PATH_ID}:${USER}`, JSON.stringify({ savedAt: Date.now(), data: { cards: 'x' } }));
    expect(readReviewQueueCache(USER, PATH_ID)).toBeNull();
  });

  it('drops one card (graded or postponed on this device)', () => {
    writeReviewQueueCache(USER, PATH_ID, queue([card(1), card(2)]));
    dropCardFromReviewQueueCache(USER, PATH_ID, cardId(1));
    expect(readReviewQueueCache(USER, PATH_ID)?.data.cards.map((c) => c.card_id)).toEqual([cardId(2)]);
    dropCardFromReviewQueueCache(USER, PATH_ID, cardId(99));
    dropCardFromReviewQueueCache(USER, null, cardId(2));
    expect(readReviewQueueCache(USER, PATH_ID)?.data.cards).toHaveLength(1);
  });

  it('prefetches up to 100 cards, then waits before asking again', async () => {
    const { client: c, rpc } = client({ data: queue([card(1)]), error: null });
    expect(await prefetchReviewQueue(c, USER, PATH_ID)).toBe(true);
    expect(rpc).toHaveBeenCalledWith('get_review_queue', { p_path_id: PATH_ID, p_limit: REVIEW_PREFETCH_LIMIT, p_extra: false });
    expect(readReviewQueueCache(USER, PATH_ID)?.data.cards).toHaveLength(1);
    expect(await prefetchReviewQueue(c, USER, PATH_ID)).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(await prefetchReviewQueue(c, USER, PATH_ID, Date.now() + REVIEW_PREFETCH_MIN_INTERVAL_MS + 1000)).toBe(true);
  });

  it('does nothing offline and swallows failures', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const off = client({ data: queue([]), error: null });
    expect(await prefetchReviewQueue(off.client, USER, PATH_ID)).toBe(false);
    expect(off.rpc).not.toHaveBeenCalled();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    const broken = client({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' }, status: 0 });
    await expect(prefetchReviewQueue(broken.client, USER, PATH_ID)).resolves.toBe(false);
    expect(readReviewQueueCache(USER, PATH_ID)).toBeNull();
  });
});
