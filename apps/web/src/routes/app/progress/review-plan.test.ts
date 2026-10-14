import { aiRequestSchema, type Mistake, type ProgressDashboard } from '@linguo/shared';
import { describe, expect, it } from 'vitest';
import { buildPlanReviewRequest, PLAN_GAP_LIMITS } from './review-plan';
import { dashboardFixture } from './progress-test-fixtures';

const L1 = '11111111-1111-4111-8111-111111111111';
const L2 = '22222222-2222-4222-8222-222222222222';
const learner = { language: 'en', level: 'a2' } as const;

const mistake = (lesson_id: string, lesson_title: string, wrong_count: number, prompt = 'She ___ home.'): Mistake => ({
  prompt,
  lesson_id,
  lesson_title,
  wrong_count,
  last_wrong_at: '2026-10-13T08:00:00Z',
});

function dashboard(over: Partial<ProgressDashboard>): ProgressDashboard {
  return dashboardFixture({ mistakes: [], exercise_types: [], ...over });
}

describe('buildPlanReviewRequest', () => {
  it('returns null when there are no gaps', () => {
    expect(buildPlanReviewRequest(dashboard({}), learner)).toBeNull();
  });

  it('aggregates mistakes per lesson, biggest first, and never sends the question text', () => {
    const req = buildPlanReviewRequest(
      dashboard({ mistakes: [mistake(L1, 'Present simple', 2, 'secret text A'), mistake(L2, 'Articles', 5), mistake(L1, 'Present simple', 3, 'secret text B')] }),
      learner,
    );
    expect(req).toMatchObject({ task: 'plan_review', language: 'en', level: 'a2' });
    expect(req?.task === 'plan_review' && req.gaps).toEqual([
      { kind: 'lesson', id: L1, label: 'Present simple', count: 5 },
      { kind: 'lesson', id: L2, label: 'Articles', count: 5 },
    ]);
    expect(JSON.stringify(req)).not.toContain('secret text');
  });

  it('adds weak exercise types (accuracy under 80% with enough attempts) as tag gaps with Vietnamese labels', () => {
    const base = { prev_attempts: 0, prev_accuracy: null };
    const req = buildPlanReviewRequest(
      dashboard({
        exercise_types: [
          { exercise_type: 'mcq', attempts: 10, accuracy: 0.5, ...base },
          { exercise_type: 'translate', attempts: 10, accuracy: 0.95, ...base },
          { exercise_type: 'listen', attempts: 3, accuracy: null, ...base },
        ],
      }),
      learner,
    );
    expect(req?.task === 'plan_review' && req.gaps).toEqual([{ kind: 'tag', id: 'mcq', label: 'Trắc nghiệm', count: 5 }]);
  });

  it('stays inside the contract limits and passes the request schema', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      mistake(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, `Bài ${'x'.repeat(200)} ${i}`, 1000 + i),
    );
    const req = buildPlanReviewRequest(dashboard({ mistakes: many.slice(0, 10) }), learner);
    expect(req?.task === 'plan_review' && req.gaps.length).toBeLessThanOrEqual(PLAN_GAP_LIMITS.lessons);
    expect(aiRequestSchema.safeParse(req).success).toBe(true);
    if (req?.task === 'plan_review') {
      for (const g of req.gaps) {
        expect(g.label.length).toBeLessThanOrEqual(80);
        expect(g.count).toBeLessThanOrEqual(999);
      }
    }
  });
});
