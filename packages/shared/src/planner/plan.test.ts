import { describe, expect, it } from 'vitest';
import {
  SESSION_LENGTHS,
  sessionPlanSchema,
  type CandidateLesson,
  type SessionInputs,
  type SessionPlan,
} from './contract';
import { estimateReviewMinutes, nearestSessionLength, planSession, shortenPlan } from './plan';

const L = (n: number, over: Partial<CandidateLesson> = {}): CandidateLesson => ({
  lesson_id: `00000000-0000-4000-8000-00000000000${n}`,
  title_vi: `Bài ${n}`,
  estimated_minutes: 10,
  skills: ['vocabulary'],
  run_status: 'not_started',
  unit_order: 1,
  lesson_order: n,
  ...over,
});

const base = (over: Partial<SessionInputs> = {}): SessionInputs => ({
  path_id: '00000000-0000-4000-8000-0000000000aa',
  language_code: 'en',
  local_date: '2026-10-13',
  daily_goal_minutes: 30,
  studied_seconds_today: 0,
  due_count: 20,
  overdue_count: 5,
  new_card_count: 5,
  next_lessons: [L(1), L(2, { skills: ['grammar'] }), L(3, { skills: ['listening'] }), L(4)],
  skills: [
    { skill: 'grammar', level_code: 'A1', confidence: 'medium', recent_accuracy: 0.58 },
    { skill: 'vocabulary', level_code: 'A1', confidence: 'medium', recent_accuracy: 0.8 },
  ],
  days_since_last_study: 1,
  ...over,
});

const total = (p: SessionPlan) => p.activities.reduce((s, a) => s + a.minutes, 0);
const DIGITS = /\d/;

function expectValid(p: SessionPlan, minutes: number) {
  expect(sessionPlanSchema.safeParse(p).success).toBe(true);
  expect(total(p)).toBeLessThanOrEqual(minutes);
  expect(p.activities.length).toBeGreaterThan(0);
  expect(p.activities.map((a) => a.id)).toEqual(p.activities.map((_, i) => `a${i + 1}`));
  for (const a of p.activities) {
    expect(a.status).toBe('pending');
    expect(a.seconds_spent).toBe(0);
    if (a.kind === 'review') expect(a.review_limit).not.toBeNull();
    else expect(a.review_limit).toBeNull();
    if (a.kind === 'lesson' || a.kind === 'practice') expect(a.lesson_id).not.toBeNull();
    else expect(a.lesson_id).toBeNull();
  }
}

describe('helpers', () => {
  it.each([
    [0, 15],
    [5, 10],
    [12, 10],
    [13, 15],
    [20, 15],
    [25, 30],
    [40, 45],
    [75, 60],
    [100, 90],
    [500, 120],
  ])('nearestSessionLength(%i) = %i', (goal, expected) => {
    expect(nearestSessionLength(goal)).toBe(expected);
  });

  it('estimates 12 s per due card and 30 s per new card, rounded up', () => {
    expect(estimateReviewMinutes(0, 0)).toBe(0);
    expect(estimateReviewMinutes(5, 0)).toBe(1);
    expect(estimateReviewMinutes(6, 0)).toBe(2);
    expect(estimateReviewMinutes(10, 2)).toBe(3);
  });
});

