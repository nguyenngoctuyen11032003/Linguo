import { z } from 'zod';
import type { PersonalGradeResult } from '@linguo/shared';
import { openOutbox, type OutboxEntryOf, type OutboxKind, type OutboxOf } from '@/features/lesson-player/outbox';
import type { OutboxChannel, OutboxOutcomeOf } from '@/features/lesson-player/useOutboxSync';
import type { AppSupabaseClient } from '@/lib/supabase';
import { gradePersonalWord } from './service';

// Personal vocabulary grades that never reached the server (offline, timeout, 408/5xx) wait here and are replayed FIFO
// by OutboxSyncProvider with the same idempotency key, exactly like review grades (same store, cap, backoff and
// 7-day expiry). Like the lesson and review outboxes it is kept on sign-out and wiped on account deletion (features/account/service.ts).

export const PERSONAL_OUTBOX_KEY_PREFIX = 'linguo-personal-outbox-v1:';

/** The grade_personal_word arguments, as queued. */
export const personalGradeArgsSchema = z.object({
  p_word_id: z.uuid(),
  p_rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  p_idempotency_key: z.uuid(),
});
export type PersonalGradeArgs = z.infer<typeof personalGradeArgsSchema>;

export const PERSONAL_OUTBOX: OutboxKind<PersonalGradeArgs> = {
  keyPrefix: PERSONAL_OUTBOX_KEY_PREFIX,
  argsSchema: personalGradeArgsSchema,
};

function sendPersonalGrade(client: AppSupabaseClient, args: PersonalGradeArgs): Promise<PersonalGradeResult> {
  return gradePersonalWord(client, { wordId: args.p_word_id, rating: args.p_rating, idempotencyKey: args.p_idempotency_key });
}

export const PERSONAL_OUTBOX_CHANNEL: OutboxChannel<PersonalGradeArgs, PersonalGradeResult> = {
  kind: PERSONAL_OUTBOX,
  send: sendPersonalGrade,
  lockName: 'linguo-personal-outbox',
};

export type PersonalOutboxEntry = OutboxEntryOf<PersonalGradeArgs>;
export type PersonalOutbox = OutboxOf<PersonalGradeArgs>;
export type PersonalOutboxOutcome = OutboxOutcomeOf<PersonalGradeResult>;
export type PersonalOutboxResultHandler = (idempotencyKey: string, outcome: PersonalOutboxOutcome, entry: PersonalOutboxEntry) => void;

export function personalOutboxKey(userId: string): string {
  return `${PERSONAL_OUTBOX_KEY_PREFIX}${userId}`;
}

export function createPersonalOutbox(userId: string, storage?: Storage | null): PersonalOutbox {
  return storage === undefined ? openOutbox(PERSONAL_OUTBOX, userId) : openOutbox(PERSONAL_OUTBOX, userId, storage);
}
