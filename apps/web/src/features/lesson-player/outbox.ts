import { submitArgsSchema, type SubmitArgs } from '@linguo/shared';
import { z } from 'zod';

// Spec 2 §7.4: submits that never reached the server wait here and are replayed FIFO with the same
// idempotency key, so a retry can never be graded twice. Spec 3 reuses the same store for review grades
// (a second outbox kind, see features/reviews/outbox.ts).

export const OUTBOX_KEY_PREFIX = 'linguo-outbox-v1:';
/**
 * Entries one outbox keeps. A full outbox refuses new entries (`add` returns false) instead of silently dropping the
 * oldest answer: the caller then tells the learner it was not saved.
 */
export const OUTBOX_CAP = 2000;
export const OUTBOX_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Entries older than this are about to expire: the UI warns the learner to get online. */
export const OUTBOX_WARN_AGE_MS = 5 * 24 * 60 * 60 * 1000;
export const OUTBOX_MAX_BACKOFF_MS = 60_000;
/** Dispatched on window after every write so hooks in the same tab can refresh their count. */
export const OUTBOX_CHANGE_EVENT = 'linguo-outbox-change';
/** Dispatched when something that should be sent soon was queued (a lesson start/complete): the provider drains. */
export const OUTBOX_ENQUEUED_EVENT = 'linguo-outbox-enqueued';

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
   * persisted (no storage, quota exceeded, blocked, or the outbox holds OUTBOX_CAP entries): the caller must not show
   * it as waiting for sync.
   */
  add: (entry: NewOutboxEntryOf<A>) => boolean;
  remove: (idempotencyKey: string) => void;
  /**
   * Counts a failed send and schedules the next try with exponential backoff and jitter, or `delayMs` from now when
   * the server said how long to wait (a rate limit).
   */
  markFailed: (idempotencyKey: string, now?: number, delayMs?: number) => void;
  /** Drops entries older than 7 days; returns what is left. */
  prune: (now?: number) => OutboxEntryOf<A>[];
  /** Like `prune`, and also returns the entries that expired so the caller can report them. */
  pruneExpired: (now?: number) => { left: OutboxEntryOf<A>[]; expired: OutboxEntryOf<A>[] };
  /** Removes every entry for which `predicate` holds and returns them. */
  removeWhere: (predicate: (entry: OutboxEntryOf<A>) => boolean) => OutboxEntryOf<A>[];
  /** Replaces entries in place (same order, same count); an unchanged entry must be returned as the same object. */
  update: (fn: (entry: OutboxEntryOf<A>) => OutboxEntryOf<A>) => boolean;
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

  /**
   * Read-modify-write with a read-back check. Tabs share this key and a synchronous API cannot hold a Web Lock
   * (the drain does, around its sends), so a write from another tab could land between our read and write; the
   * read-back notices a lost update and the change is applied again on fresh data. `fn` returns the new list, or
   * null for "nothing to change".
   */
  const mutate = (fn: (entries: Entry[]) => Entry[] | null): boolean => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const next = fn(read());
      if (next === null) return true;
      if (!write(next)) return false;
      try {
        const stored = storage?.getItem(key) ?? null;
        if (next.length === 0 ? stored === null : stored === JSON.stringify(next)) return true;
      } catch {
        return false;
      }
    }
    return false;
  };

  const expired = (e: Entry, now: number): boolean => {
    const created = Date.parse(e.createdAt);
    return !Number.isFinite(created) || now - created > OUTBOX_MAX_AGE_MS;
  };

  const pruneExpired = (now = Date.now()) => {
    let gone: Entry[] = [];
    let left: Entry[] | null = null;
    mutate((entries) => {
      gone = entries.filter((e) => expired(e, now));
      left = entries.filter((e) => !expired(e, now));
      return gone.length > 0 ? left : null;
    });
    return { left: left ?? read(), expired: gone };
  };

  return {
    key,
    list: read,
    add(entry) {
      let refused = false;
      const saved = mutate((entries) => {
        if (entries.some((e) => e.args.p_idempotency_key === entry.args.p_idempotency_key)) return null;
        if (entries.length >= OUTBOX_CAP) {
          refused = true;
          return null;
        }
        return [
          ...entries,
          {
            args: entry.args,
            queueIndex: entry.queueIndex,
            createdAt: entry.createdAt ?? new Date().toISOString(),
            tries: entry.tries ?? 0,
            nextAttemptAt: entry.nextAttemptAt ?? 0,
          },
        ];
      });
      return saved && !refused;
    },
    remove(idempotencyKey) {
      mutate((entries) => {
        const left = entries.filter((e) => e.args.p_idempotency_key !== idempotencyKey);
        return left.length !== entries.length ? left : null;
      });
    },
    markFailed(idempotencyKey, now = Date.now(), delayMs) {
      mutate((entries) => {
        let changed = false;
        const next = entries.map((e) => {
          if (e.args.p_idempotency_key !== idempotencyKey) return e;
          changed = true;
          return { ...e, tries: e.tries + 1, nextAttemptAt: now + (delayMs ?? backoffMs(e.tries)) };
        });
        return changed ? next : null;
      });
    },
    prune: (now = Date.now()) => pruneExpired(now).left,
    pruneExpired,
    removeWhere(predicate) {
      let removed: Entry[] = [];
      mutate((entries) => {
        removed = entries.filter(predicate);
        return removed.length > 0 ? entries.filter((e) => !predicate(e)) : null;
      });
      return removed;
    },
    update(fn) {
      return mutate((entries) => {
        const next = entries.map(fn);
        return next.some((e, i) => e !== entries[i]) ? next : null;
      });
    },
  };
}

/** The lesson outbox (`linguo-outbox-v1:<userId>`). */
export function createOutbox(userId: string, storage: Storage | null = defaultStorage()): Outbox {
  return openOutbox(LESSON_OUTBOX, userId, storage);
}

/** How many entries are older than OUTBOX_WARN_AGE_MS (they expire after OUTBOX_MAX_AGE_MS). */
export function countExpiringSoon<A extends IdempotentArgs>(entries: OutboxEntryOf<A>[], now = Date.now()): number {
  return entries.filter((e) => {
    const created = Date.parse(e.createdAt);
    return Number.isFinite(created) && now - created >= OUTBOX_WARN_AGE_MS;
  }).length;
}