describe('planSession: every session length', () => {
  it.each(SESSION_LENGTHS.map((m) => [m]))('%i minutes: valid, fits, deterministic', (m) => {
    const p = planSession(base(), m);
    expectValid(p, m);
    expect(p.minutes).toBe(m);
    expect(p.backlog_mode).toBe(false);
    expect(planSession(base(), m)).toEqual(p);
    const kinds = p.activities.map((a) => a.kind);
    if (m <= 15) {
      expect(kinds).not.toContain('recap');
      expect(kinds).not.toContain('practice');
      expect(kinds.filter((k) => k === 'lesson').length).toBeLessThanOrEqual(1);
      expect(kinds).toContain('review');
    } else {
      expect(kinds).toContain('review');
      expect(kinds).toContain('lesson');
      if (m >= 30) expect(kinds[kinds.length - 1]).toBe('recap');
    }
  });

  it('gives review at least 5 minutes when cards are due and the work needs it', () => {
    const p = planSession(base({ due_count: 25, overdue_count: 0, new_card_count: 0 }), 10);
    const review = p.activities.find((a) => a.kind === 'review')!;
    expect(review.minutes).toBe(5);
    expect(review.review_limit).toBe(25);
  });

  it('recap is at least 3 minutes at 30 minutes', () => {
    const p = planSession(base(), 30);
    const recap = p.activities.find((a) => a.kind === 'recap')!;
    expect(recap.minutes).toBeGreaterThanOrEqual(3);
    expect(recap.priority).toBe(10);
  });

  it('clamps out-of-range minutes into 5..120', () => {
    expectValid(planSession(base(), 2), 5);
    expect(planSession(base(), 2).minutes).toBe(5);
    expect(planSession(base(), 300).minutes).toBe(120);
  });
});

describe('planSession: review', () => {
  it('reports real due and overdue numbers, priority 90 when overdue', () => {
    const p = planSession(base({ due_count: 18, overdue_count: 6, new_card_count: 0 }), 30);
    const r = p.activities.find((a) => a.kind === 'review')!;
    expect(r.reason_vi).toContain('18 thẻ đến hạn');
    expect(r.reason_vi).toContain('6 thẻ quá hạn');
    expect(r.priority).toBe(90);
    expect(p.activities[0]!.kind).toBe('review');
  });

  it('priority 75 when nothing is overdue', () => {
    const p = planSession(base({ overdue_count: 0 }), 30);
    expect(p.activities.find((a) => a.kind === 'review')!.priority).toBe(75);
  });

  it('review_limit covers exactly the cards that fit', () => {
    // 20 due * 12 s = 4 min, 5 new * 30 s = 2.5 min → 7 min needed; a 15-min session budgets 5
    const p = planSession(base(), 15);
    const r = p.activities.find((a) => a.kind === 'review')!;
    expect(r.minutes).toBe(5);
    expect(r.review_limit).toBe(20 + 2);
  });

  it('no due cards: no review from due queue, new cards still offered', () => {
    const p = planSession(base({ due_count: 0, overdue_count: 0, new_card_count: 4 }), 30);
    expectValid(p, 30);
    const r = p.activities.find((a) => a.kind === 'review')!;
    expect(r.reason_vi).toContain('4 thẻ mới');
    expect(r.reason_vi).not.toContain('đến hạn');
    expect(r.review_limit).toBe(4);
    expect(r.minutes).toBe(2);
  });

  it('no cards at all: no review activity, lessons fill the session', () => {
    const p = planSession(base({ due_count: 0, overdue_count: 0, new_card_count: 0 }), 30);
    expectValid(p, 30);
    expect(p.activities.map((a) => a.kind)).not.toContain('review');
    expect(p.activities.filter((a) => a.kind === 'lesson').length).toBeGreaterThan(0);
    expect(p.focus_vi).not.toMatch(DIGITS);
  });

  it('few due cards and no lessons: review extends to cover them all', () => {
    // 80 cards = 16 min needed, not more than 2 × the 9-minute default → not a backlog
    const q = planSession(base({ due_count: 80, overdue_count: 0, new_card_count: 0, next_lessons: [] }), 45);
    expectValid(q, 45);
    expect(q.backlog_mode).toBe(false);
    expect(q.activities.find((a) => a.kind === 'review')!.minutes).toBe(16);
    expect(q.activities.find((a) => a.kind === 'review')!.review_limit).toBe(80);
  });
});

