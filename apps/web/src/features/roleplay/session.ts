import {
  ROLEPLAY_HISTORY_MAX_TURNS,
  ROLEPLAY_MAX_TURNS,
  ROLEPLAY_TURN_MAX_CHARS,
  type RoleplayScenario,
  type RoleplayTurnOutput,
  type RoleplayTurnRequestInput,
  type SummarizeSessionRequestInput,
} from '@linguo/shared';

// Spec 8.2 #6: a role-play session lives in the browser only. The server sees one bounded request per turn
// (the last turns of the conversation, never a stored history), and a compact numbers-only summary at the end.

export type RoleplayLanguage = 'en' | 'ko';

export interface RoleplayCorrection {
  original: string;
  corrected: string;
  note_vi: string;
}

export interface RoleplayMessage {
  id: number;
  role: 'partner' | 'learner';
  text: string;
  /** Gentle corrections of this learner message (empty for partner messages). */
  corrections: RoleplayCorrection[];
  /** One-line Vietnamese hint that came with this partner reply. */
  hint_vi: string | null;
  /** `response_id` of the AI answer (partner messages), for the report button. */
  responseId: string | null;
  /** A learner message is 'sending' while its turn is in flight and 'failed' when the turn did not go through. */
  status: 'ok' | 'sending' | 'failed';
}

export interface RoleplaySession {
  scenarioKey: string;
  language: RoleplayLanguage;
  level: string;
  /** Epoch ms of the start (for the minutes in the summary). */
  startedAt: number;
  messages: RoleplayMessage[];
  /** Goal keys reached so far (a subset of the scenario's goals). */
  goals: string[];
  finished: boolean;
  nextId: number;
}

export const MAX_TURNS = ROLEPLAY_MAX_TURNS;
/** Corrections kept for the recap (bounded so the summary and the screen stay short). */
export const RECAP_CORRECTIONS_MAX = 6;

export function newSession(scenario: RoleplayScenario, level: string, now: number): RoleplaySession {
  return { scenarioKey: scenario.key, language: scenario.language, level, startedAt: now, messages: [], goals: [], finished: false, nextId: 1 };
}

const confirmed = (s: RoleplaySession) => s.messages.filter((m) => m.status === 'ok');

/** Partner replies so far, the opening line included: the "n" of the "n/12" counter. */
export function partnerTurns(s: RoleplaySession): number {
  return confirmed(s).filter((m) => m.role === 'partner').length;
}

export function learnerTurns(s: RoleplaySession): number {
  return confirmed(s).filter((m) => m.role === 'learner').length;
}

/** The session accepts no more turns (goal reached, or the turn cap). */
export function isOver(s: RoleplaySession): boolean {
  return s.finished || partnerTurns(s) >= MAX_TURNS;
}

const clip = (text: string) => Array.from(text.trim()).slice(0, ROLEPLAY_TURN_MAX_CHARS).join('');

/** The last ≤ 10 confirmed turns, each clipped to 300 characters (the server's own bounds). */
export function buildHistory(s: RoleplaySession): { role: 'partner' | 'learner'; text: string }[] {
  return confirmed(s)
    .slice(-ROLEPLAY_HISTORY_MAX_TURNS)
    .map((m) => ({ role: m.role, text: clip(m.text) }))
    .filter((t) => t.text.length > 0);
}

/** Request for the partner's opening line (turn 0: no history, no message). */
export function openingRequest(s: RoleplaySession): RoleplayTurnRequestInput {
  return { task: 'roleplay_turn', language: s.language, level: s.level, scenario_key: s.scenarioKey, history: [], learner_message: '', turn_index: 0 };
}

/** Request for the reply to `text`; the learner message itself is not in `history` yet. */
export function turnRequest(s: RoleplaySession, text: string): RoleplayTurnRequestInput {
  return {
    task: 'roleplay_turn',
    language: s.language,
    level: s.level,
    scenario_key: s.scenarioKey,
    history: buildHistory(s),
    learner_message: clip(text),
    turn_index: partnerTurns(s),
  };
}

export function addLearnerMessage(s: RoleplaySession, text: string): { session: RoleplaySession; id: number } {
  const id = s.nextId;
  const message: RoleplayMessage = { id, role: 'learner', text: clip(text), corrections: [], hint_vi: null, responseId: null, status: 'sending' };
  return { session: { ...s, messages: [...s.messages, message], nextId: id + 1 }, id };
}

export function setMessageStatus(s: RoleplaySession, id: number, status: RoleplayMessage['status']): RoleplaySession {
  return { ...s, messages: s.messages.map((m) => (m.id === id ? { ...m, status } : m)) };
}

export function removeMessage(s: RoleplaySession, id: number): RoleplaySession {
  return { ...s, messages: s.messages.filter((m) => m.id !== id) };
}

/** Adds the partner's reply, attaches the corrections to the learner message it answers, merges the goals. */
export function applyReply(
  s: RoleplaySession,
  scenario: RoleplayScenario,
  output: RoleplayTurnOutput,
  responseId: string,
  learnerId: number | null,
): RoleplaySession {
  const known = new Set(scenario.goals.map((g) => g.key));
  const goals = [...new Set([...s.goals, ...output.goal_progress.filter((k) => known.has(k))])];
  const messages = s.messages.map((m) =>
    m.id === learnerId ? { ...m, status: 'ok' as const, corrections: output.corrections.slice(0, 2) } : m,
  );
  const partner: RoleplayMessage = {
    id: s.nextId,
    role: 'partner',
    text: output.partner_reply,
    corrections: [],
    hint_vi: output.hint_vi,
    responseId,
    status: 'ok',
  };
  const next: RoleplaySession = { ...s, messages: [...messages, partner], goals, nextId: s.nextId + 1 };
  return { ...next, finished: output.finished || goals.length >= scenario.goals.length || partnerTurns(next) >= MAX_TURNS };
}

/** Corrections collected over the session, newest last, at most RECAP_CORRECTIONS_MAX. */
export function collectCorrections(s: RoleplaySession): RoleplayCorrection[] {
  return confirmed(s)
    .flatMap((m) => m.corrections)
    .slice(0, RECAP_CORRECTIONS_MAX);
}

/**
 * Compact, numbers-only summary for `summarize_session` (no message text, no personal data): minutes spent, one
 * practice activity, and how many of the learner's turns needed a correction.
 */
export function buildSummaryRequest(s: RoleplaySession, now: number): SummarizeSessionRequestInput {
  const minutes = Math.min(120, Math.max(1, Math.round((now - s.startedAt) / 60_000)));
  const turns = confirmed(s).filter((m) => m.role === 'learner');
  const withCorrections = turns.filter((m) => m.corrections.length > 0).length;
  const request: SummarizeSessionRequestInput = {
    task: 'summarize_session',
    language: s.language,
    level: s.level,
    minutes,
    activities: [{ kind: 'practice', status: 'done', minutes }],
    accuracy_by_stage: turns.length > 0 ? [{ stage: 'application', attempts: turns.length, correct: turns.length - withCorrections }] : [],
    error_tags: withCorrections > 0 ? [{ tag: 'roleplay_corrections', count: Math.min(999, withCorrections) }] : [],
  };
  return request;
}
