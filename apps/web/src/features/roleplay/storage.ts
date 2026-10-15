import { z } from 'zod';
import { findRoleplayScenario } from '@linguo/shared';
import type { RoleplaySession } from './session';

// The last session is kept in sessionStorage (this tab only, gone when the tab closes) so a reload does not lose the
// conversation. It is cleared when the learner finishes or leaves the session. Nothing here is sent anywhere.

const KEY_PREFIX = 'linguo:roleplay:v1:';

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

const keyOf = (userId: string) => `${KEY_PREFIX}${userId}`;

/** Stores only confirmed messages: an in-flight or failed turn is not part of the saved conversation. */
export function saveSession(userId: string, session: RoleplaySession): void {
  try {
    const messages = session.messages.filter((m) => m.status === 'ok');
    sessionStorage.setItem(keyOf(userId), JSON.stringify({ ...session, messages }));
  } catch {
    // Storage blocked or full: the session simply does not survive a reload.
  }
}

export function clearSession(userId: string): void {
  try {
    sessionStorage.removeItem(keyOf(userId));
  } catch {
    // Nothing to clear.
  }
}

/** The saved session when it is valid and still fits the current path's language (else null and cleared). */
export function loadSession(userId: string, language: string): RoleplaySession | null {
  try {
    const raw = sessionStorage.getItem(keyOf(userId));
    if (!raw) return null;
    const parsed = sessionSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.language !== language || !findRoleplayScenario(parsed.data.language, parsed.data.scenarioKey)) {
      clearSession(userId);
      return null;
    }
    // A session that never got its opening line has nothing to resume.
    return parsed.data.messages.length > 0 ? parsed.data : null;
  } catch {
    return null;
  }
}
