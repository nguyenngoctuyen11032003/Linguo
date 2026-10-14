import { aiRequestSchema, type StudySession } from '@linguo/shared';
import { describe, expect, it } from 'vitest';
import { buildSessionSummaryRequest } from './session-summary';
import type { SessionMistake } from '@/features/session/service';

const ID = '11111111-1111-4111-8111-111111111111';
const learner = { language: 'en', level: 'a2' } as const;

function session(activities: Array<{ kind: 'review' | 'lesson' | 'practice' | 'recap'; status: 'pending' | 'done' | 'skipped'; minutes: number; seconds: number }>): StudySession {
  return {
    id: ID,
    path_id: ID,
    local_date: '2026-10-13',
    status: 'completed',
    minutes_planned: 15,
    created_at: '2026-10-13T01:00:00Z',
    started_at: '2026-10-13T01:00:00Z',
    completed_at: '2026-10-13T01:20:00Z',
    plan: {
      minutes: 15,
      focus_vi: 'Ôn tập',
      backlog_mode: false,
      activities: activities.map((a, i) => ({
        id: `a${i + 1}`,
        kind: a.kind,
        minutes: a.minutes,
        lesson_id: null,
        review_limit: null,
        title_vi: 'SECRET TITLE',
        reason_vi: 'SECRET REASON',
        priority: 1,
        status: a.status,
        seconds_spent: a.seconds,
      })),
    } as StudySession['plan'],
  };
}

const mistake = (exercise_type: string, n: number): SessionMistake => ({
  attempt_id: ID,
  lesson_id: ID,
  exercise_id: ID,
  exercise_type,
  prompt_text: `prompt ${n} (secret)`,
  expected_answer: 'secret answer',
  learner_answer: 'secret reply',
  created_at: '2026-10-13T01:05:00Z',
});

describe('buildSessionSummaryRequest', () => {
  it('summarises activities as kind, status and minutes only', () => {
    const req = buildSessionSummaryRequest(
      session([
        { kind: 'review', status: 'done', minutes: 5, seconds: 290 },
        { kind: 'lesson', status: 'skipped', minutes: 7, seconds: 0 },
      ]),
      learner,
      [],
    );
    expect(req).toEqual({
      task: 'summarize_session',
      language: 'en',
      level: 'a2',
      minutes: 5,
      activities: [
        { kind: 'review', status: 'done', minutes: 5 },
        { kind: 'lesson', status: 'skipped', minutes: 7 },
      ],
      error_tags: [],
    });
    expect(aiRequestSchema.safeParse(req).success).toBe(true);
  });

  it('turns the recap mistakes into counted tags (top 5) and leaks no text', () => {
    const mistakes = [
      mistake('mcq', 1),
      mistake('mcq', 2),
      mistake('translate', 3),
      mistake('Bad Type!', 4),
      mistake('listen', 5),
      mistake('word_bank', 6),
      mistake('fill_blank', 7),
      mistake('fill_blank', 8),
    ];
    const req = buildSessionSummaryRequest(session([{ kind: 'recap', status: 'done', minutes: 3, seconds: 100 }]), learner, mistakes);
    expect(req.error_tags?.[0]).toEqual({ tag: 'fill_blank', count: 2 } satisfies { tag: string; count: number });
    expect(req.error_tags).toHaveLength(5);
    expect(req.error_tags).toContainEqual({ tag: 'mcq', count: 2 });
    expect(req.error_tags?.some((t) => /bad/i.test(t.tag))).toBe(false);
    const json = JSON.stringify(req);
    for (const secret of ['SECRET', 'secret']) expect(json).not.toContain(secret);
    expect(aiRequestSchema.safeParse(req).success).toBe(true);
  });

  it('clamps minutes and activity count to the contract', () => {
    const many = Array.from({ length: 12 }, () => ({ kind: 'practice' as const, status: 'done' as const, minutes: 120, seconds: 99_999 }));
    const req = buildSessionSummaryRequest(session(many), learner, []);
    expect(req.activities.length).toBeLessThanOrEqual(12);
    expect(req.minutes).toBeLessThanOrEqual(300);
    expect(aiRequestSchema.safeParse(req).success).toBe(true);
  });
});
