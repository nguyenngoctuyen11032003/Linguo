import { submitArgsSchema, type SubmitArgs } from '@linguo/shared';
import { z } from 'zod';

// Spec 2 §7.4: submits that never reached the server wait here and are replayed FIFO with the same
// idempotency key, so a retry can never be graded twice. Spec 3 reuses the same store for review grades
// (a second outbox kind, see features/reviews/outbox.ts).

export const OUTBOX_KEY_PREFIX = 'linguo-outbox-v1:';
export const OUTBOX_CAP = 200;
export const OUTBOX_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const OUTBOX_MAX_BACKOFF_MS = 60_000;
/** Dispatched on window after every write so hooks in the same tab can refresh their count. */
export const OUTBOX_CHANGE_EVENT = 'linguo-outbox-change';

/** What every queued RPC call carries: the key the server dedupes (and replays) on. */
export interface IdempotentArgs {
  p_idempotency_key: string;
}

/** One queued call; `queueIndex` is caller data (lesson queue position, review session position). */
export interface OutboxEntryOf<A extends IdempotentArgs> {
  args: A;
  queueIndex: number;
  createdAt: string;
  tries: number;
  nextAttemptAt: number;
}

export type NewOutboxEntryOf<A extends IdempotentArgs> = Pick<OutboxEntryOf<A>, 'args' | 'queueIndex'> &
  Partial<Omit<OutboxEntryOf<A>, 'args' | 'queueIndex'>>;

export interface OutboxOf<A extends IdempotentArgs> {
  readonly key: string;
  /** FIFO (oldest first). */
  list: () => OutboxEntryOf<A>[];
  /**
   * Ignored when an entry with the same idempotency key is already queued. Returns false when the entry could not be
   * persisted (no storage, quota exceeded, blocked): the caller must not show it as waiting for sync.
   */
  add: (entry: NewOutboxEntryOf<A>) => boolean;
  remove: (idempotencyKey: string) => void;
  /** Counts a failed send and schedules the next try with exponential backoff and jitter. */
  markFailed: (idempotencyKey: string, now?: number) => void;
  /** Drops entries older than 7 days; returns what is left. */
  prune: (now?: number) => OutboxEntryOf<A>[];
}

/** A kind of outbox: its storage key prefix (`<keyPrefix><userId>`) and the schema queued args must satisfy. */
export interface OutboxKind<A extends IdempotentArgs> {
  keyPrefix: string;
  argsSchema: z.ZodType<A>;
}

/** The spec 2 lesson outbox (submit_exercise). */
export const LESSON_OUTBOX: OutboxKind<SubmitArgs> = { keyPrefix: OUTBOX_KEY_PREFIX, argsSchema: submitArgsSchema };

export type OutboxEntry = OutboxEntryOf<SubmitArgs>;
export type NewOutboxEntry = NewOutboxEntryOf<SubmitArgs>;
export type Outbox = OutboxOf<SubmitArgs>;

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

/** Opens the outbox of `kind` for one user. */
export function openOutbox<A extends IdempotentArgs>(
  kind: OutboxKind<A>,
  userId: string,
  storage: Storage | null = defaultStorage(),
): OutboxOf<A> {
  type Entry = OutboxEntryOf<A>;
  const key = `${kind.keyPrefix}${userId}`;
  const entrySchema = z.object({
    args: kind.argsSchema,
    queueIndex: z.number().int().min(0),
    createdAt: z.string(),
    tries: z.number().int().min(0),
    nextAttemptAt: z.number(),
  });

  const read = (): Entry[] => {
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
      return parsed.success ? [parsed.data as Entry] : [];
    });
  };

  /** False when there is no storage or it throws (full, blocked). */
  const write = (entries: Entry[]): boolean => {
    let saved = false;
    try {
      if (storage) {
        if (entries.length === 0) storage.removeItem(key);
        else storage.setItem(key, JSON.stringify(entries));
        saved = true;
      }
    } catch {
      // Storage full or blocked: reported to the caller.
    }
    try {
      window.dispatchEvent(new CustomEvent(OUTBOX_CHANGE_EVENT, { detail: { key } }));
    } catch {
      // No window (non-DOM caller): nothing to notify.
    }
    return saved;
  };

  return {
    key,
    list: read,
    add(entry) {
      const entries = read();
      if (entries.some((e) => e.args.p_idempotency_key === entry.args.p_idempotency_key)) return true;
      const full: Entry = {
        args: entry.args,
        queueIndex: entry.queueIndex,
        createdAt: entry.createdAt ?? new Date().toISOString(),
        tries: entry.tries ?? 0,
        nextAttemptAt: entry.nextAttemptAt ?? 0,
      };
      return write([...entries, full].slice(-OUTBOX_CAP));
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

/** The lesson outbox (`linguo-outbox-v1:<userId>`). */
export function createOutbox(userId: string, storage: Storage | null = defaultStorage()): Outbox {
  return openOutbox(LESSON_OUTBOX, userId, storage);
}
