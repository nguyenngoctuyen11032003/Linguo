import { aiRequestSchema, findRoleplayScenario, type RoleplayTurnOutput } from '@linguo/shared';
import { describe, expect, it } from 'vitest';
import {
  addLearnerMessage,
  applyReply,
  buildHistory,
  buildSummaryRequest,
  collectCorrections,
  isOver,
  learnerTurns,
  newSession,
  openingRequest,
  partnerTurns,
  removeMessage,
  setMessageStatus,
  turnRequest,
  type RoleplaySession,
} from './session';

const CAFE = findRoleplayScenario('en', 'cafe_order')!;
const reply = (over: Partial<RoleplayTurnOutput> = {}): RoleplayTurnOutput => ({
  partner_reply: 'Sure! Hot or iced?',
  hint_vi: 'Chọn nóng hoặc lạnh.',
  corrections: [],
  goal_progress: [],
  finished: false,
  ...over,
});

/** A session with `exchanges` completed learner/partner exchanges after the opening. */
function played(exchanges: number): RoleplaySession {
  let s = applyReply(newSession(CAFE, 'a2', 1_000), CAFE, reply({ partner_reply: 'Hi! What can I get you?' }), 'r0', null);
  for (let i = 1; i <= exchanges; i++) {
    const { session, id } = addLearnerMessage(s, `message ${i}`);
    s = applyReply(session, CAFE, reply({ partner_reply: `reply ${i}` }), `r${i}`, id);
  }
  return s;
}

describe('requests', () => {
  it('the opening request is turn 0 without history or message and is valid for the server contract', () => {
    const s = newSession(CAFE, 'a2', 0);
    expect(openingRequest(s)).toMatchObject({ task: 'roleplay_turn', turn_index: 0, history: [], learner_message: '' });
    expect(aiRequestSchema.safeParse(openingRequest(s)).success).toBe(true);
  });

  it('a turn request carries the message, the confirmed history and turn_index = partner turns so far', () => {
    const s = played(1);
    const req = turnRequest(s, '  I want a latte.  ');
    expect(req.turn_index).toBe(2);
    expect(req.learner_message).toBe('I want a latte.');
    expect(req.history).toEqual([
      { role: 'partner', text: 'Hi! What can I get you?' },
      { role: 'learner', text: 'message 1' },
      { role: 'partner', text: 'reply 1' },
    ]);
    expect(aiRequestSchema.safeParse(req).success).toBe(true);
  });

  it('keeps only the last 10 turns and clips every text to 300 characters at every length', () => {
    const long = 'x'.repeat(400);
    for (let n = 0; n < 11; n++) {
      let s = played(n);
      s = { ...s, messages: s.messages.map((m) => (m.role === 'partner' ? { ...m, text: long } : m)) };
      const history = buildHistory(s);
      expect(history.length).toBeLessThanOrEqual(10);
      expect(history.every((t) => t.text.length <= 300)).toBe(true);
      expect(aiRequestSchema.safeParse(turnRequest(s, 'hello')).success, `after ${n} exchanges`).toBe(true);
    }
  });

  it('never puts the unconfirmed (sending or failed) learner message into the history', () => {
    const { session, id } = addLearnerMessage(played(0), 'still sending');
    expect(buildHistory(session).map((t) => t.text)).toEqual(['Hi! What can I get you?']);
    expect(buildHistory(setMessageStatus(session, id, 'failed')).length).toBe(1);
  });
});

describe('applyReply', () => {
  it('adds the partner turn, attaches corrections to the learner message and merges goals', () => {
    const base = played(0);
    const { session, id } = addLearnerMessage(base, 'I want coffee');
    const s = applyReply(
      session,
      CAFE,
      reply({ corrections: [{ original: 'I want coffee', corrected: 'I would like a coffee', note_vi: 'Lịch sự hơn.' }], goal_progress: ['order_drink'] }),
      'r1',
      id,
    );
    const learner = s.messages.find((m) => m.id === id)!;
    expect(learner.status).toBe('ok');
    expect(learner.corrections).toHaveLength(1);
    expect(s.messages.at(-1)).toMatchObject({ role: 'partner', responseId: 'r1', hint_vi: 'Chọn nóng hoặc lạnh.' });
    expect(s.goals).toEqual(['order_drink']);
  });

  it('ignores goal keys outside the scenario and never loses reached goals', () => {
    let s = played(0);
    s = applyReply(s, CAFE, reply({ goal_progress: ['order_drink', 'hack'] }), 'a', null);
    s = applyReply(s, CAFE, reply({ goal_progress: ['pay'] }), 'b', null);
    expect(s.goals.sort()).toEqual(['order_drink', 'pay']);
  });

  it('finishes when the reply says so, when every goal is reached, or at the turn cap', () => {
    expect(isOver(applyReply(played(0), CAFE, reply({ finished: true }), 'x', null))).toBe(true);
    expect(isOver(applyReply(played(0), CAFE, reply({ goal_progress: CAFE.goals.map((g) => g.key) }), 'x', null))).toBe(true);
    expect(isOver(played(3))).toBe(false);
    const full = played(11);
    expect(partnerTurns(full)).toBe(12);
    expect(isOver(full)).toBe(true);
  });
});

describe('message bookkeeping', () => {
  it('counts only confirmed turns', () => {
    const { session } = addLearnerMessage(played(2), 'pending');
    expect(partnerTurns(session)).toBe(3);
    expect(learnerTurns(session)).toBe(2);
  });

  it('removes a failed message', () => {
    const { session, id } = addLearnerMessage(played(0), 'oops');
    expect(removeMessage(session, id).messages).toHaveLength(1);
  });

  it('collects at most six corrections', () => {
    let s = played(0);
    for (let i = 0; i < 5; i++) {
      const { session, id } = addLearnerMessage(s, `m${i}`);
      const c = { original: `o${i}`, corrected: `c${i}`, note_vi: 'n' };
      s = applyReply(session, CAFE, reply({ corrections: [c, c] }), `r${i}`, id);
    }
    expect(collectCorrections(s)).toHaveLength(6);
  });
});

describe('buildSummaryRequest', () => {
  it('is numbers only, bounded and valid for summarize_session', () => {
    const base = played(2);
    const s = { ...base, messages: base.messages.map((m) => (m.id === 2 ? { ...m, corrections: [{ original: 'a', corrected: 'b', note_vi: 'c' }] } : m)) };
    const req = buildSummaryRequest(s, 1_000 + 7 * 60_000);
    expect(req).toMatchObject({
      task: 'summarize_session',
      language: 'en',
      minutes: 7,
      activities: [{ kind: 'practice', status: 'done', minutes: 7 }],
      accuracy_by_stage: [{ stage: 'application', attempts: 2, correct: 1 }],
      error_tags: [{ tag: 'roleplay_corrections', count: 1 }],
    });
    expect(aiRequestSchema.safeParse(req).success).toBe(true);
    expect(JSON.stringify(req)).not.toContain('message 1');
  });

  it('has no accuracy or tags when nothing was said, and at least one minute', () => {
    const req = buildSummaryRequest(played(0), 1_000);
    expect(req).toMatchObject({ minutes: 1, accuracy_by_stage: [], error_tags: [] });
    expect(aiRequestSchema.safeParse(req).success).toBe(true);
  });
});
