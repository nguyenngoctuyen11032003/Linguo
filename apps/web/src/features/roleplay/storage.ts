import { z } from 'zod';
import { findRoleplayScenario } from '@linguo/shared';
import type { RoleplaySession } from './session';

// The last session is kept in localStorage, per user, so closing the tab or reloading does not lose the
// conversation (a finished one too, until its recap is done). It expires ROLEPLAY_TTL_MS after the last saved
// message, and it is removed when the learner leaves the session or the recap is done, signs out or deletes the
// account (account/service.ts wipes both prefixes below). Nothing here is sent anywhere.

export const KEY_PREFIX = 'linguo:roleplay:v2:';
/** v1 lived in sessionStorage (this tab only) with the bare session as the value; read once, then moved to v2. */
export const LEGACY_KEY_PREFIX = 'linguo:roleplay:v1:';
/** A saved conversation is dropped this long after its last message. */
export const ROLEPLAY_TTL_MS = 24 * 60 * 60 * 1000;

const messageSchema = z.object({
  id: z.number().int(),
  role: z.enum(['partner', 'learner']),
  text: z.string().max(500),
  corrections: z.array(z.object({ original: z.string().max(300), corrected: z.string().max(300), note_vi: z.string().max(300) })).max(2),
  hint_vi: z.string().max(200).nullable(),
  responseId: z.string().max(64).nullable(),
  status: z.literal('ok'),
});

const sessionSchema = z.object({
  scenarioKey: z.string().max(32),
  language: z.enum(['en', 'ko']),
  level: z.string().max(10),
  startedAt: z.number(),
  messages: z.array(messageSchema).max(40),
  goals: z.array(z.string().max(40)).max(6),
  finished: z.boolean(),
  nextId: z.number().int(),
});

const envelopeSchema = z.object({ savedAt: z.number().finite(), session: sessionSchema });

const keyOf = (userId: string) => `${KEY_PREFIX}${userId}`;
const legacyKeyOf = (userId: string) => `${LEGACY_KEY_PREFIX}${userId}`;

function attempt(fn: () => void): void {
  try {
    fn();
  } catch {
    // Storage blocked: nothing is stored there either.
  }
}

function read(get: () => string | null): string | null {
  try {
    return get();
  } catch {
    return null;
  }
}

/**
 * Stores only confirmed messages: an in-flight or failed turn is not part of the saved conversation.
 */
export function saveSession(userId: string, session: RoleplaySession, now: number = Date.now()): void {
  try {
    const messages = session.messages.filter((m) => m.status === 'ok');
    localStorage.setItem(keyOf(userId), JSON.stringify({ savedAt: now, session: { ...session, messages } }));
  } catch {
    // Storage blocked or full: the session simply does not survive a reload.
  }
  attempt(() => sessionStorage.removeItem(legacyKeyOf(userId)));
}

export function clearSession(userId: string): void {
  attempt(() => localStorage.removeItem(keyOf(userId)));
  attempt(() => sessionStorage.removeItem(legacyKeyOf(userId)));
}

/**
 * The v2 envelope, or the v1 session of this tab (treated as saved just now and moved to localStorage); undefined
 * when nothing is stored.
 */
function readSaved(userId: string, now: number): unknown {
  const raw = read(() => localStorage.getItem(keyOf(userId)));
  if (raw !== null) return JSON.parse(raw) as unknown;
  const legacy = read(() => sessionStorage.getItem(legacyKeyOf(userId)));
  if (legacy === null) return undefined;
  attempt(() => sessionStorage.removeItem(legacyKeyOf(userId)));
  const envelope = { savedAt: now, session: JSON.parse(legacy) as unknown };
  attempt(() => localStorage.setItem(keyOf(userId), JSON.stringify(envelope)));
  return envelope;
}

/**
 * The saved session when it is valid, not expired and still fits the current path's language (else null;
 * an unusable entry is cleared).
 */
export function loadSession(userId: string, language: string, now: number = Date.now()): RoleplaySession | null {
  try {
    const saved = readSaved(userId, now);
    if (saved === undefined) return null;
    const parsed = envelopeSchema.safeParse(saved);
    const session = parsed.success ? parsed.data.session : null;
    if (
      !parsed.success ||
      !session ||
      now - parsed.data.savedAt > ROLEPLAY_TTL_MS ||
      session.language !== language ||
      !findRoleplayScenario(session.language, session.scenarioKey)
    ) {
      clearSession(userId);
      return null;
    }
    // A session that never got its opening line has nothing to resume.
    return session.messages.length > 0 ? session : null;
  } catch {
    clearSession(userId);
    return null;
  }
}
