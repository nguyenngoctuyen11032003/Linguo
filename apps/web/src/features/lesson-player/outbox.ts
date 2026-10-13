import { submitArgsSchema } from '@linguo/shared';
import { z } from 'zod';

// Spec 2 §7.4: submits that never reached the server wait here and are replayed FIFO with the same
// idempotency key, so a retry can never be graded twice.

export const OUTBOX_KEY_PREFIX = 'linguo-outbox-v1:';
export const OUTBOX_CAP = 200;
export const OUTBOX_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const OUTBOX_MAX_BACKOFF_MS = 60_000;
/** Dispatched on window after every write so hooks in the same tab can refresh their count. */
export const OUTBOX_CHANGE_EVENT = 'linguo-outbox-change';

const entrySchema = z.object({
  args: submitArgsSchema,
  queueIndex: z.number().int().min(0),
  createdAt: z.string(),
  tries: z.number().int().min(0),
  nextAttemptAt: z.number(),
});
export type OutboxEntry = z.infer<typeof entrySchema>;

export type NewOutboxEntry = Pick<OutboxEntry, 'args' | 'queueIndex'> & Partial<Omit<OutboxEntry, 'args' | 'queueIndex'>>;

export interface Outbox {
  readonly key: string;
  /** FIFO (oldest first). */
  list: () => OutboxEntry[];
  /** Ignored when an entry with the same idempotency key is already queued. */
  add: (entry: NewOutboxEntry) => void;
  remove: (idempotencyKey: string) => void;
  /** Counts a failed send and schedules the next try with exponential backoff and jitter. */
  markFailed: (idempotencyKey: string, now?: number) => void;
  /** Drops entries older than 7 days; returns what is left. */
  prune: (now?: number) => OutboxEntry[];
}

export function outboxKey(userId: string): string {
  return `${OUTBOX_KEY_PREFIX}${userId}`;
}

export function backoffMs(tries: number): number {
  return Math.min(OUTBOX_MAX_BACKOFF_MS, 1000 * 2 ** tries) * (0.5 + Math.random() * 0.5);
}

function defaultStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function createOutbox(userId: string, storage: Storage | null = defaultStorage()): Outbox {
  const key = outboxKey(userId);

  const read = (): OutboxEntry[] => {
    let raw: string | null;
    try {
      raw = storage?.getItem(key) ?? null;
    } catch {
      return [];
    }
    if (!raw) return [];
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return [];
    }
    if (!Array.isArray(json)) return [];
    // Keep every valid entry even when a neighbour is corrupt.
    return json.flatMap((item) => {
      const parsed = entrySchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
  };

  const write = (entries: OutboxEntry[]) => {
    try {
      if (entries.length === 0) storage?.removeItem(key);
      else storage?.setItem(key, JSON.stringify(entries));
    } catch {
      // Storage full or blocked: the entry stays only in memory of the caller (shown as pending until reload).
    }
    try {
      window.dispatchEvent(new CustomEvent(OUTBOX_CHANGE_EVENT, { detail: { key } }));
    } catch {
      // No window (non-DOM caller): nothing to notify.
    }
  };

  return {
    key,
    list: read,
    add(entry) {
      const entries = read();
      if (entries.some((e) => e.args.p_idempotency_key === entry.args.p_idempotency_key)) return;
      const full: OutboxEntry = {
        args: entry.args,
        queueIndex: entry.queueIndex,
        createdAt: entry.createdAt ?? new Date().toISOString(),
        tries: entry.tries ?? 0,
        nextAttemptAt: entry.nextAttemptAt ?? 0,
      };
      write([...entries, full].slice(-OUTBOX_CAP));
    },
    remove(idempotencyKey) {
      const entries = read();
      const left = entries.filter((e) => e.args.p_idempotency_key !== idempotencyKey);
      if (left.length !== entries.length) write(left);
    },
    markFailed(idempotencyKey, now = Date.now()) {
      const entries = read();
      let changed = false;
      const next = entries.map((e) => {
        if (e.args.p_idempotency_key !== idempotencyKey) return e;
        changed = true;
        return { ...e, tries: e.tries + 1, nextAttemptAt: now + backoffMs(e.tries) };
      });
      if (changed) write(next);
    },
    prune(now = Date.now()) {
      const entries = read();
      const left = entries.filter((e) => {
        const created = Date.parse(e.createdAt);
        return Number.isFinite(created) && now - created <= OUTBOX_MAX_AGE_MS;
      });
      if (left.length !== entries.length) write(left);
      return left;
    },
  };
}
