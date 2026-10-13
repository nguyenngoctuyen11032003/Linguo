import { z } from 'zod';
import { SESSION_QUERY, sessionActivitySchema } from '@linguo/shared';

// Spec 6 §4 "Tích hợp": a lesson or a review opened from the session page carries ?phien=<session id>&muc=<item id>
// (and, for a review, &so-the=<review_limit>). Without these params the lesson and the review behave as before.

/** Where "Quay lại phiên học" leads. */
export const SESSION_PAGE_PATH = '/app/phien-hoc';

/** Query params of a session link. `reviewLimit` is only set on review links. */
export const SESSION_LINK_QUERY = { ...SESSION_QUERY, reviewLimit: 'so-the' } as const;

/** A single update_session_item call never adds more than this (the server clamps to the same bound). */
export const MAX_ITEM_SECONDS = 7200;

export interface SessionLink {
  sessionId: string;
  itemId: string;
  /** Review links only: end the review after this many cards. */
  reviewLimit: number | null;
}

const sessionIdSchema = z.uuid();
const itemIdSchema = sessionActivitySchema.shape.id;
const reviewLimitSchema = sessionActivitySchema.shape.review_limit.unwrap();

/** The session link in the URL, or null when absent or malformed (then the page keeps its normal behaviour). */
export function readSessionParams(params: URLSearchParams): SessionLink | null {
  const sessionId = sessionIdSchema.safeParse(params.get(SESSION_LINK_QUERY.session));
  const itemId = itemIdSchema.safeParse(params.get(SESSION_LINK_QUERY.item));
  if (!sessionId.success || !itemId.success) return null;
  const rawLimit = params.get(SESSION_LINK_QUERY.reviewLimit);
  const limit = rawLimit !== null && /^\d+$/.test(rawLimit) ? reviewLimitSchema.safeParse(Number(rawLimit)) : null;
  return { sessionId: sessionId.data, itemId: itemId.data, reviewLimit: limit?.success ? limit.data : null };
}

/** Query string for a link from the session page, e.g. `?phien=…&muc=a1&so-the=20`. */
export function sessionLinkSearch(link: SessionLink): string {
  const params = new URLSearchParams({ [SESSION_LINK_QUERY.session]: link.sessionId, [SESSION_LINK_QUERY.item]: link.itemId });
  if (link.reviewLimit !== null) params.set(SESSION_LINK_QUERY.reviewLimit, String(link.reviewLimit));
  return `?${params.toString()}`;
}

/** Whole seconds between two timestamps, within 0..MAX_ITEM_SECONDS. */
export function elapsedSeconds(startedAtMs: number, nowMs: number): number {
  const seconds = Math.round((nowMs - startedAtMs) / 1000);
  return Math.min(MAX_ITEM_SECONDS, Math.max(0, Number.isFinite(seconds) ? seconds : 0));
}