describe('planSession: backlog mode', () => {
  it('turns on with a large due count and caps review at 50%', () => {
    const p = planSession(base({ due_count: 400, overdue_count: 300, new_card_count: 20 }), 30);
    expectValid(p, 30);
    expect(p.backlog_mode).toBe(true);
    const r = p.activities.find((a) => a.kind === 'review')!;
    expect(r.minutes).toBe(15);
    expect(r.review_limit).toBe(75);
    expect(p.focus_vi).toContain('75 thẻ');
    expect(p.activities.filter((a) => a.kind === 'lesson').length).toBeLessThanOrEqual(1);
  });

  it('no new lesson in a short backlog session', () => {
    const p = planSession(base({ due_count: 400, overdue_count: 300 }), 15);
    expectValid(p, 15);
    expect(p.backlog_mode).toBe(true);
    expect(p.activities.map((a) => a.kind)).toEqual(['review']);
  });

  it('a long break turns it on even with few cards', () => {
    const p = planSession(base({ due_count: 10, overdue_count: 10, days_since_last_study: 4 }), 60);
    expectValid(p, 60);
    expect(p.backlog_mode).toBe(true);
    expect(p.focus_vi).toMatch(/quay lại/i);
    expect(p.activities.filter((a) => a.kind === 'lesson').length).toBeLessThanOrEqual(1);
  });

  it('a long break with nothing due still offers one gentle lesson', () => {
    const p = planSession(
      base({ due_count: 0, overdue_count: 0, new_card_count: 0, days_since_last_study: 30 }),
      10,
    );
    expectValid(p, 10);
    expect(p.backlog_mode).toBe(true);
    expect(p.activities.map((a) => a.kind)).toEqual(['lesson']);
  });

  it('three days off is not a long break', () => {
    expect(planSession(base({ days_since_last_study: 3 }), 30).backlog_mode).toBe(false);
  });

  it('wording never shames the learner', () => {
    for (const inputs of [
      base({ due_count: 400, overdue_count: 300 }),
      base({ days_since_last_study: 40 }),
      base({ due_count: 0, overdue_count: 0, new_card_count: 0, next_lessons: [] }),
    ]) {
      const p = planSession(inputs, 30);
      const text = [p.focus_vi, ...p.activities.flatMap((a) => [a.title_vi, a.reason_vi])].join(' ');
      expect(text).not.toMatch(/thất bại|lười|bỏ bê|tệ|phải hoàn thành ngay/i);
    }
  });
});

describe('planSession: lessons', () => {
  it('resumes an in_progress lesson first with priority 80', () => {
    const inputs = base({
      overdue_count: 0,
      next_lessons: [L(1), L(2, { run_status: 'in_progress', skills: ['grammar'] }), L(3)],
    });
    const p = planSession(inputs, 30);
    expectValid(p, 30);
    expect(p.activities[0]!.kind).toBe('lesson');
    expect(p.activities[0]!.lesson_id).toBe(L(2).lesson_id);
    expect(p.activities[0]!.priority).toBe(80);
    expect(p.activities[0]!.reason_vi).toMatch(/dở/);
  });

  it('new lessons get priority 60 and a path reason', () => {
    const p = planSession(base(), 30);
    const lesson = p.activities.find((a) => a.kind === 'lesson')!;
    expect(lesson.lesson_id).toBe(L(1).lesson_id);
    expect(lesson.priority).toBe(60);
    expect(lesson.reason_vi).toContain('lộ trình tiếng Anh');
  });

  it('no next lessons: review + recap only, still valid', () => {
    const p = planSession(base({ next_lessons: [] }), 30);
    expectValid(p, 30);
    expect(p.activities.map((a) => a.kind)).toEqual(['review', 'recap']);
  });

  it('lesson minutes never exceed its estimate', () => {
    const p = planSession(base({ next_lessons: [L(1, { estimated_minutes: 4 })] }), 60);
    expectValid(p, 60);
    expect(p.activities.find((a) => a.kind === 'lesson')!.minutes).toBe(4);
  });

  it('truncates very long lesson titles to fit the schema', () => {
    const p = planSession(base({ next_lessons: [L(1, { title_vi: 'x'.repeat(300) })] }), 30);
    expectValid(p, 30);
  });
});

describe('planSession: weak skill practice', () => {
  it('picks the lowest-accuracy skill and the first unused lesson training it', () => {
    const p = planSession(base(), 45);
    expectValid(p, 45);
    const practice = p.activities.find((a) => a.kind === 'practice')!;
    expect(practice.lesson_id).toBe(L(2).lesson_id);
    expect(practice.reason_vi).toContain('Ngữ pháp đang đúng 58% trong 2 tuần qua');
    expect(practice.priority).toBe(50 + Math.round(0.42 * 20));
    const lessonIds = p.activities.filter((a) => a.kind === 'lesson').map((a) => a.lesson_id);
    expect(lessonIds).not.toContain(practice.lesson_id);
  });

  it('falls back to a self_reported/low skill without inventing numbers', () => {
    const p = planSession(
      base({
        skills: [
          { skill: 'vocabulary', level_code: 'A1', confidence: 'medium', recent_accuracy: null },
          { skill: 'listening', level_code: 'A1', confidence: 'self_reported', recent_accuracy: null },
        ],
      }),
      45,
    );
    expectValid(p, 45);
    const practice = p.activities.find((a) => a.kind === 'practice')!;
    expect(practice.lesson_id).toBe(L(3).lesson_id);
    expect(practice.reason_vi).not.toMatch(DIGITS);
    expect(practice.priority).toBe(50);
  });

  it('no skill data: no practice activity and no fake numbers', () => {
    const p = planSession(base({ skills: [], overdue_count: 0, due_count: 0, new_card_count: 0 }), 45);
    expectValid(p, 45);
    expect(p.activities.map((a) => a.kind)).not.toContain('practice');
    const text = [p.focus_vi, ...p.activities.map((a) => a.reason_vi)].join(' ');
    expect(text).not.toMatch(/%/);
    expect(text).not.toMatch(DIGITS);
  });

  it('no lesson for the weak skill: practice dropped, minutes go to new lessons', () => {
    const inputs = base({
      skills: [{ skill: 'speaking', level_code: 'A1', confidence: 'medium', recent_accuracy: 0.3 }],
    });
    const p = planSession(inputs, 45);
    expectValid(p, 45);
    expect(p.activities.map((a) => a.kind)).not.toContain('practice');
    const withPractice = planSession(base(), 45);
    const lessonMinutes = (q: SessionPlan) =>
      q.activities.filter((a) => a.kind === 'lesson').reduce((s, a) => s + a.minutes, 0);
    expect(lessonMinutes(p)).toBeGreaterThan(lessonMinutes(withPractice));
  });
});

describe('planSession: never empty', () => {
  it('nothing to do: one short recap with an honest reason', () => {
    for (const m of SESSION_LENGTHS) {
      const p = planSession(
        base({ due_count: 0, overdue_count: 0, new_card_count: 0, next_lessons: [], skills: [] }),
        m,
      );
      expectValid(p, m);
      expect(p.activities).toHaveLength(1);
      expect(p.activities[0]!.kind).toBe('recap');
      expect(p.activities[0]!.minutes).toBeLessThanOrEqual(5);
      expect(p.activities[0]!.reason_vi).not.toMatch(DIGITS);
    }
  });
});

describe('planSession: sweep over many inputs', () => {
  const dues = [0, 1, 7, 30, 120, 999];
  const breaks = [null, 0, 3, 4, 60];
  const lessonSets: CandidateLesson[][] = [
    [],
    [L(1, { estimated_minutes: 1 })],
    [L(1, { estimated_minutes: 45, run_status: 'in_progress' }), L(2, { skills: ['grammar'] }), L(3), L(4), L(5)],
  ];
  it('always valid, within the requested minutes, deterministic, and shortenable', () => {
    for (const m of [5, ...SESSION_LENGTHS]) {
      for (const due of dues) {
        for (const days of breaks) {
          for (const next_lessons of lessonSets) {
            const inputs = base({
              due_count: due,
              overdue_count: Math.floor(due / 2),
              new_card_count: due % 7,
              days_since_last_study: days,
              next_lessons,
            });
            const p = planSession(inputs, m);
            expectValid(p, m);
            expect(planSession(inputs, m)).toEqual(p);
            for (const s of [5, 10, 15]) expectValidShort(shortenPlan(p, s), s);
          }
        }
      }
    }
  });
});

describe('shortenPlan', () => {
  it('keeps the highest priority activities and trims the last one', () => {
    const p = planSession(base(), 60);
    const s = shortenPlan(p, 15);
    expectValidShort(s, 15);
    expect(s.minutes).toBe(15);
    const keptPriorities = s.activities.map((a) => a.priority);
    const dropped = p.activities.filter((a) => !s.activities.some((k) => k.id === a.id));
    for (const d of dropped) expect(d.priority).toBeLessThanOrEqual(Math.min(...keptPriorities));
    expect(s.activities.some((a) => a.kind === 'review')).toBe(true);
    expect(total(s)).toBe(15);
  });

  it('keeps ids and original order of kept activities', () => {
    const p = planSession(base(), 60);
    const s = shortenPlan(p, 20);
    const idx = s.activities.map((a) => p.activities.findIndex((x) => x.id === a.id));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    expect(new Set(s.activities.map((a) => a.id)).size).toBe(s.activities.length);
  });

  it('scales review_limit down when the review is trimmed', () => {
    const p = planSession(base({ due_count: 400, overdue_count: 300 }), 60);
    const r = p.activities.find((a) => a.kind === 'review')!;
    const s = shortenPlan(p, 10);
    expectValidShort(s, 10);
    expect(s.activities).toHaveLength(1);
    const sr = s.activities[0]!;
    expect(sr.minutes).toBe(10);
    expect(sr.review_limit).toBe(Math.floor((r.review_limit! * 10) / r.minutes));
  });

  it('is a no-op on the activities when the plan already fits', () => {
    const p = planSession(base(), 30);
    expect(shortenPlan(p, 30).activities).toEqual(p.activities);
  });

  it('keeps finished activities of a session in progress and gives the new minutes to pending ones', () => {
    const p = planSession(base(), 60);
    // The learner already did the top activity and skipped the second one.
    const started: SessionPlan = {
      ...p,
      activities: p.activities.map((a, i) =>
        i === 0 ? { ...a, status: 'done', seconds_spent: 300 } : i === 1 ? { ...a, status: 'skipped' } : a,
      ),
    };
    const finished = started.activities.slice(0, 2);
    const finishedMinutes = finished.reduce((s, a) => s + a.minutes, 0);
    const s = shortenPlan(started, 10);
    expect(sessionPlanSchema.safeParse(s).success).toBe(true);
    expect(s.activities.slice(0, 2)).toEqual(finished);
    const pending = s.activities.filter((a) => a.status === 'pending');
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.reduce((sum, a) => sum + a.minutes, 0)).toBe(10);
    expect(s.minutes).toBe(finishedMinutes + 10);
    expect(total(s)).toBeLessThanOrEqual(s.minutes);
  });

  it('never returns an empty plan and is deterministic', () => {
    const p = planSession(base(), 120);
    for (const m of [1, 5, 10]) {
      const s = shortenPlan(p, m);
      expectValidShort(s, Math.max(5, m));
      expect(shortenPlan(p, m)).toEqual(s);
    }
  });
});

function expectValidShort(p: SessionPlan, minutes: number) {
  expect(sessionPlanSchema.safeParse(p).success).toBe(true);
  expect(total(p)).toBeLessThanOrEqual(minutes);
  expect(p.activities.length).toBeGreaterThan(0);
}
