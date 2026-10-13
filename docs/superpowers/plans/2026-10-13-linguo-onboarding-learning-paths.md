# Linguo Onboarding & Learning Paths Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user create one learning path per language (EN/KO) through a 6-step onboarding wizard with a reference-hours time estimate, switch the current language, and edit/pause/archive paths.

**Architecture:** Pure estimate + level logic in `packages/shared/src/learning/` (also mirrored by a SQL function, both checked against one JSON fixture file). New Supabase migration adds `level_reference_hours`, `learning_paths`, `skill_estimates`, `profiles.current_learning_path_id` and SECURITY DEFINER RPCs; clients only read via RLS and write via RPC. Web: `features/learning-paths` (service, provider, shared form components), `/app/bat-dau` full-screen wizard outside `AppLayout`, Home summary card, LanguagePill switching, Settings section.

**Tech Stack:** Same as foundation — React 18, TS 6 strict + `verbatimModuleSyntax`, Tailwind v4, motion 12, react-router 7, supabase-js 2, zod 4, Vitest 5 + Testing Library + happy-dom, Playwright + axe, Supabase CLI 2.120.0 + pgTAP.

**Spec:** [docs/superpowers/specs/2026-10-13-linguo-onboarding-learning-paths-design.md](../specs/2026-10-13-linguo-onboarding-learning-paths-design.md)

---

## Ground rules

- Repo `D:\Code\Tuyen\Linguo`. **Work on `main`** (project rule). Agents in isolated worktrees: start with `git reset --hard main`, `pnpm install --frozen-lockfile`; the controller merges back into `main`.
- Bash tool. Commits: Conventional Commits; **no `Co-Authored-By`, no mention of Claude/Anthropic/AI**; stage explicit paths (never `git add -A`). Do not push.
- No new dependencies.
- Local Supabase ports 553xx (see `supabase/config.toml`). Before `pnpm db:start`, check `pnpm exec supabase status`; `pnpm db:stop` when done.
- Vietnamese UI text exactly as written. Path alias `@/` = `apps/web/src/`.
- Existing helpers to reuse: `renderWithProviders`, `TEST_USER_ID` (`apps/web/tests/unit/render.tsx`), `fakeQuery`/`fakeClient` (`tests/unit/fake-supabase.ts`), `Button`/`buttonClasses`, `FormField`, `Input`, `SolidCard`, `GlassCard`, `ErrorState`, `Skeleton`, `useToast`, `CountUp`, `RouteLine`, `useModalDialog`, `readString`/`writeString` (`lib/storage.ts`), `cn`, `getSupabase`/`requireSupabase`, `useAuth`, `useProfile`, `useMotionPrefs`.
- **Spec deltas decided while planning** (Task 2 updates the spec): `update_learning_path_plan` also takes `p_goal_type`; extra error codes `invalid_start_point`, `target_not_allowed_for_goal`; `p_target_date` params default `null`; wizard route renders outside `AppLayout`, with `LearningPathsProvider` mounted on the `/app` route wrapper.

## Execution waves (for parallel agents)

| Wave | Tasks (parallel within a wave) |
|---|---|
| 1 | Task 1 (shared learning logic) · Task 2 (database) |
| 2 | Task 3 (web data layer + shared form components + router wrapper) |
| 3 | Task 4 (onboarding wizard) · Task 5 (Home, LanguagePill, AppBar, KO enabled) · Task 6 (Settings section) |
| 4 | Task 7 (E2E + CI + final verification) |

## File map

```
packages/shared/src/learning/levels.ts            LEVELS, LEVEL_INFO, START_POINTS, GOAL_TYPES, goals, allowedTargets, defaultTarget…
packages/shared/src/learning/estimate.ts          estimatePath, addDaysIso, isoToUtcDays, types
packages/shared/src/learning/schemas.ts           weeklyMinutesSchema, createPathSchema, updatePlanSchema, onboardingDraftSchema, estimateRecordSchema, fromEstimateRecord
packages/shared/src/learning/estimate.fixtures.json  shared TS/SQL fixtures
packages/shared/src/learning/*.test.ts
supabase/migrations/20261013000200_learning_paths.sql
supabase/tests/learning_paths.test.sql
supabase/tests/learning_paths_estimate.test.sql   GENERATED from fixtures
scripts/sync-estimate-fixtures.mjs
apps/web/src/lib/dates.ts                          todayIso, addMonthsIso, weekdayIndex, formatDateVi
apps/web/src/features/learning-paths/
  service.ts, error-map.ts, LearningPathsProvider.tsx, useReferenceHours.ts
  components/{LevelChoiceList,ScheduleEditor,EstimateSummary,FeasibilityBadge}.tsx, schedule.ts
apps/web/src/routes/app/AppRoute.tsx               RequireAuth > ProfileProvider > LearningPathsProvider > Outlet
apps/web/src/routes/app/onboarding/*              wizard
apps/web/src/routes/app/home/{PathSummaryCard,SpreadWarning}.tsx
apps/web/src/routes/app/settings/{LearningPathsSection,PathPlanEditor}.tsx
apps/web/tests/unit/learning-fixtures.ts           pathRow(), TEST_PATH, REFERENCE
apps/web/tests/e2e/onboarding.spec.ts
```

---

## Wave 1

### Task 1: Shared learning logic (`packages/shared/src/learning/`)

**Files:**
- Create: `packages/shared/src/learning/levels.ts`, `estimate.ts`, `schemas.ts`, `estimate.fixtures.json`, `levels.test.ts`, `estimate.test.ts`, `schemas.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Fixtures** — `packages/shared/src/learning/estimate.fixtures.json` (exact content; Task 2 creates the identical file)

```json
{
  "today": "2026-10-13",
  "referenceHours": {
    "en": [
      { "levelCode": "pre_a1", "ordinal": 0, "cumulativeHours": 0 },
      { "levelCode": "a1", "ordinal": 1, "cumulativeHours": 90 },
      { "levelCode": "a2", "ordinal": 2, "cumulativeHours": 190 },
      { "levelCode": "b1", "ordinal": 3, "cumulativeHours": 375 },
      { "levelCode": "b2", "ordinal": 4, "cumulativeHours": 575 },
      { "levelCode": "c1", "ordinal": 5, "cumulativeHours": 775 },
      { "levelCode": "c2", "ordinal": 6, "cumulativeHours": 1100 }
    ],
    "ko": [
      { "levelCode": "hangul", "ordinal": 0, "cumulativeHours": 0 },
      { "levelCode": "topik1", "ordinal": 1, "cumulativeHours": 120 },
      { "levelCode": "topik2", "ordinal": 2, "cumulativeHours": 300 },
      { "levelCode": "topik3", "ordinal": 3, "cumulativeHours": 650 },
      { "levelCode": "topik4", "ordinal": 4, "cumulativeHours": 1000 },
      { "levelCode": "topik5", "ordinal": 5, "cumulativeHours": 1500 },
      { "levelCode": "topik6", "ordinal": 6, "cumulativeHours": 2200 }
    ]
  },
  "cases": [
    {
      "name": "en a2 to b1, 30 min every day, no deadline",
      "language": "en", "currentLevel": "a2", "targetLevel": "b1",
      "weeklyMinutes": [30, 30, 30, 30, 30, 30, 30], "targetDate": null,
      "expected": { "hoursNeeded": 185, "weeksMin": 43, "weeksMid": 53, "weeksMax": 69, "feasibility": "no_deadline", "suggestedMinutesPerDay": null, "suggestedDate": null }
    },
    {
      "name": "en pre_a1 to c2, 120 min on weekdays, no deadline",
      "language": "en", "currentLevel": "pre_a1", "targetLevel": "c2",
      "weeklyMinutes": [120, 120, 120, 120, 120, 0, 0], "targetDate": null,
      "expected": { "hoursNeeded": 1100, "weeksMin": 88, "weeksMid": 110, "weeksMax": 143, "feasibility": "no_deadline", "suggestedMinutesPerDay": null, "suggestedDate": null }
    },
    {
      "name": "en b1 to b2, 60 min every day, feasible deadline",
      "language": "en", "currentLevel": "b1", "targetLevel": "b2",
      "weeklyMinutes": [60, 60, 60, 60, 60, 60, 60], "targetDate": "2027-07-13",
      "expected": { "hoursNeeded": 200, "weeksMin": 24, "weeksMid": 29, "weeksMax": 38, "feasibility": "feasible", "suggestedMinutesPerDay": null, "suggestedDate": null }
    },
    {
      "name": "en b1 to b2, 60 min every day, tight deadline",
      "language": "en", "currentLevel": "b1", "targetLevel": "b2",
      "weeklyMinutes": [60, 60, 60, 60, 60, 60, 60], "targetDate": "2027-05-13",
      "expected": { "hoursNeeded": 200, "weeksMin": 24, "weeksMid": 29, "weeksMax": 38, "feasibility": "tight", "suggestedMinutesPerDay": null, "suggestedDate": null }
    },
    {
      "name": "en b1 to b2, 60 min every day, deadline too close",
      "language": "en", "currentLevel": "b1", "targetLevel": "b2",
      "weeklyMinutes": [60, 60, 60, 60, 60, 60, 60], "targetDate": "2027-01-13",
      "expected": { "hoursNeeded": 200, "weeksMin": 24, "weeksMid": 29, "weeksMax": 38, "feasibility": "needs_more_time", "suggestedMinutesPerDay": 132, "suggestedDate": "2027-05-04" }
    },
    {
      "name": "ko hangul to topik2, weekdays 15 and saturday 30",
      "language": "ko", "currentLevel": "hangul", "targetLevel": "topik2",
      "weeklyMinutes": [15, 15, 15, 15, 15, 30, 0], "targetDate": null,
      "expected": { "hoursNeeded": 300, "weeksMin": 138, "weeksMid": 172, "weeksMax": 224, "feasibility": "no_deadline", "suggestedMinutesPerDay": null, "suggestedDate": null }
    },
    {
      "name": "ko topik3 to topik4, four study days, one month left, suggestion capped",
      "language": "ko", "currentLevel": "topik3", "targetLevel": "topik4",
      "weeklyMinutes": [60, 60, 0, 60, 60, 0, 0], "targetDate": "2026-11-13",
      "expected": { "hoursNeeded": 350, "weeksMin": 71, "weeksMid": 88, "weeksMax": 115, "feasibility": "needs_more_time", "suggestedMinutesPerDay": 720, "suggestedDate": "2028-06-20" }
    },
    {
      "name": "en a1 to a2, deadline today",
      "language": "en", "currentLevel": "a1", "targetLevel": "a2",
      "weeklyMinutes": [30, 30, 30, 30, 30, 30, 30], "targetDate": "2026-10-13",
      "expected": { "hoursNeeded": 100, "weeksMin": 24, "weeksMid": 29, "weeksMax": 38, "feasibility": "needs_more_time", "suggestedMinutesPerDay": 720, "suggestedDate": "2027-05-04" }
    }
  ]
}
```

- [ ] **Step 2: Write failing tests**

`packages/shared/src/learning/estimate.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import fixtures from './estimate.fixtures.json';
import { addDaysIso, estimatePath, EstimateError, type ReferenceHours } from './estimate';

const reference = (language: 'en' | 'ko', reviewed = false): ReferenceHours[] =>
  fixtures.referenceHours[language].map((r) => ({ ...r, reviewed }));

describe('estimatePath (shared fixtures, mirrored by SQL)', () => {
  for (const c of fixtures.cases) {
    it(c.name, () => {
      const result = estimatePath(
        { currentLevel: c.currentLevel, targetLevel: c.targetLevel, weeklyMinutes: c.weeklyMinutes, targetDate: c.targetDate, today: fixtures.today },
        reference(c.language as 'en' | 'ko'),
      );
      expect({
        hoursNeeded: result.hoursNeeded,
        weeksMin: result.weeksMin,
        weeksMid: result.weeksMid,
        weeksMax: result.weeksMax,
        feasibility: result.feasibility,
        suggestedMinutesPerDay: result.suggestedMinutesPerDay,
        suggestedDate: result.suggestedDate,
      }).toEqual(c.expected);
    });
  }
});

describe('estimatePath details', () => {
  it('reports assumptions and the unreviewed reference table', () => {
    const r = estimatePath(
      { currentLevel: 'a2', targetLevel: 'b1', weeklyMinutes: [30, 30, 30, 30, 30, 30, 30], targetDate: null, today: '2026-10-13' },
      reference('en'),
    );
    expect(r.assumptions).toEqual({ weeklyMinutes: 210, hoursNeeded: 185, referenceReviewed: false, multiplierRange: [0.8, 1.3] });
    expect(estimatePath({ currentLevel: 'a2', targetLevel: 'b1', weeklyMinutes: [30, 30, 30, 30, 30, 30, 30], targetDate: null, today: '2026-10-13' }, reference('en', true)).assumptions.referenceReviewed).toBe(true);
  });

  it('rejects unknown levels and empty schedules', () => {
    const base = { currentLevel: 'a2', targetLevel: 'b1', weeklyMinutes: [30, 30, 30, 30, 30, 30, 30], targetDate: null, today: '2026-10-13' };
    expect(() => estimatePath({ ...base, targetLevel: 'z9' }, reference('en'))).toThrow(EstimateError);
    expect(() => estimatePath({ ...base, weeklyMinutes: [0, 0, 0, 0, 0, 0, 0] }, reference('en'))).toThrow('invalid_schedule');
  });

  it('adds days across month and leap boundaries', () => {
    expect(addDaysIso('2026-10-13', 203)).toBe('2027-05-04');
    expect(addDaysIso('2028-02-28', 1)).toBe('2028-02-29');
  });
});
```

`packages/shared/src/learning/levels.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { allowedTargets, defaultTarget, GOALS_BY_LANGUAGE, isGoalForLanguage, isLevelOf, LEVEL_INFO, LEVELS, suggestedCurrentLevel } from './levels';

describe('levels', () => {
  it('has seven ordered levels per language with Vietnamese info', () => {
    expect(LEVELS.en).toEqual(['pre_a1', 'a1', 'a2', 'b1', 'b2', 'c1', 'c2']);
    expect(LEVELS.ko).toEqual(['hangul', 'topik1', 'topik2', 'topik3', 'topik4', 'topik5', 'topik6']);
    for (const code of [...LEVELS.en, ...LEVELS.ko]) expect(LEVEL_INFO[code].description.length).toBeGreaterThan(10);
  });

  it('pairs goals with languages', () => {
    expect(GOALS_BY_LANGUAGE.en).toContain('cefr');
    expect(isGoalForLanguage('ko', 'topik_ii')).toBe(true);
    expect(isGoalForLanguage('en', 'topik_ii')).toBe(false);
    expect(isLevelOf('en', 'b1')).toBe(true);
    expect(isLevelOf('en', 'topik1')).toBe(false);
  });

  it('only allows targets above the current level and inside the TOPIK band', () => {
    expect(allowedTargets('en', 'cefr', 'b1')).toEqual(['b2', 'c1', 'c2']);
    expect(allowedTargets('ko', 'topik_i', 'hangul')).toEqual(['topik1', 'topik2']);
    expect(allowedTargets('ko', 'topik_ii', 'topik1')).toEqual(['topik3', 'topik4', 'topik5', 'topik6']);
    expect(allowedTargets('ko', 'topik_i', 'topik2')).toEqual([]);
  });

  it('suggests defaults', () => {
    expect(defaultTarget('en', 'daily_communication', 'a2')).toBe('b1');
    expect(defaultTarget('en', 'daily_communication', 'b2')).toBe('c1');
    expect(defaultTarget('ko', 'topik_i', 'topik2')).toBeNull();
    expect(suggestedCurrentLevel('en', 'new')).toBe('pre_a1');
    expect(suggestedCurrentLevel('ko', 'unsure')).toBe('topik1');
    expect(suggestedCurrentLevel('en', 'some')).toBeNull();
  });
});
```

`packages/shared/src/learning/schemas.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { fieldErrors } from '../schemas';
import { createPathSchema, fromEstimateRecord, onboardingDraftSchema, updatePlanSchema, weeklyMinutesSchema } from './schemas';

const valid = {
  language: 'en',
  startPoint: 'some',
  goalType: 'daily_communication',
  currentLevel: 'a2',
  targetLevel: 'b1',
  weeklyMinutes: [30, 30, 30, 30, 30, 30, 30],
  targetDate: null,
} as const;

describe('learning schemas', () => {
  it('accepts a valid path', () => {
    expect(createPathSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects mismatched goal, target not above current and empty schedule', () => {
    const goal = createPathSchema.safeParse({ ...valid, goalType: 'topik_i' });
    expect(goal.success).toBe(false);
    if (!goal.success) expect(fieldErrors(goal.error).goalType).toBe('Mục tiêu không phù hợp với ngôn ngữ đã chọn.');

    const target = updatePlanSchema.safeParse({ ...valid, targetLevel: 'a1' });
    expect(target.success).toBe(false);
    if (!target.success) expect(fieldErrors(target.error).targetLevel).toBe('Hãy chọn bậc mục tiêu phù hợp và cao hơn trình độ hiện tại.');

    const week = weeklyMinutesSchema.safeParse([0, 0, 0, 0, 0, 0, 0]);
    expect(week.success).toBe(false);
    expect(weeklyMinutesSchema.safeParse([721, 0, 0, 0, 0, 0, 0]).success).toBe(false);
  });

  it('validates the onboarding draft shape', () => {
    expect(onboardingDraftSchema.safeParse({ version: 1, step: 2, data: { language: 'ko' } }).success).toBe(true);
    expect(onboardingDraftSchema.safeParse({ version: 2, step: 2, data: {} }).success).toBe(false);
    expect(onboardingDraftSchema.safeParse({ version: 1, step: 9, data: {} }).success).toBe(false);
  });

  it('maps a stored estimate record to camelCase', () => {
    expect(
      fromEstimateRecord({
        hours_needed: 185,
        weeks_min: 43,
        weeks_mid: 53,
        weeks_max: 69,
        feasibility: 'no_deadline',
        suggested_minutes_per_day: null,
        suggested_date: null,
        assumptions: { weekly_minutes: 210, hours_needed: 185, reference_reviewed: false, multiplier_range: [0.8, 1.3] },
      }),
    ).toEqual({
      hoursNeeded: 185,
      weeksMin: 43,
      weeksMid: 53,
      weeksMax: 69,
      feasibility: 'no_deadline',
      suggestedMinutesPerDay: null,
      suggestedDate: null,
      assumptions: { weeklyMinutes: 210, hoursNeeded: 185, referenceReviewed: false, multiplierRange: [0.8, 1.3] },
    });
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @linguo/shared test`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement**

`packages/shared/src/learning/levels.ts`:
```ts
import type { LanguageCode } from '../constants';

export const LEVELS = {
  en: ['pre_a1', 'a1', 'a2', 'b1', 'b2', 'c1', 'c2'],
  ko: ['hangul', 'topik1', 'topik2', 'topik3', 'topik4', 'topik5', 'topik6'],
} as const;
export type EnLevel = (typeof LEVELS.en)[number];
export type KoLevel = (typeof LEVELS.ko)[number];
export type LevelCode = EnLevel | KoLevel;

export interface LevelInfo {
  label: string;
  description: string;
}

export const LEVEL_INFO: Record<LevelCode, LevelInfo> = {
  pre_a1: { label: 'Mới bắt đầu', description: 'Chưa biết hoặc chỉ biết vài từ đơn lẻ.' },
  a1: { label: 'A1', description: 'Hiểu và dùng câu rất đơn giản về bản thân, gia đình, mua sắm.' },
  a2: { label: 'A2', description: 'Giao tiếp câu đơn giản về chủ đề quen thuộc hằng ngày.' },
  b1: { label: 'B1', description: 'Xử lý hầu hết tình huống khi đi lại, kể về trải nghiệm và kế hoạch.' },
  b2: { label: 'B2', description: 'Trao đổi trôi chảy với người bản xứ, đọc hiểu bài viết phức tạp về chủ đề quen thuộc.' },
  c1: { label: 'C1', description: 'Dùng linh hoạt cho học tập và công việc, hiểu văn bản dài và hàm ý.' },
  c2: { label: 'C2', description: 'Hiểu gần như mọi thứ nghe và đọc, diễn đạt chính xác sắc thái.' },
  hangul: { label: 'Hangul', description: 'Chưa đọc được chữ Hàn hoặc mới làm quen bảng chữ cái.' },
  topik1: { label: 'TOPIK 1', description: 'Chào hỏi, giới thiệu bản thân, mua sắm, gọi món bằng câu ngắn.' },
  topik2: { label: 'TOPIK 2', description: 'Giao tiếp sinh hoạt hằng ngày, dùng dịch vụ công cộng như ngân hàng, bưu điện.' },
  topik3: { label: 'TOPIK 3', description: 'Sinh hoạt hằng ngày không gặp khó khăn, theo được chủ đề xã hội quen thuộc.' },
  topik4: { label: 'TOPIK 4', description: 'Dùng cho công việc thông thường, hiểu tin tức và văn bản phổ thông.' },
  topik5: { label: 'TOPIK 5', description: 'Làm việc trong môi trường chuyên môn, hiểu chủ đề kinh tế, xã hội.' },
  topik6: { label: 'TOPIK 6', description: 'Sử dụng gần như người bản xứ trong học thuật và chuyên môn.' },
};

export const START_POINTS = ['new', 'some', 'rusty', 'confident', 'unsure'] as const;
export type StartPoint = (typeof START_POINTS)[number];
export const START_POINT_LABELS: Record<StartPoint, string> = {
  new: 'Tôi mới hoàn toàn',
  some: 'Tôi đã học một ít',
  rusty: 'Tôi từng học nhưng quên nhiều',
  confident: 'Tôi biết khá rõ và muốn nâng cao',
  unsure: 'Tôi chưa chắc trình độ của mình',
};

export const GOAL_TYPES = [
  'foundation',
  'daily_communication',
  'work_it',
  'reading_docs',
  'cefr',
  'hangul_basics',
  'communication',
  'topik_i',
  'topik_ii',
  'skill_focus',
] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

export const GOALS_BY_LANGUAGE: Record<LanguageCode, readonly GoalType[]> = {
  en: ['foundation', 'daily_communication', 'work_it', 'reading_docs', 'cefr'],
  ko: ['hangul_basics', 'communication', 'topik_i', 'topik_ii', 'skill_focus'],
};

export const GOAL_LABELS: Record<GoalType, string> = {
  foundation: 'Nền tảng từ số 0',
  daily_communication: 'Giao tiếp đời sống',
  work_it: 'Tiếng Anh công việc / IT',
  reading_docs: 'Đọc hiểu tài liệu',
  cefr: 'Đạt một bậc CEFR',
  hangul_basics: 'Hangul và giao tiếp nền tảng',
  communication: 'Giao tiếp đời sống, du học, công việc',
  topik_i: 'TOPIK I (cấp 1–2)',
  topik_ii: 'TOPIK II (cấp 3–6)',
  skill_focus: 'Nâng cao nghe, đọc hoặc viết',
};

const GOAL_DEFAULT_TARGET: Record<GoalType, LevelCode> = {
  foundation: 'a2',
  daily_communication: 'b1',
  work_it: 'b2',
  reading_docs: 'b2',
  cefr: 'b2',
  hangul_basics: 'topik1',
  communication: 'topik3',
  topik_i: 'topik2',
  topik_ii: 'topik4',
  skill_focus: 'topik4',
};

const TOPIK_I: readonly string[] = ['topik1', 'topik2'];
const TOPIK_II: readonly string[] = ['topik3', 'topik4', 'topik5', 'topik6'];

export const PATH_STATUSES = ['active', 'paused', 'completed', 'archived'] as const;
export type PathStatus = (typeof PATH_STATUSES)[number];

export function isGoalForLanguage(language: LanguageCode, goal: string): goal is GoalType {
  return (GOALS_BY_LANGUAGE[language] as readonly string[]).includes(goal);
}

export function isLevelOf(language: LanguageCode, level: string): level is LevelCode {
  return (LEVELS[language] as readonly string[]).includes(level);
}

export function levelOrdinal(language: LanguageCode, level: string): number {
  return (LEVELS[language] as readonly string[]).indexOf(level);
}

/** Levels the user may aim for: strictly above `current`, restricted to the TOPIK band for TOPIK goals. */
export function allowedTargets(language: LanguageCode, goal: GoalType, current: string): LevelCode[] {
  const from = levelOrdinal(language, current);
  let levels = (LEVELS[language] as readonly LevelCode[]).filter((_, i) => i > from);
  if (goal === 'topik_i') levels = levels.filter((l) => TOPIK_I.includes(l));
  if (goal === 'topik_ii') levels = levels.filter((l) => TOPIK_II.includes(l));
  return levels;
}

export function defaultTarget(language: LanguageCode, goal: GoalType, current: string): LevelCode | null {
  const options = allowedTargets(language, goal, current);
  const preferred = GOAL_DEFAULT_TARGET[goal];
  return options.includes(preferred) ? preferred : (options[0] ?? null);
}

/** `new` → lowest level (step 3 is skipped); `unsure` → a gentle default; otherwise the user picks. */
export function suggestedCurrentLevel(language: LanguageCode, startPoint: StartPoint): LevelCode | null {
  if (startPoint === 'new') return LEVELS[language][0];
  if (startPoint === 'unsure') return language === 'en' ? 'a1' : 'topik1';
  return null;
}
```

`packages/shared/src/learning/estimate.ts`:
```ts
export const FEASIBILITIES = ['no_deadline', 'feasible', 'tight', 'needs_more_time'] as const;
export type Feasibility = (typeof FEASIBILITIES)[number];

export interface ReferenceHours {
  levelCode: string;
  ordinal: number;
  cumulativeHours: number;
  reviewed: boolean;
}

export interface EstimateInput {
  currentLevel: string;
  targetLevel: string;
  weeklyMinutes: readonly number[];
  /** ISO date (YYYY-MM-DD) or null when there is no deadline. */
  targetDate: string | null;
  /** The user's local date, ISO. */
  today: string;
}

export interface EstimateResult {
  hoursNeeded: number;
  weeksMin: number;
  weeksMid: number;
  weeksMax: number;
  feasibility: Feasibility;
  suggestedMinutesPerDay: number | null;
  suggestedDate: string | null;
  assumptions: {
    weeklyMinutes: number;
    hoursNeeded: number;
    referenceReviewed: boolean;
    multiplierRange: readonly [number, number];
  };
}

export const ESTIMATE_MULTIPLIERS = [0.8, 1.3] as const;
export const MAX_MINUTES_PER_DAY = 720;
const DAY_MS = 86_400_000;

export class EstimateError extends Error {}

export function isoToUtcDays(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / DAY_MS;
}

export function addDaysIso(iso: string, days: number): string {
  return new Date((isoToUtcDays(iso) + days) * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Reference-hours estimate. Integer arithmetic only (×4/5 and ×13/10 instead of ×0.8 / ×1.3) so the SQL
 * mirror `public.estimate_learning_path` produces identical numbers. Keep both in sync with
 * estimate.fixtures.json.
 */
export function estimatePath(input: EstimateInput, reference: readonly ReferenceHours[]): EstimateResult {
  const current = reference.find((r) => r.levelCode === input.currentLevel);
  const target = reference.find((r) => r.levelCode === input.targetLevel);
  if (!current || !target) throw new EstimateError('invalid_level');
  const weekly = input.weeklyMinutes.reduce((sum, m) => sum + m, 0);
  if (weekly <= 0) throw new EstimateError('invalid_schedule');

  const hoursNeeded = Math.max(0, target.cumulativeHours - current.cumulativeHours);
  const weeksMid = Math.ceil((hoursNeeded * 60) / weekly);
  const weeksMin = Math.ceil((weeksMid * 4) / 5);
  const weeksMax = Math.ceil((weeksMid * 13) / 10);

  let feasibility: Feasibility = 'no_deadline';
  let suggestedMinutesPerDay: number | null = null;
  let suggestedDate: string | null = null;
  if (input.targetDate) {
    const weeksAvailable = Math.floor((isoToUtcDays(input.targetDate) - isoToUtcDays(input.today)) / 7);
    if (weeksAvailable >= weeksMax) feasibility = 'feasible';
    else if (weeksAvailable >= weeksMid) feasibility = 'tight';
    else {
      feasibility = 'needs_more_time';
      const activeDays = Math.max(1, input.weeklyMinutes.filter((m) => m > 0).length);
      suggestedMinutesPerDay = Math.min(
        MAX_MINUTES_PER_DAY,
        Math.ceil((hoursNeeded * 60) / (Math.max(weeksAvailable, 1) * activeDays)),
      );
      suggestedDate = addDaysIso(input.today, weeksMid * 7);
    }
  }

  return {
    hoursNeeded,
    weeksMin,
    weeksMid,
    weeksMax,
    feasibility,
    suggestedMinutesPerDay,
    suggestedDate,
    assumptions: {
      weeklyMinutes: weekly,
      hoursNeeded,
      referenceReviewed: current.reviewed && target.reviewed,
      multiplierRange: ESTIMATE_MULTIPLIERS,
    },
  };
}
```

`packages/shared/src/learning/schemas.ts`:
```ts
import { z } from 'zod';
import { LANGUAGE_CODES } from '../constants';
import { FEASIBILITIES, type EstimateResult } from './estimate';
import { allowedTargets, GOAL_TYPES, isGoalForLanguage, isLevelOf, START_POINTS } from './levels';

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày không hợp lệ.' });

export const weeklyMinutesSchema = z
  .array(z.number().int().min(0).max(720, { message: 'Tối đa 720 phút mỗi ngày.' }))
  .length(7)
  .refine((week) => week.some((m) => m > 0), { message: 'Hãy chọn ít nhất một ngày học.' });

const planShape = {
  language: z.enum(LANGUAGE_CODES),
  goalType: z.enum(GOAL_TYPES),
  currentLevel: z.string(),
  targetLevel: z.string(),
  weeklyMinutes: weeklyMinutesSchema,
  targetDate: isoDateSchema.nullable(),
};

type PlanFields = { language: (typeof LANGUAGE_CODES)[number]; goalType: (typeof GOAL_TYPES)[number]; currentLevel: string; targetLevel: string };

function refinePlan(value: PlanFields, ctx: z.RefinementCtx) {
  if (!isGoalForLanguage(value.language, value.goalType)) {
    ctx.addIssue({ code: 'custom', path: ['goalType'], message: 'Mục tiêu không phù hợp với ngôn ngữ đã chọn.' });
    return;
  }
  if (!isLevelOf(value.language, value.currentLevel)) {
    ctx.addIssue({ code: 'custom', path: ['currentLevel'], message: 'Trình độ không hợp lệ.' });
    return;
  }
  if (!(allowedTargets(value.language, value.goalType, value.currentLevel) as string[]).includes(value.targetLevel)) {
    ctx.addIssue({ code: 'custom', path: ['targetLevel'], message: 'Hãy chọn bậc mục tiêu phù hợp và cao hơn trình độ hiện tại.' });
  }
}

export const createPathSchema = z.object({ ...planShape, startPoint: z.enum(START_POINTS) }).superRefine(refinePlan);
export const updatePlanSchema = z.object(planShape).superRefine(refinePlan);
export type CreatePathInput = z.infer<typeof createPathSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

export const SCHEDULE_PRESETS = ['15', '30', '60', '120', 'custom'] as const;
export type SchedulePreset = (typeof SCHEDULE_PRESETS)[number];
export const DEADLINE_MODES = ['none', 'date', 'weeks', 'months'] as const;
export type DeadlineMode = (typeof DEADLINE_MODES)[number];

export const onboardingDraftSchema = z.object({
  version: z.literal(1),
  step: z.number().int().min(1).max(6),
  data: z.object({
    language: z.enum(LANGUAGE_CODES).optional(),
    startPoint: z.enum(START_POINTS).optional(),
    currentLevel: z.string().max(16).optional(),
    goalType: z.enum(GOAL_TYPES).optional(),
    targetLevel: z.string().max(16).optional(),
    schedulePreset: z.enum(SCHEDULE_PRESETS).optional(),
    weeklyMinutes: z.array(z.number().int().min(0).max(720)).length(7).optional(),
    deadlineMode: z.enum(DEADLINE_MODES).optional(),
    targetDate: isoDateSchema.nullable().optional(),
    deadlineAmount: z.number().int().min(1).max(520).optional(),
  }),
});
export type OnboardingDraft = z.infer<typeof onboardingDraftSchema>;
export type OnboardingDraftData = OnboardingDraft['data'];

/** Shape of `learning_paths.estimate` (written by SQL, snake_case). */
export const estimateRecordSchema = z.object({
  hours_needed: z.number(),
  weeks_min: z.number(),
  weeks_mid: z.number(),
  weeks_max: z.number(),
  feasibility: z.enum(FEASIBILITIES),
  suggested_minutes_per_day: z.number().nullable(),
  suggested_date: z.string().nullable(),
  assumptions: z.object({
    weekly_minutes: z.number(),
    hours_needed: z.number(),
    reference_reviewed: z.boolean(),
    multiplier_range: z.tuple([z.number(), z.number()]),
  }),
});

export function fromEstimateRecord(raw: unknown): EstimateResult {
  const r = estimateRecordSchema.parse(raw);
  return {
    hoursNeeded: r.hours_needed,
    weeksMin: r.weeks_min,
    weeksMid: r.weeks_mid,
    weeksMax: r.weeks_max,
    feasibility: r.feasibility,
    suggestedMinutesPerDay: r.suggested_minutes_per_day,
    suggestedDate: r.suggested_date,
    assumptions: {
      weeklyMinutes: r.assumptions.weekly_minutes,
      hoursNeeded: r.assumptions.hours_needed,
      referenceReviewed: r.assumptions.reference_reviewed,
      multiplierRange: r.assumptions.multiplier_range,
    },
  };
}
```

Append to `packages/shared/src/index.ts`:
```ts
export * from './learning/levels';
export * from './learning/estimate';
export * from './learning/schemas';
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @linguo/shared test && pnpm --filter @linguo/shared typecheck && pnpm typecheck`
Expected: all PASS (8 fixture cases + details).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src
git commit -m "feat(shared): add learning levels, goals, reference-hours estimate and path schemas"
```

---

### Task 2: Database — reference hours, learning paths, RPCs, pgTAP, fixture sync

**Files:**
- Create: `supabase/migrations/20261013000200_learning_paths.sql`, `supabase/tests/learning_paths.test.sql`, `scripts/sync-estimate-fixtures.mjs`, generated `supabase/tests/learning_paths_estimate.test.sql`, `packages/shared/src/learning/estimate.fixtures.json` (identical to Task 1 Step 1 — copy it verbatim)
- Modify: `package.json` (script), `.github/workflows/ci.yml` (fixture check), `packages/shared/src/database.types.ts` (regenerated), `docs/SETUP.md` (reference-hours note), spec file (deltas)

- [ ] **Step 1: Fixtures file** — create `packages/shared/src/learning/estimate.fixtures.json` with exactly the JSON from Task 1 Step 1.

- [ ] **Step 2: Fixture sync script** — `scripts/sync-estimate-fixtures.mjs`

```js
#!/usr/bin/env node
// Generates supabase/tests/learning_paths_estimate.test.sql from the shared TS fixtures so that
// public.estimate_learning_path (SQL) and estimatePath (TS) are verified against the same cases.
// Usage: node scripts/sync-estimate-fixtures.mjs [--check]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = join(root, 'packages', 'shared', 'src', 'learning', 'estimate.fixtures.json');
const OUT = join(root, 'supabase', 'tests', 'learning_paths_estimate.test.sql');

const fixtures = JSON.parse(readFileSync(FIXTURES, 'utf8'));
const lit = (s) => `'${String(s).replaceAll("'", "''")}'`;
const lines = [];
let count = 0;
const test = (sql) => {
  lines.push(sql);
  count++;
};

for (const [language, levels] of Object.entries(fixtures.referenceHours)) {
  test(
    `select is((select count(*)::int from public.level_reference_hours where language_code = ${lit(language)}), ${levels.length}, ${lit(`reference hours: ${language} has ${levels.length} levels`)});`,
  );
  for (const level of levels) {
    test(
      `select is((select array[ordinal::int, cumulative_hours] from public.level_reference_hours where language_code = ${lit(language)} and level_code = ${lit(level.levelCode)}), array[${level.ordinal}, ${level.cumulativeHours}], ${lit(`reference hours: ${language}/${level.levelCode}`)});`,
    );
  }
}

for (const c of fixtures.cases) {
  const expected = {
    hours_needed: c.expected.hoursNeeded,
    weeks_min: c.expected.weeksMin,
    weeks_mid: c.expected.weeksMid,
    weeks_max: c.expected.weeksMax,
    feasibility: c.expected.feasibility,
    suggested_minutes_per_day: c.expected.suggestedMinutesPerDay,
    suggested_date: c.expected.suggestedDate,
  };
  const targetDate = c.targetDate === null ? 'null' : `date ${lit(c.targetDate)}`;
  test(
    `select is(public.estimate_learning_path(${lit(c.language)}, ${lit(c.currentLevel)}, ${lit(c.targetLevel)}, array[${c.weeklyMinutes.join(', ')}]::smallint[], ${targetDate}, date ${lit(fixtures.today)}) - 'assumptions', ${lit(JSON.stringify(expected))}::jsonb, ${lit(`estimate: ${c.name}`)});`,
  );
}

const sql = [
  '-- GENERATED by scripts/sync-estimate-fixtures.mjs from packages/shared/src/learning/estimate.fixtures.json.',
  '-- Do not edit by hand: run `pnpm fixtures:sync`.',
  'begin;',
  'create extension if not exists pgtap with schema extensions;',
  `select plan(${count});`,
  ...lines,
  'select * from finish();',
  'rollback;',
  '',
].join('\n');

if (process.argv.includes('--check')) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8').replaceAll('\r\n', '\n') : '';
  if (current !== sql) {
    console.error('::error::supabase/tests/learning_paths_estimate.test.sql is out of date. Run `pnpm fixtures:sync` and commit.');
    process.exit(1);
  }
  console.log('Estimate fixtures in sync.');
} else {
  writeFileSync(OUT, sql);
  console.log(`Wrote ${OUT} (${count} assertions).`);
}
```

Add to root `package.json` scripts: `"fixtures:sync": "node scripts/sync-estimate-fixtures.mjs"`.

Run: `pnpm fixtures:sync`
Expected: `Wrote …learning_paths_estimate.test.sql (24 assertions).` (2 counts + 14 levels + 8 cases).

- [ ] **Step 3: Write the behaviour test** — `supabase/tests/learning_paths.test.sql`

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@test.dev', '{"display_name": "A"}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@test.dev', '{}');

-- ===== User A =====
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);

select lives_ok($$select public.create_learning_path('en', 'some', 'daily_communication', 'a2', 'b1', array[30,30,30,30,30,30,30]::smallint[])$$, 'A creates an EN path (no deadline)');
select is((select count(*)::int from public.learning_paths), 1, 'A sees one path');
select is((select estimate->>'feasibility' from public.learning_paths where language_code = 'en'), 'no_deadline', 'estimate stored');
select is((select (estimate->>'hours_needed')::int from public.learning_paths where language_code = 'en'), 185, 'hours needed from the reference table');
select is((select count(*)::int from public.skill_estimates), 6, 'six self-reported skill estimates');
select is((select current_learning_path_id from public.profiles), (select id from public.learning_paths where language_code = 'en'), 'new path becomes current');

select throws_ok($$select public.create_learning_path('en', 'some', 'cefr', 'a2', 'b2', array[30,30,30,30,30,30,30]::smallint[])$$, 'P0001', 'path_exists_for_language', 'one open path per language');
select throws_ok($$select public.create_learning_path('ko', 'new', 'cefr', 'hangul', 'topik1', array[30,30,30,30,30,30,30]::smallint[])$$, 'P0001', 'invalid_goal_for_language', 'goal must match language');
select throws_ok($$select public.create_learning_path('ko', 'some', 'communication', 'topik3', 'topik2', array[30,30,30,30,30,30,30]::smallint[])$$, 'P0001', 'target_not_above_current', 'target above current');
select throws_ok($$select public.create_learning_path('ko', 'new', 'hangul_basics', 'hangul', 'topik1', array[0,0,0,0,0,0,0]::smallint[])$$, 'P0001', 'invalid_schedule', 'schedule needs study time');
select throws_ok($$select public.create_learning_path('ko', 'new', 'hangul_basics', 'hangul', 'topik1', array[30,30,30,30,30,30,30]::smallint[], current_date - 2)$$, 'P0001', 'target_date_in_past', 'no past deadlines');
select throws_ok($$select public.create_learning_path('ko', 'some', 'topik_i', 'topik1', 'topik3', array[30,30,30,30,30,30,30]::smallint[])$$, 'P0001', 'target_not_allowed_for_goal', 'TOPIK I band');
select throws_ok($$select public.create_learning_path('en', 'some', 'cefr', 'a2', 'z9', array[30,30,30,30,30,30,30]::smallint[])$$, 'P0001', 'invalid_level', 'unknown level');

select lives_ok($$select public.create_learning_path('ko', 'new', 'hangul_basics', 'hangul', 'topik1', array[15,15,15,15,15,15,15]::smallint[])$$, 'A creates a KO path');
select is((select current_learning_path_id from public.profiles), (select id from public.learning_paths where language_code = 'ko'), 'KO becomes current');
select lives_ok(format('select public.set_current_learning_path(%L)', (select id from public.learning_paths where language_code = 'en')), 'A switches back to EN');
select is((select current_learning_path_id from public.profiles), (select id from public.learning_paths where language_code = 'en'), 'EN is current again');

select throws_ok($$insert into public.learning_paths (user_id, language_code, start_point, goal_type, current_level, target_level, weekly_minutes, estimate)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'en', 'new', 'cefr', 'a1', 'a2', array[30,30,30,30,30,30,30]::smallint[], '{}')$$, '42501', null, 'no direct insert');
select throws_ok($$update public.learning_paths set status = 'archived'$$, '42501', null, 'no direct update');
select throws_ok($$update public.profiles set current_learning_path_id = null$$, '42501', null, 'current path only via RPC');

select lives_ok(format('select public.update_learning_path_plan(%L, %L, %L, %L::smallint[])', (select id from public.learning_paths where language_code = 'en'), 'daily_communication', 'b2', '{60,60,60,60,60,60,60}'), 'A updates the EN plan');
select is((select (estimate->>'hours_needed')::int from public.learning_paths where language_code = 'en'), 385, 'estimate recomputed');

select lives_ok(format('select public.set_learning_path_status(%L, %L)', (select id from public.learning_paths where language_code = 'ko'), 'paused'), 'A pauses KO');
select throws_ok(format('select public.set_learning_path_status(%L, %L)', (select id from public.learning_paths where language_code = 'ko'), 'completed'), 'P0001', 'invalid_status_transition', 'paused cannot complete');

select set_config('test.a_ko', (select id::text from public.learning_paths where language_code = 'ko'), true);
select lives_ok(format('select public.set_learning_path_status(%L, %L)', (select id from public.learning_paths where language_code = 'en'), 'archived'), 'A archives the current EN path');
select is((select current_learning_path_id from public.profiles), current_setting('test.a_ko')::uuid, 'current moves to the remaining path');
select lives_ok($$select public.create_learning_path('en', 'rusty', 'cefr', 'b1', 'b2', array[30,30,30,30,30,30,30]::smallint[], current_date + 100)$$, 'archived language can be started again');

-- ===== User B =====
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "role": "authenticated"}', true);
select is((select count(*)::int from public.learning_paths), 0, 'B sees none of A''s paths');
select is((select count(*)::int from public.skill_estimates), 0, 'B sees none of A''s skill estimates');
select throws_ok(format('select public.set_current_learning_path(%L)', current_setting('test.a_ko')), 'P0001', 'path_not_found', 'B cannot point at A''s path');
select throws_ok(format('select public.update_learning_path_plan(%L, %L, %L, %L::smallint[])', current_setting('test.a_ko'), 'hangul_basics', 'topik2', '{30,30,30,30,30,30,30}'), 'P0001', 'path_not_found', 'B cannot edit A''s path');

-- ===== anon =====
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select is((select count(*)::int from public.level_reference_hours), 14, 'anon can read the reference table');
select throws_ok($$select public.create_learning_path('en', 'new', 'foundation', 'pre_a1', 'a1', array[30,30,30,30,30,30,30]::smallint[])$$, '42501', null, 'anon cannot create paths');

select * from finish();
rollback;
```

- [ ] **Step 4: Run to verify failure**

Run: `pnpm exec supabase status || pnpm db:start` then `pnpm db:test`
Expected: FAIL — functions/tables do not exist.

- [ ] **Step 5: Migration** — `supabase/migrations/20261013000200_learning_paths.sql`

```sql
-- Linguo spec 1: reference hours, learning paths, self-reported skill estimates and write RPCs.
-- Clients read through RLS and write only through the SECURITY DEFINER functions below.

-- ---------------------------------------------------------------------------
-- Reference hours (seeded, unreviewed)
-- ---------------------------------------------------------------------------
create table public.level_reference_hours (
  language_code text not null check (language_code in ('en', 'ko')),
  level_code text not null,
  ordinal smallint not null check (ordinal >= 0),
  cumulative_hours integer not null check (cumulative_hours >= 0),
  source text not null,
  reviewed boolean not null default false,
  primary key (language_code, level_code),
  unique (language_code, ordinal)
);

comment on table public.level_reference_hours is 'Cumulative study hours per level used for time estimates. Seed values are unreviewed references.';

insert into public.level_reference_hours (language_code, level_code, ordinal, cumulative_hours, source) values
  ('en', 'pre_a1', 0, 0, 'Cambridge English guided learning hours (midpoints) — chưa kiểm duyệt'),
  ('en', 'a1', 1, 90, 'Cambridge English guided learning hours (midpoints) — chưa kiểm duyệt'),
  ('en', 'a2', 2, 190, 'Cambridge English guided learning hours (midpoints) — chưa kiểm duyệt'),
  ('en', 'b1', 3, 375, 'Cambridge English guided learning hours (midpoints) — chưa kiểm duyệt'),
  ('en', 'b2', 4, 575, 'Cambridge English guided learning hours (midpoints) — chưa kiểm duyệt'),
  ('en', 'c1', 5, 775, 'Cambridge English guided learning hours (midpoints) — chưa kiểm duyệt'),
  ('en', 'c2', 6, 1100, 'Cambridge English guided learning hours (midpoints) — chưa kiểm duyệt'),
  ('ko', 'hangul', 0, 0, 'Ước lượng tham khảo theo FSI (ngôn ngữ nhóm IV) — chưa kiểm duyệt'),
  ('ko', 'topik1', 1, 120, 'Ước lượng tham khảo theo FSI (ngôn ngữ nhóm IV) — chưa kiểm duyệt'),
  ('ko', 'topik2', 2, 300, 'Ước lượng tham khảo theo FSI (ngôn ngữ nhóm IV) — chưa kiểm duyệt'),
  ('ko', 'topik3', 3, 650, 'Ước lượng tham khảo theo FSI (ngôn ngữ nhóm IV) — chưa kiểm duyệt'),
  ('ko', 'topik4', 4, 1000, 'Ước lượng tham khảo theo FSI (ngôn ngữ nhóm IV) — chưa kiểm duyệt'),
  ('ko', 'topik5', 5, 1500, 'Ước lượng tham khảo theo FSI (ngôn ngữ nhóm IV) — chưa kiểm duyệt'),
  ('ko', 'topik6', 6, 2200, 'Ước lượng tham khảo theo FSI (ngôn ngữ nhóm IV) — chưa kiểm duyệt');

-- ---------------------------------------------------------------------------
-- Learning paths
-- ---------------------------------------------------------------------------
create table public.learning_paths (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  language_code text not null check (language_code in ('en', 'ko')),
  start_point text not null check (start_point in ('new', 'some', 'rusty', 'confident', 'unsure')),
  goal_type text not null,
  current_level text not null,
  target_level text not null,
  weekly_minutes smallint[] not null,
  target_date date,
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'archived')),
  estimate jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_paths_goal_matches_language check (
    (language_code = 'en' and goal_type in ('foundation', 'daily_communication', 'work_it', 'reading_docs', 'cefr'))
    or (language_code = 'ko' and goal_type in ('hangul_basics', 'communication', 'topik_i', 'topik_ii', 'skill_focus'))
  ),
  constraint learning_paths_weekly_minutes_shape check (coalesce(array_ndims(weekly_minutes), 0) = 1 and array_length(weekly_minutes, 1) = 7),
  constraint learning_paths_current_level_fk foreign key (language_code, current_level) references public.level_reference_hours (language_code, level_code),
  constraint learning_paths_target_level_fk foreign key (language_code, target_level) references public.level_reference_hours (language_code, level_code)
);

create unique index learning_paths_one_open_per_language on public.learning_paths (user_id, language_code) where status <> 'archived';
create index learning_paths_user_id_idx on public.learning_paths (user_id);

create trigger learning_paths_set_updated_at
  before update on public.learning_paths
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Skill estimates (self-reported now; diagnostics in spec 4)
-- ---------------------------------------------------------------------------
create table public.skill_estimates (
  id uuid primary key default gen_random_uuid(),
  learning_path_id uuid not null references public.learning_paths (id) on delete cascade,
  skill text not null check (skill in ('vocabulary', 'grammar', 'reading', 'listening', 'writing', 'speaking')),
  level_code text not null,
  confidence text not null check (confidence in ('self_reported', 'low', 'medium', 'high')),
  sample_size integer not null default 0 check (sample_size >= 0),
  source text not null check (source in ('self_report', 'diagnostic', 'assessment')),
  assessed_at timestamptz not null default now(),
  unique (learning_path_id, skill, source)
);

alter table public.profiles
  add column current_learning_path_id uuid references public.learning_paths (id) on delete set null;

-- ---------------------------------------------------------------------------
-- RLS and privileges
-- ---------------------------------------------------------------------------
alter table public.level_reference_hours enable row level security;
alter table public.learning_paths enable row level security;
alter table public.skill_estimates enable row level security;

create policy "reference hours: readable by everyone" on public.level_reference_hours
  for select to anon, authenticated using (true);
create policy "learning paths: read own" on public.learning_paths
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "skill estimates: read own" on public.skill_estimates
  for select to authenticated using (
    exists (select 1 from public.learning_paths p where p.id = learning_path_id and p.user_id = (select auth.uid()))
  );

revoke all on public.level_reference_hours, public.learning_paths, public.skill_estimates from anon, authenticated;
grant select on public.level_reference_hours to anon, authenticated;
grant select on public.learning_paths, public.skill_estimates to authenticated;

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------------
create or replace function public.learning_user_today(p_user uuid)
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone coalesce((select p.timezone from public.profiles p where p.id = p_user), 'Asia/Ho_Chi_Minh'))::date;
$$;

create or replace function public.learning_path_validate(
  p_language text, p_goal_type text, p_current_level text, p_target_level text,
  p_weekly_minutes smallint[], p_target_date date, p_today date
)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_cur smallint;
  v_tgt smallint;
begin
  if p_language is null or p_language not in ('en', 'ko') then
    raise exception using errcode = 'P0001', message = 'invalid_language';
  end if;
  if p_goal_type is null or not (
    (p_language = 'en' and p_goal_type in ('foundation', 'daily_communication', 'work_it', 'reading_docs', 'cefr'))
    or (p_language = 'ko' and p_goal_type in ('hangul_basics', 'communication', 'topik_i', 'topik_ii', 'skill_focus'))
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_goal_for_language';
  end if;
  select ordinal into v_cur from public.level_reference_hours where language_code = p_language and level_code = p_current_level;
  select ordinal into v_tgt from public.level_reference_hours where language_code = p_language and level_code = p_target_level;
  if v_cur is null or v_tgt is null then
    raise exception using errcode = 'P0001', message = 'invalid_level';
  end if;
  if v_tgt <= v_cur then
    raise exception using errcode = 'P0001', message = 'target_not_above_current';
  end if;
  if (p_goal_type = 'topik_i' and p_target_level not in ('topik1', 'topik2'))
     or (p_goal_type = 'topik_ii' and p_target_level not in ('topik3', 'topik4', 'topik5', 'topik6')) then
    raise exception using errcode = 'P0001', message = 'target_not_allowed_for_goal';
  end if;
  if p_weekly_minutes is null
     or coalesce(array_ndims(p_weekly_minutes), 0) <> 1
     or coalesce(array_length(p_weekly_minutes, 1), 0) <> 7
     or exists (select 1 from unnest(p_weekly_minutes) as m where m is null or m < 0 or m > 720)
     or (select sum(m) from unnest(p_weekly_minutes) as m) <= 0 then
    raise exception using errcode = 'P0001', message = 'invalid_schedule';
  end if;
  if p_target_date is not null and p_target_date < p_today then
    raise exception using errcode = 'P0001', message = 'target_date_in_past';
  end if;
  if p_target_date is not null and p_target_date > p_today + 3650 then
    raise exception using errcode = 'P0001', message = 'target_date_too_far';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Estimate (mirror of packages/shared/src/learning/estimate.ts; checked by generated pgTAP fixtures)
-- ---------------------------------------------------------------------------
create or replace function public.estimate_learning_path(
  p_language text, p_current_level text, p_target_level text,
  p_weekly_minutes smallint[], p_target_date date, p_today date
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_cur integer;
  v_tgt integer;
  v_reviewed boolean;
  v_hours integer;
  v_weekly integer;
  v_active integer;
  v_mid integer;
  v_min integer;
  v_max integer;
  v_avail integer;
  v_feasibility text := 'no_deadline';
  v_suggested_minutes integer;
  v_suggested_date date;
begin
  select cumulative_hours into v_cur from public.level_reference_hours where language_code = p_language and level_code = p_current_level;
  select cumulative_hours into v_tgt from public.level_reference_hours where language_code = p_language and level_code = p_target_level;
  if v_cur is null or v_tgt is null then
    raise exception using errcode = 'P0001', message = 'invalid_level';
  end if;
  select bool_and(reviewed) into v_reviewed
    from public.level_reference_hours
    where language_code = p_language and level_code in (p_current_level, p_target_level);

  select coalesce(sum(m), 0), count(*) filter (where m > 0) into v_weekly, v_active from unnest(p_weekly_minutes) as m;
  if v_weekly <= 0 then
    raise exception using errcode = 'P0001', message = 'invalid_schedule';
  end if;

  v_hours := greatest(0, v_tgt - v_cur);
  v_mid := ceil((v_hours * 60)::numeric / v_weekly);
  v_min := ceil((v_mid * 4)::numeric / 5);
  v_max := ceil((v_mid * 13)::numeric / 10);

  if p_target_date is not null then
    v_avail := floor((p_target_date - p_today)::numeric / 7);
    if v_avail >= v_max then
      v_feasibility := 'feasible';
    elsif v_avail >= v_mid then
      v_feasibility := 'tight';
    else
      v_feasibility := 'needs_more_time';
      v_suggested_minutes := least(720, ceil((v_hours * 60)::numeric / (greatest(v_avail, 1) * greatest(v_active, 1))));
      v_suggested_date := p_today + v_mid * 7;
    end if;
  end if;

  return jsonb_build_object(
    'hours_needed', v_hours,
    'weeks_min', v_min,
    'weeks_mid', v_mid,
    'weeks_max', v_max,
    'feasibility', v_feasibility,
    'suggested_minutes_per_day', v_suggested_minutes,
    'suggested_date', v_suggested_date,
    'assumptions', jsonb_build_object(
      'weekly_minutes', v_weekly,
      'hours_needed', v_hours,
      'reference_reviewed', coalesce(v_reviewed, false),
      'multiplier_range', jsonb_build_array(0.8, 1.3)
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
create or replace function public.create_learning_path(
  p_language text, p_start_point text, p_goal_type text, p_current_level text, p_target_level text,
  p_weekly_minutes smallint[], p_target_date date default null
)
returns public.learning_paths
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_today date;
  v_path public.learning_paths;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_start_point is null or p_start_point not in ('new', 'some', 'rusty', 'confident', 'unsure') then
    raise exception using errcode = 'P0001', message = 'invalid_start_point';
  end if;
  v_today := public.learning_user_today(v_uid);
  perform public.learning_path_validate(p_language, p_goal_type, p_current_level, p_target_level, p_weekly_minutes, p_target_date, v_today);

  begin
    insert into public.learning_paths (
      user_id, language_code, start_point, goal_type, current_level, target_level, weekly_minutes, target_date, estimate
    ) values (
      v_uid, p_language, p_start_point, p_goal_type, p_current_level, p_target_level, p_weekly_minutes, p_target_date,
      public.estimate_learning_path(p_language, p_current_level, p_target_level, p_weekly_minutes, p_target_date, v_today)
    )
    returning * into v_path;
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'path_exists_for_language';
  end;

  insert into public.skill_estimates (learning_path_id, skill, level_code, confidence, sample_size, source)
  select v_path.id, s, p_current_level, 'self_reported', 0, 'self_report'
  from unnest(array['vocabulary', 'grammar', 'reading', 'listening', 'writing', 'speaking']) as s;

  update public.profiles set current_learning_path_id = v_path.id where id = v_uid;
  return v_path;
end;
$$;

create or replace function public.set_current_learning_path(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if not exists (select 1 from public.learning_paths where id = p_id and user_id = v_uid and status <> 'archived') then
    raise exception using errcode = 'P0001', message = 'path_not_found';
  end if;
  update public.profiles set current_learning_path_id = p_id where id = v_uid;
end;
$$;

create or replace function public.update_learning_path_plan(
  p_id uuid, p_goal_type text, p_target_level text, p_weekly_minutes smallint[], p_target_date date default null
)
returns public.learning_paths
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_today date;
  v_path public.learning_paths;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  select * into v_path from public.learning_paths where id = p_id and user_id = v_uid for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'path_not_found';
  end if;
  if v_path.status not in ('active', 'paused') then
    raise exception using errcode = 'P0001', message = 'invalid_status_transition';
  end if;
  v_today := public.learning_user_today(v_uid);
  perform public.learning_path_validate(v_path.language_code, p_goal_type, v_path.current_level, p_target_level, p_weekly_minutes, p_target_date, v_today);

  update public.learning_paths
  set goal_type = p_goal_type,
      target_level = p_target_level,
      weekly_minutes = p_weekly_minutes,
      target_date = p_target_date,
      estimate = public.estimate_learning_path(v_path.language_code, v_path.current_level, p_target_level, p_weekly_minutes, p_target_date, v_today)
  where id = p_id
  returning * into v_path;
  return v_path;
end;
$$;

create or replace function public.set_learning_path_status(p_id uuid, p_status text)
returns public.learning_paths
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_path public.learning_paths;
  v_next uuid;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  select * into v_path from public.learning_paths where id = p_id and user_id = v_uid for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'path_not_found';
  end if;
  if not (
    (v_path.status = 'active' and p_status in ('paused', 'completed', 'archived'))
    or (v_path.status = 'paused' and p_status in ('active', 'archived'))
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_status_transition';
  end if;

  update public.learning_paths set status = p_status where id = p_id returning * into v_path;

  if p_status = 'archived' and (select current_learning_path_id from public.profiles where id = v_uid) = p_id then
    select id into v_next
    from public.learning_paths
    where user_id = v_uid and status <> 'archived'
    order by updated_at desc, created_at desc
    limit 1;
    update public.profiles set current_learning_path_id = v_next where id = v_uid;
  end if;
  return v_path;
end;
$$;

-- Function privileges: Supabase grants EXECUTE on new public functions to anon/authenticated by default.
revoke all on function public.learning_user_today(uuid) from public, anon, authenticated;
revoke all on function public.learning_path_validate(text, text, text, text, smallint[], date, date) from public, anon, authenticated;
revoke all on function public.estimate_learning_path(text, text, text, smallint[], date, date) from public, anon;
revoke all on function public.create_learning_path(text, text, text, text, text, smallint[], date) from public, anon;
revoke all on function public.set_current_learning_path(uuid) from public, anon;
revoke all on function public.update_learning_path_plan(uuid, text, text, smallint[], date) from public, anon;
revoke all on function public.set_learning_path_status(uuid, text) from public, anon;
grant execute on function public.estimate_learning_path(text, text, text, smallint[], date, date) to authenticated;
grant execute on function public.create_learning_path(text, text, text, text, text, smallint[], date) to authenticated;
grant execute on function public.set_current_learning_path(uuid) to authenticated;
grant execute on function public.update_learning_path_plan(uuid, text, text, smallint[], date) to authenticated;
grant execute on function public.set_learning_path_status(uuid, text) to authenticated;
```

- [ ] **Step 6: Apply and test**

Run: `pnpm db:reset && pnpm db:test && pnpm db:lint`
Expected: `foundation.test.sql .. ok`, `learning_paths.test.sql .. ok`, `learning_paths_estimate.test.sql .. ok`, all PASS; lint clean. If an assertion count mismatches (`plan(33)`), fix the count to the number of assertions actually written, never delete assertions.

- [ ] **Step 7: Types, CI check, docs, spec deltas**

Run: `pnpm db:types` and confirm `packages/shared/src/database.types.ts` now contains `learning_paths`, `level_reference_hours`, `skill_estimates`, `current_learning_path_id`, and `create_learning_path` under `Functions`.

In `.github/workflows/ci.yml`, job `database`, add before the `RLS + trigger tests (pgTAP)` step:
```yaml
      - name: Estimate fixtures in sync (SQL ↔ TS)
        run: node scripts/sync-estimate-fixtures.mjs --check
```

Append to `docs/SETUP.md`:
```markdown
## Bảng giờ tham chiếu (ước lượng thời gian)

Ước lượng thời gian của lộ trình dựa trên bảng `public.level_reference_hours` (giờ học cộng dồn mỗi bậc). Giá trị hiện tại là **tham khảo, chưa kiểm duyệt** (`reviewed = false`) và UI luôn ghi rõ điều đó. Muốn chỉnh số giờ: tạo migration mới cập nhật bảng, sửa `packages/shared/src/learning/estimate.fixtures.json` nếu ca kiểm thử bị ảnh hưởng, chạy `pnpm fixtures:sync` và commit cả hai.
```

In the spec `docs/superpowers/specs/2026-10-13-linguo-onboarding-learning-paths-design.md` §4: change the `update_learning_path_plan` signature to `(p_id uuid, p_goal_type text, p_target_level text, p_weekly_minutes smallint[], p_target_date date default null)`, mark `p_target_date` as `default null` in `create_learning_path`, and add `invalid_start_point`, `target_not_allowed_for_goal` to the error-code list.

Run: `pnpm --filter @linguo/shared typecheck && node scripts/sync-estimate-fixtures.mjs --check && pnpm db:stop`
Expected: exit 0, `Estimate fixtures in sync.`

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20261013000200_learning_paths.sql supabase/tests/learning_paths.test.sql supabase/tests/learning_paths_estimate.test.sql scripts/sync-estimate-fixtures.mjs packages/shared/src/learning/estimate.fixtures.json packages/shared/src/database.types.ts package.json .github/workflows/ci.yml docs/SETUP.md docs/superpowers/specs/2026-10-13-linguo-onboarding-learning-paths-design.md
git commit -m "feat(db): add learning paths, reference hours and RPCs with estimate parity tests"
```

---

## Wave 2

### Task 3: Web data layer, shared form components, `/app` route wrapper

**Prerequisite:** Tasks 1–2 merged (shared exports + regenerated `database.types.ts`).

**Files:**
- Create: `apps/web/src/lib/dates.ts` (+ `dates.test.ts`), `apps/web/src/features/learning-paths/{service.ts,error-map.ts,LearningPathsProvider.tsx,useReferenceHours.ts}` (+ `learning-paths.test.tsx`), `apps/web/src/features/learning-paths/components/{schedule.ts,ChoiceList.tsx,ScheduleEditor.tsx,FeasibilityBadge.tsx,EstimateSummary.tsx}` (+ `components.test.tsx`), `apps/web/src/routes/app/AppRoute.tsx`, `apps/web/tests/unit/learning-fixtures.ts`
- Modify: `apps/web/src/lib/storage.ts` (add `removeKey`), `apps/web/tests/unit/fake-supabase.ts`, `apps/web/tests/unit/render.tsx`, `apps/web/src/app/router.tsx`

- [ ] **Step 1: Test helpers**

`apps/web/src/lib/storage.ts` — append:
```ts
export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}
```

`apps/web/tests/unit/fake-supabase.ts` — replace the whole file:
```ts
import type { AppSupabaseClient } from '@/lib/supabase';

export interface FakeQuery {
  calls: Array<[string, unknown[]]>;
  builder: Record<string, unknown>;
}

/**
 * Chainable, awaitable stand-in for a PostgREST query builder. `data` may be a row, an array of rows
 * (an UPDATE ... SELECT result) or `[]` (an UPDATE that matched nothing, e.g. blocked by RLS).
 */
export function fakeQuery({ data, error = null }: { data: unknown; error?: unknown }): FakeQuery {
  const result = { data, error };
  const calls: FakeQuery['calls'] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'neq', 'in', 'order', 'update', 'single', 'maybeSingle']) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return { calls, builder };
}

export interface FakeRpc {
  data: unknown;
  error?: unknown;
}

export type FakeClient = AppSupabaseClient & { rpcCalls: Array<[string, Record<string, unknown>]> };

export function fakeClient(tables: Record<string, FakeQuery>, rpcs: Record<string, FakeRpc> = {}): FakeClient {
  const rpcCalls: FakeClient['rpcCalls'] = [];
  return {
    rpcCalls,
    from: (table: string) => {
      const q = tables[table];
      if (!q) throw new Error(`No fake for table ${table}`);
      return q.builder;
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push([name, args]);
      const r = rpcs[name];
      if (!r) throw new Error(`No fake for rpc ${name}`);
      return Promise.resolve({ data: r.data, error: r.error ?? null });
    },
  } as unknown as FakeClient;
}
```

`apps/web/tests/unit/learning-fixtures.ts`:
```ts
import type { Database } from '@linguo/shared';
import fixtures from '../../../../packages/shared/src/learning/estimate.fixtures.json';
import { toLearningPath, type ReferenceHoursByLanguage } from '@/features/learning-paths/service';
// Same id as TEST_USER_ID in render.tsx (kept literal to avoid a circular import).
const TEST_USER_ID = '11111111-1111-4111-8111-111111111111';

type PathRow = Database['public']['Tables']['learning_paths']['Row'];

export const REFERENCE: ReferenceHoursByLanguage = {
  en: fixtures.referenceHours.en.map((r) => ({ ...r, reviewed: false })),
  ko: fixtures.referenceHours.ko.map((r) => ({ ...r, reviewed: false })),
};

export const ESTIMATE_RECORD = {
  hours_needed: 185,
  weeks_min: 43,
  weeks_mid: 53,
  weeks_max: 69,
  feasibility: 'no_deadline',
  suggested_minutes_per_day: null,
  suggested_date: null,
  assumptions: { weekly_minutes: 210, hours_needed: 185, reference_reviewed: false, multiplier_range: [0.8, 1.3] },
};

export function pathRow(overrides: Partial<PathRow> = {}): PathRow {
  return {
    id: 'path-en',
    user_id: TEST_USER_ID,
    language_code: 'en',
    start_point: 'some',
    goal_type: 'daily_communication',
    current_level: 'a2',
    target_level: 'b1',
    weekly_minutes: [30, 30, 30, 30, 30, 30, 30],
    target_date: null,
    status: 'active',
    estimate: ESTIMATE_RECORD,
    created_at: '2026-10-13T01:00:00Z',
    updated_at: '2026-10-13T01:00:00Z',
    ...overrides,
  };
}

export const TEST_PATH = toLearningPath(pathRow());
export const TEST_KO_PATH = toLearningPath(
  pathRow({
    id: 'path-ko',
    language_code: 'ko',
    goal_type: 'hangul_basics',
    current_level: 'hangul',
    target_level: 'topik1',
    weekly_minutes: [15, 15, 15, 15, 15, 15, 15],
    estimate: { ...ESTIMATE_RECORD, hours_needed: 120, weeks_min: 55, weeks_mid: 69, weeks_max: 90 },
  }),
);
```

`apps/web/tests/unit/render.tsx` — add the learning-paths context. Replace the whole file:
```tsx
import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import { MemoryRouter, useLocation } from 'react-router';
import { vi } from 'vitest';
import { DEFAULT_TIMEZONE } from '@linguo/shared';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthContext, type AuthState } from '@/features/auth/AuthProvider';
import { LearningPathsContext, type LearningPathsContextValue } from '@/features/learning-paths/LearningPathsProvider';
import { ProfileContext, type ProfileContextValue } from '@/features/profile/ProfileProvider';
import { MotionProvider } from '@/providers/MotionProvider';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { TEST_PATH } from './learning-fixtures';

export const TEST_USER_ID = '11111111-1111-4111-8111-111111111111';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

interface Options {
  route?: string;
  auth?: Partial<AuthState>;
  profile?: Partial<ProfileContextValue>;
  paths?: Partial<LearningPathsContextValue>;
}

/** Renders `ui` inside every app provider with a signed-in user who has one EN path by default. */
export function renderWithProviders(ui: ReactElement, { route = '/', auth, profile, paths }: Options = {}) {
  const authValue: AuthState = {
    status: 'signed-in',
    session: null,
    user: { id: TEST_USER_ID, email: 'minhanh@example.com' } as User,
    ...auth,
  };
  const profileValue: ProfileContextValue = {
    status: 'ready',
    profile: { id: TEST_USER_ID, displayName: 'Minh Anh', timezone: DEFAULT_TIMEZONE },
    error: null,
    reload: vi.fn(),
    setProfile: vi.fn(),
    ...profile,
  };
  const pathList = paths?.paths ?? [TEST_PATH];
  const currentId = paths?.currentId !== undefined ? paths.currentId : (pathList[0]?.id ?? null);
  const pathsValue: LearningPathsContextValue = {
    status: 'ready',
    error: null,
    reload: vi.fn(),
    setCurrent: vi.fn().mockResolvedValue(undefined),
    upsertPath: vi.fn(),
    ...paths,
    paths: pathList,
    currentId,
    current: paths?.current !== undefined ? paths.current : (pathList.find((p) => p.id === currentId) ?? null),
  };
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ThemeProvider>
        <MotionProvider>
          <ToastProvider>
            <AuthContext.Provider value={authValue}>
              <ProfileContext.Provider value={profileValue}>
                <LearningPathsContext.Provider value={pathsValue}>
                  {ui}
                  <LocationProbe />
                </LearningPathsContext.Provider>
              </ProfileContext.Provider>
            </AuthContext.Provider>
          </ToastProvider>
        </MotionProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}
```


- [ ] **Step 2: Write failing tests**

`apps/web/src/lib/dates.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { addMonthsIso, formatDateVi, todayIso, weekdayIndex } from './dates';

describe('dates', () => {
  it('uses the user time zone for today and weekday', () => {
    const instant = new Date('2026-10-12T20:00:00Z'); // 13/10 03:00 in Ho Chi Minh, Monday 12/10 in New York
    expect(todayIso('Asia/Ho_Chi_Minh', instant)).toBe('2026-10-13');
    expect(todayIso('America/New_York', instant)).toBe('2026-10-12');
    expect(weekdayIndex('Asia/Ho_Chi_Minh', instant)).toBe(1); // Tuesday
    expect(weekdayIndex('America/New_York', instant)).toBe(0); // Monday
  });

  it('adds months clamping to the last day', () => {
    expect(addMonthsIso('2026-10-13', 3)).toBe('2027-01-13');
    expect(addMonthsIso('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonthsIso('2028-01-31', 1)).toBe('2028-02-29');
  });

  it('formats Vietnamese dates', () => {
    expect(formatDateVi('2027-05-04')).toBe('04/05/2027');
  });
});
```

`apps/web/src/features/learning-paths/learning-paths.test.tsx`:
```tsx
import { act, render, screen, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeClient, fakeQuery } from '../../../tests/unit/fake-supabase';
import { ESTIMATE_RECORD, pathRow, TEST_KO_PATH, TEST_PATH } from '../../../tests/unit/learning-fixtures';
import { AuthContext } from '../auth/AuthProvider';
import { learningPathErrorMessage } from './error-map';
import { LearningPathsProvider, useLearningPaths } from './LearningPathsProvider';
import { createPath, fetchCurrentPathId, listPaths, listReferenceHours, setPathStatus, updatePlan } from './service';

const mocks = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client, requireSupabase: () => mocks.client }));

describe('service', () => {
  it('lists open paths and maps them', async () => {
    const q = fakeQuery({ data: [pathRow()] });
    const paths = await listPaths(fakeClient({ learning_paths: q }));
    expect(paths).toEqual([TEST_PATH]);
    expect(q.calls).toContainEqual(['neq', ['status', 'archived']]);
  });

  it('reads the current path id', async () => {
    const q = fakeQuery({ data: { current_learning_path_id: 'path-en' } });
    expect(await fetchCurrentPathId(fakeClient({ profiles: q }), 'u1')).toBe('path-en');
  });

  it('groups reference hours by language', async () => {
    const q = fakeQuery({
      data: [
        { language_code: 'en', level_code: 'a1', ordinal: 1, cumulative_hours: 90, reviewed: false },
        { language_code: 'ko', level_code: 'topik1', ordinal: 1, cumulative_hours: 120, reviewed: true },
      ],
    });
    expect(await listReferenceHours(fakeClient({ level_reference_hours: q }))).toEqual({
      en: [{ levelCode: 'a1', ordinal: 1, cumulativeHours: 90, reviewed: false }],
      ko: [{ levelCode: 'topik1', ordinal: 1, cumulativeHours: 120, reviewed: true }],
    });
  });

  it('creates through the RPC and omits a null deadline', async () => {
    const client = fakeClient({}, { create_learning_path: { data: pathRow() } });
    const path = await createPath(client, {
      language: 'en',
      startPoint: 'some',
      goalType: 'daily_communication',
      currentLevel: 'a2',
      targetLevel: 'b1',
      weeklyMinutes: [30, 30, 30, 30, 30, 30, 30],
      targetDate: null,
    });
    expect(path).toEqual(TEST_PATH);
    expect(client.rpcCalls[0]).toEqual([
      'create_learning_path',
      {
        p_language: 'en',
        p_start_point: 'some',
        p_goal_type: 'daily_communication',
        p_current_level: 'a2',
        p_target_level: 'b1',
        p_weekly_minutes: [30, 30, 30, 30, 30, 30, 30],
      },
    ]);
  });

  it('updates the plan and status through RPCs and surfaces errors', async () => {
    const client = fakeClient(
      {},
      {
        update_learning_path_plan: { data: pathRow({ target_level: 'b2', target_date: '2027-07-13' }) },
        set_learning_path_status: { data: null, error: { code: 'P0001', message: 'invalid_status_transition' } },
      },
    );
    const updated = await updatePlan(client, 'path-en', {
      goalType: 'daily_communication',
      targetLevel: 'b2',
      weeklyMinutes: [60, 60, 60, 60, 60, 60, 60],
      targetDate: '2027-07-13',
    });
    expect(updated.targetLevel).toBe('b2');
    expect(client.rpcCalls[0]?.[1]).toMatchObject({ p_id: 'path-en', p_target_date: '2027-07-13' });
    await expect(setPathStatus(client, 'path-en', 'completed')).rejects.toMatchObject({ message: 'invalid_status_transition' });
  });
});

describe('learningPathErrorMessage', () => {
  it('maps RPC codes, network errors and unknown errors', () => {
    expect(learningPathErrorMessage({ code: 'P0001', message: 'path_exists_for_language' })).toBe('Bạn đã có lộ trình cho ngôn ngữ này.');
    expect(learningPathErrorMessage(new TypeError('Failed to fetch'))).toBe('Không kết nối được máy chủ. Kiểm tra mạng và thử lại.');
    expect(learningPathErrorMessage({ message: 'weird' })).toBe('Đã có lỗi xảy ra. Vui lòng thử lại.');
  });
});

describe('LearningPathsProvider', () => {
  beforeEach(() => {
    mocks.client = null;
  });

  function Probe() {
    const ctx = useLearningPaths();
    return (
      <div>
        <span data-testid="state">{`${ctx.status}:${ctx.paths.length}:${ctx.current?.id ?? '-'}`}</span>
        <button onClick={() => void ctx.setCurrent('path-ko')}>switch</button>
        <button onClick={() => ctx.upsertPath({ ...TEST_KO_PATH, id: 'path-new' }, { makeCurrent: true })}>add</button>
      </div>
    );
  }

  const renderProvider = () =>
    render(
      <AuthContext.Provider value={{ status: 'signed-in', session: null, user: { id: 'u1' } as User }}>
        <LearningPathsProvider>
          <Probe />
        </LearningPathsProvider>
      </AuthContext.Provider>,
    );

  it('loads paths and the current one, switches and upserts', async () => {
    mocks.client = fakeClient(
      {
        learning_paths: fakeQuery({ data: [pathRow(), pathRow({ id: 'path-ko', language_code: 'ko', goal_type: 'hangul_basics', current_level: 'hangul', target_level: 'topik1', estimate: ESTIMATE_RECORD })] }),
        profiles: fakeQuery({ data: { current_learning_path_id: 'path-en' } }),
      },
      { set_current_learning_path: { data: null } },
    );
    renderProvider();
    expect(screen.getByTestId('state')).toHaveTextContent('loading:0:-');
    expect(await screen.findByText('ready:2:path-en')).toBeInTheDocument();
    await act(async () => {
      screen.getByText('switch').click();
    });
    expect(screen.getByTestId('state')).toHaveTextContent('ready:2:path-ko');
    act(() => screen.getByText('add').click());
    expect(screen.getByTestId('state')).toHaveTextContent('ready:3:path-new');
  });

  it('falls back to the first path when no current id is stored', async () => {
    mocks.client = fakeClient({
      learning_paths: fakeQuery({ data: [pathRow()] }),
      profiles: fakeQuery({ data: { current_learning_path_id: null } }),
    });
    renderProvider();
    expect(await screen.findByText('ready:1:path-en')).toBeInTheDocument();
  });

  it('reports load errors', async () => {
    mocks.client = fakeClient({
      learning_paths: fakeQuery({ data: null, error: { message: 'boom' } }),
      profiles: fakeQuery({ data: { current_learning_path_id: null } }),
    });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('error:0:-'));
  });
});
```

`apps/web/src/features/learning-paths/components/components.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { TEST_PATH } from '../../../../tests/unit/learning-fixtures';
import { EstimateSummary } from './EstimateSummary';
import { ScheduleEditor, type ScheduleValue } from './ScheduleEditor';
import { presetFromWeek, weekFromPreset } from './schedule';

function Harness({ initial }: { initial: ScheduleValue }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <h2 id="t">Thời gian</h2>
      <ScheduleEditor value={value} onChange={setValue} labelledBy="t" />
      <output data-testid="week">{value.weeklyMinutes.join(',')}</output>
    </>
  );
}

describe('schedule helpers', () => {
  it('converts presets both ways', () => {
    expect(weekFromPreset('30')).toEqual([30, 30, 30, 30, 30, 30, 30]);
    expect(presetFromWeek([60, 60, 60, 60, 60, 60, 60])).toBe('60');
    expect(presetFromWeek([60, 60, 60, 60, 60, 0, 0])).toBe('custom');
  });
});

describe('ScheduleEditor', () => {
  it('applies presets and edits single days in custom mode', async () => {
    render(<Harness initial={{ preset: '30', weeklyMinutes: weekFromPreset('30') }} />);
    await userEvent.click(screen.getByRole('radio', { name: /45–60 phút mỗi ngày/ }));
    expect(screen.getByTestId('week')).toHaveTextContent('60,60,60,60,60,60,60');

    await userEvent.click(screen.getByRole('radio', { name: /Tùy chỉnh từng ngày/ }));
    const sunday = screen.getByLabelText('Chủ nhật');
    await userEvent.clear(sunday);
    await userEvent.type(sunday, '0');
    expect(screen.getByTestId('week')).toHaveTextContent('60,60,60,60,60,60,0');
    expect(screen.getByText('Tổng: 6 giờ mỗi tuần')).toBeInTheDocument();
  });
});

describe('EstimateSummary', () => {
  it('shows the range, feasibility and assumptions', () => {
    render(<EstimateSummary estimate={TEST_PATH.estimate} />);
    expect(screen.getByText('Khoảng 43–69 tuần')).toBeInTheDocument();
    expect(screen.getByText('Không đặt hạn')).toBeInTheDocument();
    expect(screen.getByText('Học 3 giờ 30 phút mỗi tuần')).toBeInTheDocument();
    expect(screen.getByText(/chưa được kiểm duyệt/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @linguo/web test`
Expected: FAIL — new modules not found.

- [ ] **Step 4: Implement**

`apps/web/src/lib/dates.ts`:
```ts
const DAY_FORMATS = new Map<string, Intl.DateTimeFormat>();
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** The user's local calendar date (YYYY-MM-DD) in `timeZone`. */
export function todayIso(timeZone: string, now: Date = new Date()): string {
  let format = DAY_FORMATS.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    DAY_FORMATS.set(timeZone, format);
  }
  return format.format(now);
}

/** Monday = 0 … Sunday = 6, in `timeZone`. */
export function weekdayIndex(timeZone: string, now: Date = new Date()): number {
  return WEEKDAYS.indexOf(new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(now));
}

export function addMonthsIso(iso: string, months: number): string {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number);
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function formatDateVi(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
```

`apps/web/src/features/learning-paths/service.ts`:
```ts
import {
  fromEstimateRecord,
  type CreatePathInput,
  type Database,
  type EstimateResult,
  type GoalType,
  type LanguageCode,
  type PathStatus,
  type ReferenceHours,
  type StartPoint,
  type UpdatePlanInput,
} from '@linguo/shared';
import type { AppSupabaseClient } from '@/lib/supabase';

type PathRow = Database['public']['Tables']['learning_paths']['Row'];

export interface LearningPath {
  id: string;
  language: LanguageCode;
  startPoint: StartPoint;
  goalType: GoalType;
  currentLevel: string;
  targetLevel: string;
  weeklyMinutes: number[];
  targetDate: string | null;
  status: PathStatus;
  estimate: EstimateResult;
  createdAt: string;
  updatedAt: string;
}

export type ReferenceHoursByLanguage = Record<LanguageCode, ReferenceHours[]>;

export function toLearningPath(row: PathRow): LearningPath {
  return {
    id: row.id,
    language: row.language_code as LanguageCode,
    startPoint: row.start_point as StartPoint,
    goalType: row.goal_type as GoalType,
    currentLevel: row.current_level,
    targetLevel: row.target_level,
    weeklyMinutes: row.weekly_minutes,
    targetDate: row.target_date,
    status: row.status as PathStatus,
    estimate: fromEstimateRecord(row.estimate),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listPaths(client: AppSupabaseClient): Promise<LearningPath[]> {
  const { data, error } = await client.from('learning_paths').select('*').neq('status', 'archived').order('created_at');
  if (error) throw error;
  return (data ?? []).map(toLearningPath);
}

export async function fetchCurrentPathId(client: AppSupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await client.from('profiles').select('current_learning_path_id').eq('id', userId).single();
  if (error) throw error;
  return data.current_learning_path_id;
}

export async function listReferenceHours(client: AppSupabaseClient): Promise<ReferenceHoursByLanguage> {
  const { data, error } = await client
    .from('level_reference_hours')
    .select('language_code, level_code, ordinal, cumulative_hours, reviewed')
    .order('ordinal');
  if (error) throw error;
  const grouped: ReferenceHoursByLanguage = { en: [], ko: [] };
  for (const row of data ?? []) {
    grouped[row.language_code as LanguageCode].push({
      levelCode: row.level_code,
      ordinal: row.ordinal,
      cumulativeHours: row.cumulative_hours,
      reviewed: row.reviewed,
    });
  }
  return grouped;
}

export async function createPath(client: AppSupabaseClient, input: CreatePathInput): Promise<LearningPath> {
  const { data, error } = await client.rpc('create_learning_path', {
    p_language: input.language,
    p_start_point: input.startPoint,
    p_goal_type: input.goalType,
    p_current_level: input.currentLevel,
    p_target_level: input.targetLevel,
    p_weekly_minutes: input.weeklyMinutes,
    ...(input.targetDate ? { p_target_date: input.targetDate } : {}),
  });
  if (error) throw error;
  return toLearningPath(data as PathRow);
}

export async function setCurrentPath(client: AppSupabaseClient, id: string): Promise<void> {
  const { error } = await client.rpc('set_current_learning_path', { p_id: id });
  if (error) throw error;
}

export async function updatePlan(
  client: AppSupabaseClient,
  id: string,
  input: Pick<UpdatePlanInput, 'goalType' | 'targetLevel' | 'weeklyMinutes' | 'targetDate'>,
): Promise<LearningPath> {
  const { data, error } = await client.rpc('update_learning_path_plan', {
    p_id: id,
    p_goal_type: input.goalType,
    p_target_level: input.targetLevel,
    p_weekly_minutes: input.weeklyMinutes,
    ...(input.targetDate ? { p_target_date: input.targetDate } : {}),
  });
  if (error) throw error;
  return toLearningPath(data as PathRow);
}

export async function setPathStatus(client: AppSupabaseClient, id: string, status: PathStatus): Promise<LearningPath> {
  const { data, error } = await client.rpc('set_learning_path_status', { p_id: id, p_status: status });
  if (error) throw error;
  return toLearningPath(data as PathRow);
}
```
If the generated RPC types reject the conditional spread or the `as PathRow` casts, keep the runtime behaviour (omit `p_target_date` when null) and adjust the typing minimally (no `any`).

`apps/web/src/features/learning-paths/error-map.ts`:
```ts
const MESSAGES: Record<string, string> = {
  not_authenticated: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  path_exists_for_language: 'Bạn đã có lộ trình cho ngôn ngữ này.',
  invalid_language: 'Ngôn ngữ không hợp lệ.',
  invalid_start_point: 'Điểm xuất phát không hợp lệ.',
  invalid_goal_for_language: 'Mục tiêu không phù hợp với ngôn ngữ đã chọn.',
  invalid_level: 'Trình độ không hợp lệ.',
  target_not_above_current: 'Mục tiêu phải cao hơn trình độ hiện tại.',
  target_not_allowed_for_goal: 'Bậc mục tiêu không phù hợp với loại mục tiêu.',
  invalid_schedule: 'Lịch học không hợp lệ: mỗi ngày 0–720 phút và ít nhất một ngày học.',
  target_date_in_past: 'Ngày mục tiêu đã qua.',
  target_date_too_far: 'Ngày mục tiêu quá xa (tối đa 10 năm).',
  path_not_found: 'Không tìm thấy lộ trình.',
  invalid_status_transition: 'Không thể chuyển trạng thái lộ trình như vậy.',
};

export function learningPathErrorMessage(error: unknown): string {
  if (error instanceof TypeError) return 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.';
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    const known = MESSAGES[error.message];
    if (known) return known;
  }
  return 'Đã có lỗi xảy ra. Vui lòng thử lại.';
}
```

`apps/web/src/features/learning-paths/LearningPathsProvider.tsx`:
```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { getSupabase, requireSupabase } from '@/lib/supabase';
import { fetchCurrentPathId, listPaths, setCurrentPath, type LearningPath } from './service';

export interface LearningPathsContextValue {
  status: 'loading' | 'ready' | 'error';
  error: unknown;
  paths: LearningPath[];
  currentId: string | null;
  current: LearningPath | null;
  reload: () => void;
  /** Persists the choice through the RPC, then updates local state. Throws on failure. */
  setCurrent: (id: string) => Promise<void>;
  /** Merge a path returned by an RPC; archived paths are removed. */
  upsertPath: (path: LearningPath, options?: { makeCurrent?: boolean }) => void;
}

export const LearningPathsContext = createContext<LearningPathsContextValue | null>(null);

interface State {
  ownerId: string | undefined;
  status: LearningPathsContextValue['status'];
  error: unknown;
  paths: LearningPath[];
  currentId: string | null;
}

const empty = (ownerId: string | undefined): State => ({ ownerId, status: 'loading', error: null, paths: [], currentId: null });

export function LearningPathsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [owned, setOwned] = useState<State>(() => empty(userId));
  const [attempt, setAttempt] = useState(0);
  const state = owned.ownerId === userId ? owned : empty(userId);

  useEffect(() => {
    const client = getSupabase();
    if (!client || !userId) return;
    let active = true;
    setOwned((s) => (s.ownerId === userId ? { ...s, status: 'loading', error: null } : empty(userId)));
    Promise.all([listPaths(client), fetchCurrentPathId(client, userId)])
      .then(([paths, currentId]) => {
        if (active) setOwned({ ownerId: userId, status: 'ready', error: null, paths, currentId });
      })
      .catch((error: unknown) => {
        if (active) setOwned({ ...empty(userId), status: 'error', error });
      });
    return () => {
      active = false;
    };
  }, [userId, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const setCurrent = useCallback(
    async (id: string) => {
      await setCurrentPath(requireSupabase(), id);
      setOwned((s) => (s.ownerId === userId ? { ...s, currentId: id } : s));
    },
    [userId],
  );

  const upsertPath = useCallback(
    (path: LearningPath, options: { makeCurrent?: boolean } = {}) => {
      setOwned((s) => {
        if (s.ownerId !== userId) return s;
        const others = s.paths.filter((p) => p.id !== path.id);
        const paths = path.status === 'archived' ? others : [...others, path].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        const currentId = options.makeCurrent ? path.id : s.currentId;
        return { ...s, paths, currentId };
      });
    },
    [userId],
  );

  const value = useMemo<LearningPathsContextValue>(() => {
    const current = state.paths.find((p) => p.id === state.currentId) ?? state.paths[0] ?? null;
    return {
      status: state.status,
      error: state.error,
      paths: state.paths,
      currentId: current?.id ?? null,
      current,
      reload,
      setCurrent,
      upsertPath,
    };
  }, [state, reload, setCurrent, upsertPath]);

  return <LearningPathsContext.Provider value={value}>{children}</LearningPathsContext.Provider>;
}

export function useLearningPaths(): LearningPathsContextValue {
  const ctx = useContext(LearningPathsContext);
  if (!ctx) throw new Error('useLearningPaths must be used inside <LearningPathsProvider>');
  return ctx;
}
```

`apps/web/src/features/learning-paths/useReferenceHours.ts`:
```ts
import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { listReferenceHours, type ReferenceHoursByLanguage } from './service';

let cache: Promise<ReferenceHoursByLanguage> | null = null;

/** Test hook: forget the cached table. */
export function resetReferenceHoursCache(): void {
  cache = null;
}

interface ReferenceState {
  status: 'loading' | 'ready' | 'error';
  data: ReferenceHoursByLanguage | null;
}

/** The reference table is static per deploy: load once per page and share. `enabled=false` defers loading. */
export function useReferenceHours(enabled = true): ReferenceState & { retry: () => void } {
  const [state, setState] = useState<ReferenceState>({ status: 'loading', data: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const client = getSupabase();
    if (!client) {
      setState({ status: 'error', data: null });
      return;
    }
    let active = true;
    cache ??= listReferenceHours(client);
    cache
      .then((data) => {
        if (active) setState({ status: 'ready', data });
      })
      .catch(() => {
        cache = null;
        if (active) setState({ status: 'error', data: null });
      });
    return () => {
      active = false;
    };
  }, [enabled, attempt]);

  return { ...state, retry: () => setAttempt((n) => n + 1) };
}
```

`apps/web/src/features/learning-paths/components/schedule.ts`:
```ts
import type { SchedulePreset } from '@linguo/shared';

export const WEEKDAYS = [
  { short: 'T2', long: 'Thứ Hai' },
  { short: 'T3', long: 'Thứ Ba' },
  { short: 'T4', long: 'Thứ Tư' },
  { short: 'T5', long: 'Thứ Năm' },
  { short: 'T6', long: 'Thứ Sáu' },
  { short: 'T7', long: 'Thứ Bảy' },
  { short: 'CN', long: 'Chủ nhật' },
] as const;

export const PRESET_MINUTES: Record<Exclude<SchedulePreset, 'custom'>, number> = { '15': 15, '30': 30, '60': 60, '120': 120 };

export const PRESET_LABELS: Record<SchedulePreset, string> = {
  '15': '10–15 phút mỗi ngày',
  '30': '30 phút mỗi ngày',
  '60': '45–60 phút mỗi ngày',
  '120': '90–120 phút mỗi ngày',
  custom: 'Tùy chỉnh từng ngày',
};

export function weekFromPreset(preset: Exclude<SchedulePreset, 'custom'>): number[] {
  return Array.from({ length: 7 }, () => PRESET_MINUTES[preset]);
}

export function presetFromWeek(week: readonly number[]): SchedulePreset {
  const first = week[0];
  if (first !== undefined && week.every((m) => m === first)) {
    const match = (Object.keys(PRESET_MINUTES) as Array<keyof typeof PRESET_MINUTES>).find((k) => PRESET_MINUTES[k] === first);
    if (match) return match;
  }
  return 'custom';
}

export function formatMinutes(total: number): string {
  if (total < 60) return `${total} phút`;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return minutes ? `${hours} giờ ${minutes} phút` : `${hours} giờ`;
}
```

`apps/web/src/features/learning-paths/components/ChoiceList.tsx`:
```tsx
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface Choice<T extends string> {
  value: T;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  note?: ReactNode;
}

interface ChoiceListProps<T extends string> {
  name: string;
  options: readonly Choice<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  labelledBy: string;
  columns?: 1 | 2;
}

/** Native radio group styled as tappable cards: arrow keys work, labels are the accessible names. */
export function ChoiceList<T extends string>({ name, options, value, onChange, labelledBy, columns = 1 }: ChoiceListProps<T>) {
  return (
    <fieldset aria-labelledby={labelledBy} className={cn('grid gap-2', columns === 2 && 'sm:grid-cols-2')}>
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            'flex min-h-14 items-start gap-3 rounded-2xl border border-border bg-surface-solid px-4 py-3 transition-colors',
            'has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary/40',
            option.disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-text/5',
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            disabled={option.disabled}
            onChange={() => onChange(option.value)}
            className="mt-1 size-5 shrink-0 accent-[var(--primary)]"
          />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{option.label}</span>
            {option.description && <span className="mt-0.5 block text-sm text-muted">{option.description}</span>}
            {option.note && <span className="mt-1 block text-xs font-medium text-muted">{option.note}</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
```

`apps/web/src/features/learning-paths/components/ScheduleEditor.tsx`:
```tsx
import { SCHEDULE_PRESETS, type SchedulePreset } from '@linguo/shared';
import { Input } from '@/components/ui/Input';
import { ChoiceList } from './ChoiceList';
import { formatMinutes, PRESET_LABELS, WEEKDAYS, weekFromPreset } from './schedule';

export interface ScheduleValue {
  preset: SchedulePreset;
  weeklyMinutes: number[];
}

interface ScheduleEditorProps {
  value: ScheduleValue;
  onChange: (value: ScheduleValue) => void;
  labelledBy: string;
  error?: string;
}

export function ScheduleEditor({ value, onChange, labelledBy, error }: ScheduleEditorProps) {
  const total = value.weeklyMinutes.reduce((sum, m) => sum + m, 0);
  const choosePreset = (preset: SchedulePreset) =>
    onChange({ preset, weeklyMinutes: preset === 'custom' ? value.weeklyMinutes : weekFromPreset(preset) });
  const setDay = (index: number, raw: string) => {
    const minutes = Math.max(0, Math.min(720, Number.parseInt(raw, 10) || 0));
    onChange({ preset: 'custom', weeklyMinutes: value.weeklyMinutes.map((m, i) => (i === index ? minutes : m)) });
  };

  return (
    <div className="space-y-4">
      <ChoiceList
        name="schedule-preset"
        labelledBy={labelledBy}
        value={value.preset}
        onChange={choosePreset}
        options={SCHEDULE_PRESETS.map((p) => ({ value: p, label: PRESET_LABELS[p] }))}
      />
      {value.preset === 'custom' && (
        <div className="grid grid-cols-2 gap-3 min-[380px]:grid-cols-4">
          {WEEKDAYS.map((day, i) => (
            <label key={day.short} className="space-y-1 text-sm font-medium">
              <span className="block px-1">{day.long}</span>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={720}
                step={5}
                value={String(value.weeklyMinutes[i] ?? 0)}
                onChange={(e) => setDay(i, e.target.value)}
                aria-label={day.long}
                className="px-4"
              />
            </label>
          ))}
        </div>
      )}
      <p className="px-1 text-sm text-muted">Tổng: {formatMinutes(total)} mỗi tuần</p>
      {error && (
        <p role="alert" className="px-1 text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}
```

`apps/web/src/features/learning-paths/components/FeasibilityBadge.tsx`:
```tsx
import { AlertTriangle, CalendarDays, CheckCircle2, Clock } from 'lucide-react';
import type { Feasibility } from '@linguo/shared';
import { cn } from '@/lib/cn';

const CONFIG: Record<Feasibility, { label: string; icon: typeof Clock; className: string }> = {
  no_deadline: { label: 'Không đặt hạn', icon: CalendarDays, className: 'bg-text/8 text-text' },
  feasible: { label: 'Khả thi theo kế hoạch', icon: CheckCircle2, className: 'bg-success/12 text-success' },
  tight: { label: 'Thời hạn khá căng', icon: AlertTriangle, className: 'bg-warn/15 text-text' },
  needs_more_time: { label: 'Cần tăng thời lượng', icon: Clock, className: 'bg-error/10 text-error' },
};

export function FeasibilityBadge({ feasibility }: { feasibility: Feasibility }) {
  const { label, icon: Icon, className } = CONFIG[feasibility];
  return (
    <span className={cn('inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-sm font-semibold', className)}>
      <Icon aria-hidden className="size-4 shrink-0" />
      {label}
    </span>
  );
}
```

`apps/web/src/features/learning-paths/components/EstimateSummary.tsx`:
```tsx
import type { EstimateResult } from '@linguo/shared';
import { FeasibilityBadge } from './FeasibilityBadge';
import { formatMinutes } from './schedule';

interface EstimateSummaryProps {
  estimate: EstimateResult;
  compact?: boolean;
}

export function EstimateSummary({ estimate, compact = false }: EstimateSummaryProps) {
  const { weeksMin, weeksMax, feasibility, assumptions } = estimate;
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-sm text-muted">Ước lượng</p>
        <p className="text-2xl font-bold tracking-[-0.02em]">
          Khoảng {weeksMin}–{weeksMax} tuần
        </p>
      </div>
      <FeasibilityBadge feasibility={feasibility} />
      {!compact && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Học {formatMinutes(assumptions.weeklyMinutes)} mỗi tuần</li>
          <li>Cần khoảng {assumptions.hoursNeeded} giờ học theo bảng tham chiếu</li>
          <li>Khoảng dao động từ ×0,8 đến ×1,3 so với trung bình</li>
          {!assumptions.referenceReviewed && <li>Số giờ tham chiếu chưa được kiểm duyệt, chỉ để tham khảo.</li>}
        </ul>
      )}
    </div>
  );
}
```

`apps/web/src/routes/app/AppRoute.tsx`:
```tsx
import { Outlet } from 'react-router';
import { RequireAuth } from '@/features/auth/guards';
import { LearningPathsProvider } from '@/features/learning-paths/LearningPathsProvider';
import { ProfileProvider } from '@/features/profile/ProfileProvider';

/** Everything under /app: signed-in user, profile and learning paths loaded once for all screens. */
export function AppRoute() {
  return (
    <RequireAuth>
      <ProfileProvider>
        <LearningPathsProvider>
          <Outlet />
        </LearningPathsProvider>
      </ProfileProvider>
    </RequireAuth>
  );
}
```

`apps/web/src/app/router.tsx` — replace the `app` route object with:
```tsx
      {
        path: 'app',
        element: <AppRoute />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { index: true, element: <HomePage /> },
              { path: 'hoc-tap', element: <ComingSoonPage title="Học tập" /> },
              { path: 'on-tap', element: <ComingSoonPage title="Ôn tập" /> },
              { path: 'gia-su', element: <ComingSoonPage title="Gia sư AI" /> },
              { path: 'luyen-thi', element: <ComingSoonPage title="Luyện thi" /> },
              { path: 'tien-do', element: <ComingSoonPage title="Tiến độ" /> },
              { path: 'cai-dat', element: <SettingsPage /> },
            ],
          },
        ],
      },
```
Add `import { AppRoute } from '@/routes/app/AppRoute';`; remove the now-unused `RequireAuth`/`ProfileProvider` imports only if nothing else in the file uses them (`RequireAuth` still wraps `dat-lai-mat-khau`).

- [ ] **Step 5: Run everything**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all PASS (existing suites unchanged in behaviour because `renderWithProviders` now supplies one EN path by default).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib apps/web/src/features/learning-paths apps/web/src/routes/app/AppRoute.tsx apps/web/src/app/router.tsx apps/web/tests/unit
git commit -m "feat(paths): add learning paths service, provider, reference hours hook and form components"
```

---

## Wave 3

### Task 4: Onboarding wizard (`/app/bat-dau`)

**Prerequisite:** Task 3 merged.

**Files:**
- Create: `apps/web/src/routes/app/onboarding/{logic.ts,useOnboardingDraft.ts,OnboardingPage.tsx,OnboardingProgress.tsx,OnboardingCelebration.tsx,StepLanguage.tsx,StepStartPoint.tsx,StepCurrentLevel.tsx,StepGoal.tsx,StepSchedule.tsx,StepReview.tsx}`, tests `logic.test.ts`, `onboarding.test.tsx`
- Modify: `apps/web/src/app/router.tsx` (add route)

Deviation from spec §6.2 (approved by controller): the progress indicator is a simple animated bar (`role="progressbar"`) instead of a mini RouteLine; the celebration uses RouteLine.

- [ ] **Step 1: Write failing tests**

`apps/web/src/routes/app/onboarding/logic.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { isStepValid, resolveTargetDate, scheduleOf, visibleSteps } from './logic';

const today = '2026-10-13';

describe('onboarding logic', () => {
  it('skips the current-level step for complete beginners', () => {
    expect(visibleSteps({ startPoint: 'new' })).toEqual([1, 2, 4, 5, 6]);
    expect(visibleSteps({ startPoint: 'some' })).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('defaults the schedule to 30 minutes a day', () => {
    expect(scheduleOf({})).toEqual({ preset: '30', weeklyMinutes: [30, 30, 30, 30, 30, 30, 30] });
  });

  it('resolves deadlines', () => {
    expect(resolveTargetDate({}, today)).toBeNull();
    expect(resolveTargetDate({ deadlineMode: 'date', targetDate: '2027-01-01' }, today)).toBe('2027-01-01');
    expect(resolveTargetDate({ deadlineMode: 'weeks', deadlineAmount: 4 }, today)).toBe('2026-11-10');
    expect(resolveTargetDate({ deadlineMode: 'months', deadlineAmount: 3 }, today)).toBe('2027-01-13');
  });

  it('validates each step', () => {
    const ctx = { taken: ['ko' as const], today };
    expect(isStepValid(1, { language: 'en' }, ctx)).toBe(true);
    expect(isStepValid(1, { language: 'ko' }, ctx)).toBe(false);
    expect(isStepValid(2, { startPoint: 'rusty' }, ctx)).toBe(true);
    expect(isStepValid(3, { language: 'en', currentLevel: 'topik1' }, ctx)).toBe(false);
    expect(isStepValid(4, { language: 'en', currentLevel: 'a2', goalType: 'cefr', targetLevel: 'a1' }, ctx)).toBe(false);
    expect(isStepValid(4, { language: 'en', currentLevel: 'a2', goalType: 'cefr', targetLevel: 'b2' }, ctx)).toBe(true);
    expect(isStepValid(5, { schedulePreset: 'custom', weeklyMinutes: [0, 0, 0, 0, 0, 0, 0] }, ctx)).toBe(false);
    expect(isStepValid(5, { deadlineMode: 'date', targetDate: '2026-10-01' }, ctx)).toBe(false);
    expect(isStepValid(5, { deadlineMode: 'weeks' }, ctx)).toBe(false);
    expect(isStepValid(5, { deadlineMode: 'weeks', deadlineAmount: 8 }, ctx)).toBe(true);
  });
});
```

`apps/web/src/routes/app/onboarding/onboarding.test.tsx`:
```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { REFERENCE, TEST_PATH } from '../../../../tests/unit/learning-fixtures';
import { renderWithProviders } from '../../../../tests/unit/render';
import { OnboardingPage } from './OnboardingPage';

const mocks = vi.hoisted(() => ({ createPath: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({}), requireSupabase: () => ({}) }));
vi.mock('@/features/learning-paths/useReferenceHours', () => ({
  useReferenceHours: () => ({ status: 'ready', data: REFERENCE, retry: vi.fn() }),
}));
vi.mock('@/features/learning-paths/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/learning-paths/service')>()),
  createPath: mocks.createPath,
}));

const page = (paths: Parameters<typeof renderWithProviders>[1] = {}) =>
  renderWithProviders(
    <Routes>
      <Route path="/app/bat-dau" element={<OnboardingPage />} />
      <Route path="*" element={null} />
    </Routes>,
    { route: '/app/bat-dau', paths: { paths: [] }, ...paths },
  );

const next = () => userEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));

beforeEach(() => {
  mocks.createPath.mockReset();
});

describe('OnboardingPage', () => {
  it('walks all steps and creates the path', async () => {
    const upsertPath = vi.fn();
    page({ paths: { paths: [], upsertPath } });
    expect(screen.getByRole('heading', { level: 1, name: 'Bạn muốn học ngôn ngữ nào?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /Tiếng Anh/ }));
    await next();
    await userEvent.click(screen.getByRole('radio', { name: 'Tôi đã học một ít' }));
    await next();
    expect(screen.getByRole('heading', { level: 1, name: 'Trình độ hiện tại của bạn' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /^A2/ }));
    await next();
    await userEvent.click(screen.getByRole('radio', { name: 'Giao tiếp đời sống' }));
    expect(screen.getByRole('radio', { name: /^B1/ })).toBeChecked();
    await next();
    expect(screen.getByRole('radio', { name: '30 phút mỗi ngày' })).toBeChecked();
    await next();
    expect(screen.getByRole('heading', { level: 1, name: 'Xem lại lộ trình' })).toBeInTheDocument();
    expect(screen.getByText('Khoảng 43–69 tuần')).toBeInTheDocument();

    mocks.createPath.mockResolvedValue(TEST_PATH);
    await userEvent.click(screen.getByRole('button', { name: 'Tạo lộ trình' }));
    expect(mocks.createPath).toHaveBeenCalledWith(
      {},
      {
        language: 'en',
        startPoint: 'some',
        goalType: 'daily_communication',
        currentLevel: 'a2',
        targetLevel: 'b1',
        weeklyMinutes: [30, 30, 30, 30, 30, 30, 30],
        targetDate: null,
      },
    );
    expect(upsertPath).toHaveBeenCalledWith(TEST_PATH, { makeCurrent: true });
    expect(await screen.findByRole('heading', { name: 'Lộ trình đã sẵn sàng!' })).toBeInTheDocument();
    expect(localStorage.getItem('linguo-onboarding-draft')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Vào trang chủ' }));
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/app$/);
  });

  it('skips the level step for complete beginners', async () => {
    page();
    await userEvent.click(screen.getByRole('radio', { name: /Tiếng Anh/ }));
    await next();
    await userEvent.click(screen.getByRole('radio', { name: 'Tôi mới hoàn toàn' }));
    await next();
    expect(screen.getByRole('heading', { level: 1, name: 'Mục tiêu của bạn' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Tiến độ tạo lộ trình' })).toHaveAttribute('aria-valuetext', 'Bước 3 trên 5');
  });

  it('restores the draft after a reload and discards a corrupt one', async () => {
    const first = page();
    await userEvent.click(screen.getByRole('radio', { name: /Tiếng Anh/ }));
    await next();
    first.unmount();
    const second = page();
    expect(screen.getByRole('heading', { level: 1, name: 'Bạn đang ở đâu?' })).toBeInTheDocument();
    second.unmount();

    localStorage.setItem('linguo-onboarding-draft', '{not json');
    const again = page();
    expect(screen.getByRole('heading', { level: 1, name: 'Bạn muốn học ngôn ngữ nào?' })).toBeInTheDocument();
    expect(await screen.findByText(/Bản nháp cũ không dùng được nữa/)).toBeInTheDocument();
    again.unmount();
  });

  it('locks languages that already have a path and preselects ?lang', () => {
    renderWithProviders(
      <Routes>
        <Route path="/app/bat-dau" element={<OnboardingPage />} />
      </Routes>,
      { route: '/app/bat-dau?lang=en', paths: { paths: [TEST_PATH] } },
    );
    const en = screen.getByRole('radio', { name: /Tiếng Anh/ });
    expect(en).toBeDisabled();
    expect(screen.getByText('Đã có lộ trình')).toBeInTheDocument();
  });

  it('keeps the draft and shows a Vietnamese error when creation fails', async () => {
    page();
    await userEvent.click(screen.getByRole('radio', { name: /Tiếng Anh/ }));
    await next();
    await userEvent.click(screen.getByRole('radio', { name: 'Tôi đã học một ít' }));
    await next();
    await userEvent.click(screen.getByRole('radio', { name: /^A2/ }));
    await next();
    await userEvent.click(screen.getByRole('radio', { name: 'Giao tiếp đời sống' }));
    await next();
    await next();
    mocks.createPath.mockRejectedValue({ code: 'P0001', message: 'path_exists_for_language' });
    await userEvent.click(screen.getByRole('button', { name: 'Tạo lộ trình' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Bạn đã có lộ trình cho ngôn ngữ này.');
    expect(localStorage.getItem('linguo-onboarding-draft')).not.toBeNull();
  });

  it('offers to raise daily minutes when the deadline is too close', async () => {
    page();
    await userEvent.click(screen.getByRole('radio', { name: /Tiếng Anh/ }));
    await next();
    await userEvent.click(screen.getByRole('radio', { name: 'Tôi đã học một ít' }));
    await next();
    await userEvent.click(screen.getByRole('radio', { name: /^A2/ }));
    await next();
    await userEvent.click(screen.getByRole('radio', { name: 'Giao tiếp đời sống' }));
    await next();
    await userEvent.click(screen.getByRole('radio', { name: 'Trong số tuần' }));
    await userEvent.type(screen.getByLabelText('Số tuần'), '4');
    await next();
    expect(screen.getByText('Cần tăng thời lượng')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Dùng 397 phút/ngày' }));
    await waitFor(() => expect(screen.getByText('Thời hạn khá căng')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @linguo/web test -- onboarding`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement pure logic and the draft hook**

`apps/web/src/routes/app/onboarding/logic.ts`:
```ts
import {
  addDaysIso,
  allowedTargets,
  isGoalForLanguage,
  isLevelOf,
  weeklyMinutesSchema,
  type LanguageCode,
  type OnboardingDraftData,
} from '@linguo/shared';
import { addMonthsIso } from '@/lib/dates';
import type { ScheduleValue } from '@/features/learning-paths/components/ScheduleEditor';
import { weekFromPreset } from '@/features/learning-paths/components/schedule';

export type StepNumber = 1 | 2 | 3 | 4 | 5 | 6;

export function visibleSteps(data: OnboardingDraftData): StepNumber[] {
  return data.startPoint === 'new' ? [1, 2, 4, 5, 6] : [1, 2, 3, 4, 5, 6];
}

export function scheduleOf(data: OnboardingDraftData): ScheduleValue {
  if (data.schedulePreset && data.weeklyMinutes) return { preset: data.schedulePreset, weeklyMinutes: data.weeklyMinutes };
  return { preset: '30', weeklyMinutes: weekFromPreset('30') };
}

export function resolveTargetDate(data: OnboardingDraftData, today: string): string | null {
  switch (data.deadlineMode) {
    case 'date':
      return data.targetDate ?? null;
    case 'weeks':
      return data.deadlineAmount ? addDaysIso(today, data.deadlineAmount * 7) : null;
    case 'months':
      return data.deadlineAmount ? addMonthsIso(today, data.deadlineAmount) : null;
    default:
      return null;
  }
}

interface StepContext {
  taken: readonly LanguageCode[];
  today: string;
}

export function isStepValid(step: StepNumber, data: OnboardingDraftData, ctx: StepContext): boolean {
  switch (step) {
    case 1:
      return Boolean(data.language) && !ctx.taken.includes(data.language as LanguageCode);
    case 2:
      return Boolean(data.startPoint);
    case 3:
      return Boolean(data.language && data.currentLevel && isLevelOf(data.language, data.currentLevel));
    case 4:
      return Boolean(
        data.language &&
          data.currentLevel &&
          data.goalType &&
          data.targetLevel &&
          isGoalForLanguage(data.language, data.goalType) &&
          (allowedTargets(data.language, data.goalType, data.currentLevel) as string[]).includes(data.targetLevel),
      );
    case 5: {
      if (!weeklyMinutesSchema.safeParse(scheduleOf(data).weeklyMinutes).success) return false;
      if (data.deadlineMode === 'date') {
        const max = addDaysIso(ctx.today, 3650);
        return Boolean(data.targetDate && data.targetDate >= ctx.today && data.targetDate <= max);
      }
      if (data.deadlineMode === 'weeks' || data.deadlineMode === 'months') return Boolean(data.deadlineAmount && data.deadlineAmount >= 1);
      return true;
    }
    case 6:
      return true;
  }
}
```

`apps/web/src/routes/app/onboarding/useOnboardingDraft.ts`:
```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { onboardingDraftSchema, type LanguageCode, type OnboardingDraft, type OnboardingDraftData } from '@linguo/shared';
import { readString, removeKey, writeString } from '@/lib/storage';
import type { StepNumber } from './logic';

export const DRAFT_KEY = 'linguo-onboarding-draft';
const EMPTY: OnboardingDraft = { version: 1, step: 1, data: {} };

function load(): { draft: OnboardingDraft; discarded: boolean } {
  const raw = readString(DRAFT_KEY);
  if (!raw) return { draft: EMPTY, discarded: false };
  try {
    const parsed = onboardingDraftSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return { draft: parsed.data, discarded: false };
  } catch {
    // fall through: unreadable JSON
  }
  removeKey(DRAFT_KEY);
  return { draft: EMPTY, discarded: true };
}

/** Wizard state persisted in localStorage so a reload resumes at the same step. */
export function useOnboardingDraft(initialLanguage?: LanguageCode) {
  const [initial] = useState(load);
  const [draft, setDraft] = useState<OnboardingDraft>(() =>
    initialLanguage && !initial.draft.data.language
      ? { ...initial.draft, data: { ...initial.draft.data, language: initialLanguage } }
      : initial.draft,
  );
  const persist = useRef(true);

  useEffect(() => {
    if (persist.current) writeString(DRAFT_KEY, JSON.stringify(draft));
  }, [draft]);

  const update = useCallback((patch: Partial<OnboardingDraftData>) => {
    setDraft((d) => ({ ...d, data: { ...d.data, ...patch } }));
  }, []);
  const goTo = useCallback((step: StepNumber) => setDraft((d) => ({ ...d, step })), []);
  const clear = useCallback(() => {
    persist.current = false;
    removeKey(DRAFT_KEY);
  }, []);

  return { draft, discarded: initial.discarded, update, goTo, clear };
}
```

- [ ] **Step 4: Implement the step components**

`apps/web/src/routes/app/onboarding/StepLanguage.tsx`:
```tsx
import { LANGUAGE_CODES, LANGUAGES, type LanguageCode } from '@linguo/shared';
import { ChoiceList } from '@/features/learning-paths/components/ChoiceList';

const DESCRIPTIONS: Record<LanguageCode, string> = {
  en: 'Từ nền tảng tới CEFR C2: giao tiếp, công việc, đọc tài liệu.',
  ko: 'Từ bảng chữ Hangul tới TOPIK II: giao tiếp, du học, công việc.',
};

interface Props {
  value?: LanguageCode;
  taken: readonly LanguageCode[];
  onChange: (language: LanguageCode) => void;
}

export function StepLanguage({ value, taken, onChange }: Props) {
  return (
    <ChoiceList
      name="language"
      labelledBy="onboarding-title"
      value={value}
      onChange={onChange}
      options={LANGUAGE_CODES.map((code) => ({
        value: code,
        label: (
          <>
            {LANGUAGES[code].nameVi} · <span lang={code}>{LANGUAGES[code].nativeName}</span>
          </>
        ),
        description: DESCRIPTIONS[code],
        disabled: taken.includes(code) || !LANGUAGES[code].available,
        note: taken.includes(code) ? 'Đã có lộ trình' : !LANGUAGES[code].available ? 'Sắp ra mắt' : undefined,
      }))}
    />
  );
}
```

`apps/web/src/routes/app/onboarding/StepStartPoint.tsx`:
```tsx
import { START_POINT_LABELS, START_POINTS, type StartPoint } from '@linguo/shared';
import { ChoiceList } from '@/features/learning-paths/components/ChoiceList';

export function StepStartPoint({ value, onChange }: { value?: StartPoint; onChange: (v: StartPoint) => void }) {
  return (
    <ChoiceList
      name="start-point"
      labelledBy="onboarding-title"
      value={value}
      onChange={onChange}
      options={START_POINTS.map((p) => ({
        value: p,
        label: START_POINT_LABELS[p],
        description:
          p === 'unsure' ? 'Bài kiểm tra đầu vào sẽ có trong bản cập nhật tới. Tạm thời hãy chọn mức gần đúng ở bước sau.' : undefined,
      }))}
    />
  );
}
```

`apps/web/src/routes/app/onboarding/StepCurrentLevel.tsx`:
```tsx
import { LEVEL_INFO, LEVELS, type LanguageCode, type LevelCode } from '@linguo/shared';
import { ChoiceList } from '@/features/learning-paths/components/ChoiceList';

export function StepCurrentLevel({ language, value, onChange }: { language: LanguageCode; value?: string; onChange: (v: LevelCode) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-[15px] text-muted">Chọn mức mô tả gần đúng nhất. Đây là tự đánh giá, bạn có thể làm bài kiểm tra sau.</p>
      <ChoiceList
        name="current-level"
        labelledBy="onboarding-title"
        value={value as LevelCode | undefined}
        onChange={onChange}
        options={(LEVELS[language] as readonly LevelCode[]).map((code) => ({
          value: code,
          label: LEVEL_INFO[code].label,
          description: LEVEL_INFO[code].description,
        }))}
      />
    </div>
  );
}
```

`apps/web/src/routes/app/onboarding/StepGoal.tsx`:
```tsx
import { allowedTargets, GOAL_LABELS, GOALS_BY_LANGUAGE, LEVEL_INFO, type GoalType, type LanguageCode, type LevelCode } from '@linguo/shared';
import { ChoiceList } from '@/features/learning-paths/components/ChoiceList';

interface Props {
  language: LanguageCode;
  currentLevel: string;
  goalType?: GoalType;
  targetLevel?: string;
  onGoal: (goal: GoalType) => void;
  onTarget: (level: LevelCode) => void;
}

export function StepGoal({ language, currentLevel, goalType, targetLevel, onGoal, onTarget }: Props) {
  const targets = goalType ? allowedTargets(language, goalType, currentLevel) : [];
  return (
    <div className="space-y-6">
      <ChoiceList
        name="goal"
        labelledBy="onboarding-title"
        value={goalType}
        onChange={onGoal}
        options={GOALS_BY_LANGUAGE[language].map((g) => ({ value: g, label: GOAL_LABELS[g] }))}
      />
      {goalType && (
        <section className="space-y-3">
          <h2 id="target-heading" className="text-lg font-bold">
            Bậc bạn muốn đạt
          </h2>
          {targets.length === 0 ? (
            <p role="alert" className="text-[15px] text-muted">
              Bạn đã đạt mục tiêu này. Hãy chọn một mục tiêu cao hơn.
            </p>
          ) : (
            <ChoiceList
              name="target-level"
              labelledBy="target-heading"
              value={targetLevel as LevelCode | undefined}
              onChange={onTarget}
              options={targets.map((code) => ({ value: code, label: LEVEL_INFO[code].label, description: LEVEL_INFO[code].description }))}
            />
          )}
        </section>
      )}
    </div>
  );
}
```

`apps/web/src/routes/app/onboarding/StepSchedule.tsx`:
```tsx
import { DEADLINE_MODES, type DeadlineMode } from '@linguo/shared';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { ChoiceList } from '@/features/learning-paths/components/ChoiceList';
import { ScheduleEditor, type ScheduleValue } from '@/features/learning-paths/components/ScheduleEditor';

const MODE_LABELS: Record<DeadlineMode, string> = {
  none: 'Không đặt thời hạn',
  date: 'Chọn ngày mục tiêu',
  weeks: 'Trong số tuần',
  months: 'Trong số tháng',
};

interface Props {
  schedule: ScheduleValue;
  onSchedule: (v: ScheduleValue) => void;
  mode: DeadlineMode;
  onMode: (m: DeadlineMode) => void;
  targetDate?: string | null;
  onTargetDate: (iso: string | null) => void;
  amount?: number;
  onAmount: (n: number | undefined) => void;
  today: string;
}

export function StepSchedule({ schedule, onSchedule, mode, onMode, targetDate, onTargetDate, amount, onAmount, today }: Props) {
  const dateError = mode === 'date' && targetDate && targetDate < today ? 'Ngày mục tiêu đã qua.' : undefined;
  return (
    <div className="space-y-6">
      <ScheduleEditor value={schedule} onChange={onSchedule} labelledBy="onboarding-title" />
      <section className="space-y-3">
        <h2 id="deadline-heading" className="text-lg font-bold">
          Thời hạn
        </h2>
        <p className="text-[15px] text-muted">Không bắt buộc. Linguo sẽ cho biết thời hạn có khả thi không, không hứa chắc kết quả.</p>
        <ChoiceList
          name="deadline-mode"
          labelledBy="deadline-heading"
          value={mode}
          onChange={onMode}
          options={DEADLINE_MODES.map((m) => ({ value: m, label: MODE_LABELS[m] }))}
        />
        {mode === 'date' && (
          <FormField label="Ngày mục tiêu" error={dateError}>
            {({ invalid, ...a11y }) => (
              <Input {...a11y} invalid={invalid} type="date" min={today} value={targetDate ?? ''} onChange={(e) => onTargetDate(e.target.value || null)} />
            )}
          </FormField>
        )}
        {(mode === 'weeks' || mode === 'months') && (
          <FormField label={mode === 'weeks' ? 'Số tuần' : 'Số tháng'}>
            {({ invalid, ...a11y }) => (
              <Input
                {...a11y}
                invalid={invalid}
                type="number"
                inputMode="numeric"
                min={1}
                max={mode === 'weeks' ? 520 : 120}
                value={amount ? String(amount) : ''}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  onAmount(Number.isFinite(n) && n > 0 ? Math.min(n, mode === 'weeks' ? 520 : 120) : undefined);
                }}
              />
            )}
          </FormField>
        )}
      </section>
    </div>
  );
}
```

`apps/web/src/routes/app/onboarding/StepReview.tsx`:
```tsx
import { GOAL_LABELS, LANGUAGES, LEVEL_INFO, START_POINT_LABELS, type CreatePathInput, type EstimateResult, type LevelCode } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { SolidCard } from '@/components/ui/SolidCard';
import { EstimateSummary } from '@/features/learning-paths/components/EstimateSummary';
import { formatMinutes } from '@/features/learning-paths/components/schedule';
import { formatDateVi } from '@/lib/dates';
import type { StepNumber } from './logic';

interface Props {
  input: CreatePathInput;
  estimate: EstimateResult | null;
  onEdit: (step: StepNumber) => void;
  onApplyMinutes: (minutes: number) => void;
  onApplyDate: (iso: string) => void;
  onCreate: () => void;
  creating: boolean;
  error: string | null;
}

export function StepReview({ input, estimate, onEdit, onApplyMinutes, onApplyDate, onCreate, creating, error }: Props) {
  const weekly = input.weeklyMinutes.reduce((s, m) => s + m, 0);
  const rows: Array<{ label: string; value: string; step: StepNumber }> = [
    { label: 'Ngôn ngữ', value: LANGUAGES[input.language].nameVi, step: 1 },
    { label: 'Điểm xuất phát', value: START_POINT_LABELS[input.startPoint], step: 2 },
    { label: 'Trình độ hiện tại', value: LEVEL_INFO[input.currentLevel as LevelCode].label, step: input.startPoint === 'new' ? 2 : 3 },
    { label: 'Mục tiêu', value: `${GOAL_LABELS[input.goalType]} · ${LEVEL_INFO[input.targetLevel as LevelCode].label}`, step: 4 },
    { label: 'Thời gian', value: `${formatMinutes(weekly)} mỗi tuần`, step: 5 },
    { label: 'Thời hạn', value: input.targetDate ? formatDateVi(input.targetDate) : 'Không đặt', step: 5 },
  ];

  return (
    <div className="space-y-5">
      <SolidCard>
        <dl className="divide-y divide-border">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <dt className="text-sm text-muted">{row.label}</dt>
                <dd className="font-semibold">{row.value}</dd>
              </div>
              <button
                type="button"
                onClick={() => onEdit(row.step)}
                className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-primary hover:bg-primary/10"
              >
                Sửa<span className="sr-only"> {row.label.toLowerCase()}</span>
              </button>
            </div>
          ))}
        </dl>
      </SolidCard>

      {estimate && (
        <SolidCard className="space-y-4">
          <EstimateSummary estimate={estimate} />
          {estimate.feasibility !== 'feasible' && estimate.feasibility !== 'no_deadline' && (
            <div className="flex flex-wrap gap-2">
              {estimate.suggestedMinutesPerDay && (
                <Button variant="ghost" onClick={() => onApplyMinutes(estimate.suggestedMinutesPerDay!)}>
                  Dùng {estimate.suggestedMinutesPerDay} phút/ngày
                </Button>
              )}
              {estimate.suggestedDate && (
                <Button variant="ghost" onClick={() => onApplyDate(estimate.suggestedDate!)}>
                  Dời ngày mục tiêu sang {formatDateVi(estimate.suggestedDate)}
                </Button>
              )}
            </div>
          )}
        </SolidCard>
      )}

      <p className="text-sm text-muted">Trình độ từng kỹ năng sẽ được ghi nhận là tự đánh giá cho tới khi có bài kiểm tra đầu vào.</p>

      {error && (
        <p role="alert" className="rounded-2xl border border-error/30 bg-error/10 px-4 py-3 text-[15px] text-error">
          {error}
        </p>
      )}
      <Button variant="accent" size="lg" block loading={creating} onClick={onCreate}>
        Tạo lộ trình
      </Button>
    </div>
  );
}
```

`apps/web/src/routes/app/onboarding/OnboardingProgress.tsx`:
```tsx
import { motion } from 'motion/react';
import { EASE_OUT } from '@/design/motion';
import { useMotionPrefs } from '@/providers/MotionProvider';

export function OnboardingProgress({ current, total }: { current: number; total: number }) {
  const { reduceMotion } = useMotionPrefs();
  return (
    <div
      role="progressbar"
      aria-label="Tiến độ tạo lộ trình"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current}
      aria-valuetext={`Bước ${current} trên ${total}`}
      className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-text/10"
    >
      <motion.div
        className="h-full rounded-full bg-primary"
        initial={false}
        animate={{ width: `${(current / total) * 100}%` }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: EASE_OUT }}
      />
    </div>
  );
}
```

`apps/web/src/routes/app/onboarding/OnboardingCelebration.tsx`:
```tsx
import { useEffect, useRef } from 'react';
import { LEVEL_INFO, type LevelCode } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { CountUp } from '@/components/ui/CountUp';
import { RouteLine } from '@/components/ui/RouteLine';
import type { LearningPath } from '@/features/learning-paths/service';
import { useMotionPrefs } from '@/providers/MotionProvider';

export function OnboardingCelebration({ path, onDone }: { path: LearningPath; onDone: () => void }) {
  const { reduceMotion } = useMotionPrefs();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const from = LEVEL_INFO[path.currentLevel as LevelCode].label;
  const to = LEVEL_INFO[path.targetLevel as LevelCode].label;

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main id="main" className="mx-auto flex min-h-hero w-full max-w-md flex-col items-center justify-center gap-6 px-safe py-10 text-center">
      <RouteLine
        title={`Lộ trình từ ${from} tới ${to}`}
        viewBox="0 0 240 70"
        className="max-w-xs text-text"
        tracks={[
          {
            id: 'done',
            color: '#4CA2D1',
            d: 'M20 48 C80 0 150 80 220 22',
            stops: [
              { x: 20, y: 48, label: from, labelPosition: 'bottom', anchor: 'start' },
              { x: 220, y: 22, label: to, labelPosition: 'top', anchor: 'end' },
            ],
          },
        ]}
      />
      <h1 ref={headingRef} tabIndex={-1} className="text-[28px] font-bold tracking-[-0.03em] focus:outline-none">
        Lộ trình đã sẵn sàng!
      </h1>
      <p className="text-[17px] text-muted">
        Ước lượng khoảng <CountUp to={path.estimate.weeksMin} durationMs={reduceMotion ? 0 : 1200} />–
        <CountUp to={path.estimate.weeksMax} durationMs={reduceMotion ? 0 : 1200} /> tuần để đạt {to}.
      </p>
      <Button variant="accent" size="lg" onClick={onDone}>
        Vào trang chủ
      </Button>
    </main>
  );
}
```

- [ ] **Step 5: Implement the page and route**

`apps/web/src/routes/app/onboarding/OnboardingPage.tsx`:
```tsx
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  createPathSchema,
  defaultTarget,
  DEFAULT_TIMEZONE,
  estimatePath,
  fieldErrors,
  isLevelOf,
  LANGUAGE_CODES,
  suggestedCurrentLevel,
  type LanguageCode,
} from '@linguo/shared';
import { FullScreenLoader } from '@/components/layout/FullScreenLoader';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { useToast } from '@/components/ui/Toast';
import { presetFromWeek } from '@/features/learning-paths/components/schedule';
import { learningPathErrorMessage } from '@/features/learning-paths/error-map';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { createPath, type LearningPath } from '@/features/learning-paths/service';
import { useReferenceHours } from '@/features/learning-paths/useReferenceHours';
import { useProfile } from '@/features/profile/ProfileProvider';
import { todayIso } from '@/lib/dates';
import { requireSupabase } from '@/lib/supabase';
import { isStepValid, resolveTargetDate, scheduleOf, visibleSteps, type StepNumber } from './logic';
import { OnboardingCelebration } from './OnboardingCelebration';
import { OnboardingProgress } from './OnboardingProgress';
import { StepCurrentLevel } from './StepCurrentLevel';
import { StepGoal } from './StepGoal';
import { StepLanguage } from './StepLanguage';
import { StepReview } from './StepReview';
import { StepSchedule } from './StepSchedule';
import { StepStartPoint } from './StepStartPoint';
import { useOnboardingDraft } from './useOnboardingDraft';

const TITLES: Record<StepNumber, string> = {
  1: 'Bạn muốn học ngôn ngữ nào?',
  2: 'Bạn đang ở đâu?',
  3: 'Trình độ hiện tại của bạn',
  4: 'Mục tiêu của bạn',
  5: 'Bạn học được bao lâu?',
  6: 'Xem lại lộ trình',
};

export function OnboardingPage() {
  const [params] = useSearchParams();
  const langParam = params.get('lang');
  const initialLanguage = (LANGUAGE_CODES as readonly string[]).includes(langParam ?? '') ? (langParam as LanguageCode) : undefined;
  const { draft, discarded, update, goTo, clear } = useOnboardingDraft(initialLanguage);
  const paths = useLearningPaths();
  const { profile } = useProfile();
  const reference = useReferenceHours();
  const toast = useToast();
  const navigate = useNavigate();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<LearningPath | null>(null);

  const today = todayIso(profile?.timezone ?? DEFAULT_TIMEZONE);
  const data = draft.data;
  const taken = paths.paths.map((p) => p.language);
  const steps = visibleSteps(data);
  const step: StepNumber = steps.includes(draft.step as StepNumber) ? (draft.step as StepNumber) : (steps.find((s) => s > draft.step) ?? 1);
  const index = steps.indexOf(step);
  const schedule = scheduleOf(data);
  const targetDate = resolveTargetDate(data, today);

  useEffect(() => {
    if (discarded) toast.show({ tone: 'info', message: 'Bản nháp cũ không dùng được nữa, mình bắt đầu lại từ đầu nhé.' });
  }, [discarded, toast]);

  useEffect(() => {
    titleRef.current?.focus();
  }, [step]);

  const input = useMemo(() => {
    const parsed = createPathSchema.safeParse({
      language: data.language,
      startPoint: data.startPoint,
      goalType: data.goalType,
      currentLevel: data.currentLevel,
      targetLevel: data.targetLevel,
      weeklyMinutes: schedule.weeklyMinutes,
      targetDate,
    });
    return parsed;
  }, [data, schedule.weeklyMinutes, targetDate]);

  const estimate = useMemo(() => {
    if (!input.success || !reference.data) return null;
    try {
      return estimatePath({ ...input.data, today }, reference.data[input.data.language]);
    } catch {
      return null;
    }
  }, [input, reference.data, today]);

  if (paths.status === 'loading') return <FullScreenLoader />;
  if (paths.status === 'error') {
    return (
      <main id="main" className="mx-auto max-w-md px-safe py-10">
        <ErrorState title="Không tải được lộ trình" onRetry={paths.reload} />
      </main>
    );
  }
  if (created) return <OnboardingCelebration path={created} onDone={() => navigate('/app', { replace: true })} />;

  const goNext = () => {
    const nextStep = steps[index + 1];
    if (nextStep) goTo(nextStep);
  };
  const goBack = () => {
    const prev = steps[index - 1];
    if (prev) goTo(prev);
    else navigate(paths.paths.length > 0 ? '/app' : '/', { replace: false });
  };

  async function create() {
    if (!input.success) {
      setCreateError(Object.values(fieldErrors(input.error))[0] ?? 'Thông tin chưa hợp lệ.');
      return;
    }
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const path = await createPath(requireSupabase(), input.data);
      paths.upsertPath(path, { makeCurrent: true });
      clear();
      setCreated(path);
    } catch (error) {
      setCreateError(learningPathErrorMessage(error));
    } finally {
      setCreating(false);
    }
  }

  let body: ReactNode = null;
  if (step === 1) {
    body = (
      <StepLanguage
        value={data.language}
        taken={taken}
        onChange={(language) => {
          if (language !== data.language) {
            update({ language, startPoint: undefined, currentLevel: undefined, goalType: undefined, targetLevel: undefined });
          }
        }}
      />
    );
  } else if (step === 2 && data.language) {
    const language = data.language;
    body = (
      <StepStartPoint
        value={data.startPoint}
        onChange={(startPoint) => {
          const suggested = suggestedCurrentLevel(language, startPoint);
          const keep = data.currentLevel && isLevelOf(language, data.currentLevel) ? data.currentLevel : undefined;
          update({ startPoint, currentLevel: startPoint === 'new' ? (suggested ?? undefined) : (keep ?? suggested ?? undefined) });
        }}
      />
    );
  } else if (step === 3 && data.language) {
    body = (
      <StepCurrentLevel
        language={data.language}
        value={data.currentLevel}
        onChange={(currentLevel) => update({ currentLevel, targetLevel: undefined, goalType: data.goalType })}
      />
    );
  } else if (step === 4 && data.language && data.currentLevel) {
    const { language, currentLevel } = data;
    body = (
      <StepGoal
        language={language}
        currentLevel={currentLevel}
        goalType={data.goalType}
        targetLevel={data.targetLevel}
        onGoal={(goalType) => update({ goalType, targetLevel: defaultTarget(language, goalType, currentLevel) ?? undefined })}
        onTarget={(targetLevel) => update({ targetLevel })}
      />
    );
  } else if (step === 5) {
    body = (
      <StepSchedule
        schedule={schedule}
        onSchedule={(v) => update({ schedulePreset: v.preset, weeklyMinutes: v.weeklyMinutes })}
        mode={data.deadlineMode ?? 'none'}
        onMode={(deadlineMode) => update({ deadlineMode })}
        targetDate={data.targetDate}
        onTargetDate={(iso) => update({ targetDate: iso })}
        amount={data.deadlineAmount}
        onAmount={(deadlineAmount) => update({ deadlineAmount })}
        today={today}
      />
    );
  } else if (step === 6) {
    body = input.success ? (
      <StepReview
        input={input.data}
        estimate={estimate}
        onEdit={goTo}
        onApplyMinutes={(minutes) => {
          const week = schedule.weeklyMinutes.map((m) => (m > 0 ? minutes : 0));
          update({ schedulePreset: presetFromWeek(week), weeklyMinutes: week });
        }}
        onApplyDate={(iso) => update({ deadlineMode: 'date', targetDate: iso })}
        onCreate={() => void create()}
        creating={creating}
        error={createError}
      />
    ) : (
      <ErrorState title="Thông tin chưa đầy đủ" description="Hãy quay lại các bước trước để hoàn tất." onRetry={() => goTo(1)} retryLabel="Về bước 1" />
    );
  }

  if (reference.status === 'error' && step >= 3) {
    body = <ErrorState title="Không tải được bảng trình độ" onRetry={reference.retry} />;
  }

  const valid = isStepValid(step, data, { taken, today }) && !(step >= 3 && reference.status !== 'ready');

  return (
    <div className="flex min-h-hero flex-col bg-bg">
      <header className="pt-safe">
        <div className="mx-auto flex h-14 w-full max-w-xl items-center gap-2 px-safe">
          <button
            type="button"
            onClick={goBack}
            aria-label="Quay lại"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-text/5"
          >
            <ArrowLeft aria-hidden className="size-5" />
          </button>
          <OnboardingProgress current={index + 1} total={steps.length} />
          {paths.paths.length > 0 ? (
            <Link to="/app" aria-label="Thoát tạo lộ trình" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-text/5">
              <X aria-hidden className="size-5" />
            </Link>
          ) : (
            <span aria-hidden="true" className="size-11 shrink-0" />
          )}
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-xl flex-1 px-safe pb-[calc(7rem+env(safe-area-inset-bottom,0px))] pt-3">
        <p className="text-sm text-muted">
          Bước {index + 1}/{steps.length}
        </p>
        <h1 id="onboarding-title" ref={titleRef} tabIndex={-1} className="mt-1 text-[26px] font-bold leading-tight tracking-[-0.03em] focus:outline-none">
          {TITLES[step]}
        </h1>
        <div className="mt-5">{body}</div>
      </main>
      {step !== 6 && (
        <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface-solid/95 pb-safe backdrop-blur-md">
          <div className="mx-auto w-full max-w-xl px-safe py-3">
            <Button variant="accent" size="lg" block disabled={!valid} onClick={goNext}>
              Tiếp tục
            </Button>
          </div>
        </footer>
      )}
    </div>
  );
}
```
`apps/web/src/app/router.tsx` — inside the `app` route's `children`, add as the first entry:
```tsx
          { path: 'bat-dau', element: <OnboardingPage /> },
```
with `import { OnboardingPage } from '@/routes/app/onboarding/OnboardingPage';`.

- [ ] **Step 6: Run tests, typecheck, lint, build**

Run: `pnpm --filter @linguo/web test && pnpm typecheck && pnpm lint && pnpm build`
Expected: PASS. If the "deadline too close" test computes a different suggested value, recompute by hand from the fixture algorithm (a2→b1 185 h, 4 weeks, 7 study days → ceil(11100/28) = 397) and fix the code, not the expectation.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/routes/app/onboarding apps/web/src/app/router.tsx
git commit -m "feat(onboarding): add six-step learning path wizard with saved draft and estimate review"
```

---

### Task 5: Home summary, language switching, Korean enabled

**Prerequisite:** Task 3 merged.

**Files:**
- Create: `apps/web/src/routes/app/home/PathSummaryCard.tsx`, `SpreadWarning.tsx`, test `apps/web/src/routes/app/home/home.test.tsx`
- Modify: `apps/web/src/routes/app/HomePage.tsx`, `apps/web/src/components/ui/LanguagePill.tsx`, `apps/web/src/components/layout/AppBar.tsx`, `packages/shared/src/constants.ts` (`ko.available: true`), `packages/shared/src/schemas.test.ts`, `apps/web/src/components/ui/expressive.test.tsx` (LanguagePill block), `apps/web/src/components/layout/shell.test.tsx` (HomePage block)

- [ ] **Step 1: Enable Korean** — in `packages/shared/src/constants.ts` set `ko: { …, available: true }`; in `packages/shared/src/schemas.test.ts` change the constants test to:
```ts
describe('constants', () => {
  it('has six skills and both languages available', () => {
    expect(SKILLS).toHaveLength(6);
    expect(LANGUAGES.en.available).toBe(true);
    expect(LANGUAGES.ko.available).toBe(true);
  });
});
```

- [ ] **Step 2: Write failing tests**

`apps/web/src/routes/app/home/home.test.tsx`:
```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TEST_KO_PATH, TEST_PATH } from '../../../../tests/unit/learning-fixtures';
import { renderWithProviders } from '../../../../tests/unit/render';
import { HomePage } from '../HomePage';
import { needsSpreadWarning } from './SpreadWarning';

const mocks = vi.hoisted(() => ({ setPathStatus: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({}), requireSupabase: () => ({}) }));
vi.mock('@/features/learning-paths/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/learning-paths/service')>()),
  setPathStatus: mocks.setPathStatus,
}));

describe('HomePage', () => {
  it('greets and summarises the current path without fake progress', () => {
    renderWithProviders(<HomePage />, { route: '/app' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chào Minh Anh');
    expect(screen.getByText('Lộ trình của bạn')).toBeInTheDocument();
    expect(screen.getByText('A2 → B1')).toBeInTheDocument();
    expect(screen.getByText('Khoảng 43–69 tuần')).toBeInTheDocument();
    expect(screen.getByText('Chưa đủ dữ liệu (tự đánh giá)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bắt đầu phiên học' })).toBeDisabled();
  });

  it('redirects to onboarding only when the list loaded empty', () => {
    const { unmount } = renderWithProviders(<HomePage />, { route: '/app', paths: { status: 'loading', paths: [] } });
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/app$/);
    unmount();
    renderWithProviders(<HomePage />, { route: '/app', paths: { paths: [] } });
    expect(screen.getByTestId('location')).toHaveTextContent('/app/bat-dau');
  });

  it('shows an error with retry', async () => {
    const reload = vi.fn();
    renderWithProviders(<HomePage />, { route: '/app', paths: { status: 'error', paths: [], reload } });
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(reload).toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/app$/);
  });

  it('resumes a paused path', async () => {
    const upsertPath = vi.fn();
    mocks.setPathStatus.mockResolvedValue({ ...TEST_PATH, status: 'active' });
    renderWithProviders(<HomePage />, { route: '/app', paths: { paths: [{ ...TEST_PATH, status: 'paused' }], upsertPath } });
    expect(screen.getByText('Đang tạm dừng')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tiếp tục lộ trình' }));
    expect(mocks.setPathStatus).toHaveBeenCalledWith({}, 'path-en', 'active');
    expect(upsertPath).toHaveBeenCalledWith({ ...TEST_PATH, status: 'active' });
  });

  it('warns when two languages share too little time', () => {
    const low = (p: typeof TEST_PATH) => ({ ...p, weeklyMinutes: [10, 10, 10, 10, 10, 10, 10] });
    expect(needsSpreadWarning([low(TEST_PATH), low(TEST_KO_PATH)])).toBe(true);
    expect(needsSpreadWarning([TEST_PATH, low(TEST_KO_PATH)])).toBe(false);
    renderWithProviders(<HomePage />, { route: '/app', paths: { paths: [low(TEST_PATH), low(TEST_KO_PATH)] } });
    expect(screen.getByRole('note')).toHaveTextContent('Bạn đang học 2 ngôn ngữ');
  });
});
```

In `apps/web/src/components/layout/shell.test.tsx`: delete the whole `describe('HomePage', …)` block (now covered by `home.test.tsx`) and its `HomePage` import.

In `apps/web/src/components/ui/expressive.test.tsx`: replace the entire `describe('LanguagePill', …)` block with:
```tsx
describe('LanguagePill', () => {
  const paths = [
    { id: 'path-en', language: 'en' as const, status: 'active' as const },
    { id: 'path-ko', language: 'ko' as const, status: 'paused' as const },
  ];

  it('shows the current language as text, lists paths and returns focus on Escape', async () => {
    render(withMotion(<LanguagePill paths={paths} currentId="path-en" onSelect={vi.fn()} onAdd={vi.fn()} />));
    const trigger = screen.getByRole('button', { name: /^EN – Ngôn ngữ đang học: Tiếng Anh/ });
    expect(trigger).toHaveTextContent('EN');
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /Tiếng Anh/, current: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tiếng Hàn.*tạm dừng/ })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('switches path and offers to add a missing language', async () => {
    const onSelect = vi.fn();
    const onAdd = vi.fn();
    const { rerender } = render(withMotion(<LanguagePill paths={paths} currentId="path-en" onSelect={onSelect} onAdd={onAdd} />));
    await userEvent.click(screen.getByRole('button', { name: /Ngôn ngữ đang học/ }));
    await userEvent.click(screen.getByRole('button', { name: /Tiếng Hàn/ }));
    expect(onSelect).toHaveBeenCalledWith('path-ko');

    rerender(withMotion(<LanguagePill paths={[paths[0]!]} currentId="path-en" onSelect={onSelect} onAdd={onAdd} />));
    await userEvent.click(screen.getByRole('button', { name: /Ngôn ngữ đang học/ }));
    await userEvent.click(screen.getByRole('button', { name: '+ Thêm Tiếng Hàn' }));
    expect(onAdd).toHaveBeenCalledWith('ko');
  });

  it('closes on outside click', async () => {
    render(
      withMotion(
        <div>
          <LanguagePill paths={paths} currentId="path-en" onSelect={vi.fn()} onAdd={vi.fn()} />
          <button>outside</button>
        </div>,
      ),
    );
    const trigger = screen.getByRole('button', { name: /Ngôn ngữ đang học/ });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByText('outside'));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
```
(Add `vi` to the vitest import of that file if missing.)

- [ ] **Step 3: Run to verify failure**

Run: `pnpm test`
Expected: FAIL — new modules / new LanguagePill props missing.

- [ ] **Step 4: Implement**

`apps/web/src/routes/app/home/SpreadWarning.tsx`:
```tsx
import { AlertTriangle } from 'lucide-react';
import type { LearningPath } from '@/features/learning-paths/service';

const MIN_AVERAGE_MINUTES = 15;

/** PRD 2.1E: two active languages, each averaging under 15 minutes a day. */
export function needsSpreadWarning(paths: readonly LearningPath[]): boolean {
  const active = paths.filter((p) => p.status === 'active');
  return active.length >= 2 && active.every((p) => p.weeklyMinutes.reduce((s, m) => s + m, 0) / 7 < MIN_AVERAGE_MINUTES);
}

export function SpreadWarning({ paths }: { paths: readonly LearningPath[] }) {
  if (!needsSpreadWarning(paths)) return null;
  return (
    <div role="note" className="flex items-start gap-3 rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3 text-[15px]">
      <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-warn" />
      <p>
        Bạn đang học 2 ngôn ngữ với ít thời gian cho mỗi ngôn ngữ. Tập trung một ngôn ngữ hoặc tăng thời lượng sẽ giúp tiến bộ rõ hơn.
      </p>
    </div>
  );
}
```

`apps/web/src/routes/app/home/PathSummaryCard.tsx`:
```tsx
import { Link } from 'react-router';
import { GOAL_LABELS, LANGUAGES, LEVEL_INFO, type LevelCode } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { SolidCard } from '@/components/ui/SolidCard';
import { EstimateSummary } from '@/features/learning-paths/components/EstimateSummary';
import { formatMinutes } from '@/features/learning-paths/components/schedule';
import type { LearningPath } from '@/features/learning-paths/service';
import { weekdayIndex } from '@/lib/dates';

interface Props {
  path: LearningPath;
  timeZone: string;
  onResume: () => void;
  resuming: boolean;
}

export function PathSummaryCard({ path, timeZone, onResume, resuming }: Props) {
  const from = LEVEL_INFO[path.currentLevel as LevelCode].label;
  const to = LEVEL_INFO[path.targetLevel as LevelCode].label;
  const todayMinutes = path.weeklyMinutes[weekdayIndex(timeZone)] ?? 0;
  return (
    <SolidCard className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">Lộ trình của bạn</p>
          <h2 className="text-xl font-bold tracking-[-0.02em]">
            {LANGUAGES[path.language].nameVi} · {GOAL_LABELS[path.goalType]}
          </h2>
        </div>
        {path.status === 'paused' && (
          <span className="shrink-0 rounded-full bg-warn/15 px-3 py-1 text-sm font-semibold">Đang tạm dừng</span>
        )}
      </div>
      <p className="text-lg font-semibold">
        <span className="sr-only">Từ trình độ hiện tại tới mục tiêu: </span>
        {from} → {to}
      </p>
      <EstimateSummary estimate={path.estimate} compact />
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-muted">Hôm nay</dt>
          <dd className="font-semibold">{todayMinutes > 0 ? `${formatMinutes(todayMinutes)} theo lịch` : 'Ngày nghỉ theo lịch'}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Kỹ năng</dt>
          <dd className="font-semibold">Chưa đủ dữ liệu (tự đánh giá)</dd>
        </div>
      </dl>
      {path.status === 'paused' ? (
        <Button variant="primary" size="lg" block loading={resuming} onClick={onResume}>
          Tiếp tục lộ trình
        </Button>
      ) : (
        <div className="space-y-2">
          <Button variant="accent" size="lg" block disabled aria-describedby="session-soon">
            Bắt đầu phiên học
          </Button>
          <p id="session-soon" className="text-center text-sm text-muted">
            Sắp ra mắt trong bản cập nhật tới.
          </p>
        </div>
      )}
      <Link to="/app/cai-dat#lo-trinh" className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
        Sửa kế hoạch
      </Link>
    </SolidCard>
  );
}
```

`apps/web/src/routes/app/HomePage.tsx` — replace the whole file:
```tsx
import { useState } from 'react';
import { Navigate } from 'react-router';
import { DEFAULT_TIMEZONE } from '@linguo/shared';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { learningPathErrorMessage } from '@/features/learning-paths/error-map';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { setPathStatus } from '@/features/learning-paths/service';
import { useProfile } from '@/features/profile/ProfileProvider';
import { requireSupabase } from '@/lib/supabase';
import { PathSummaryCard } from './home/PathSummaryCard';
import { SpreadWarning } from './home/SpreadWarning';

const todayLabel = () => new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

export function HomePage() {
  const { status, profile, reload } = useProfile();
  const paths = useLearningPaths();
  const toast = useToast();
  const [resuming, setResuming] = useState(false);
  const name = profile?.displayName.trim();

  if (paths.status === 'ready' && paths.paths.length === 0) return <Navigate to="/app/bat-dau" replace />;

  async function resume() {
    if (!paths.current) return;
    setResuming(true);
    try {
      paths.upsertPath(await setPathStatus(requireSupabase(), paths.current.id, 'active'));
    } catch (error) {
      toast.show({ tone: 'error', message: learningPathErrorMessage(error) });
    } finally {
      setResuming(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-sm capitalize text-muted">{todayLabel()}</p>
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">
          {status === 'loading' ? (
            <>
              <span className="sr-only">Đang tải…</span>
              <Skeleton className="h-8 w-52 align-middle" />
            </>
          ) : (
            `Chào ${name || 'bạn'}`
          )}
        </h1>
      </header>

      {status === 'error' && <ErrorState title="Không tải được hồ sơ" onRetry={reload} />}
      {paths.status === 'loading' && <Skeleton className="block h-64 w-full rounded-3xl" />}
      {paths.status === 'error' && <ErrorState title="Không tải được lộ trình" onRetry={paths.reload} />}
      {paths.status === 'ready' && paths.current && (
        <>
          <SpreadWarning paths={paths.paths} />
          <PathSummaryCard
            path={paths.current}
            timeZone={profile?.timezone ?? DEFAULT_TIMEZONE}
            onResume={() => void resume()}
            resuming={resuming}
          />
        </>
      )}
    </div>
  );
}
```

`apps/web/src/components/ui/LanguagePill.tsx` — replace the whole file:
```tsx
import { useEffect, useId, useRef, useState, type FocusEvent } from 'react';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { LANGUAGE_CODES, LANGUAGES, type LanguageCode, type PathStatus } from '@linguo/shared';

export interface PillPath {
  id: string;
  language: LanguageCode;
  status: PathStatus;
}

interface LanguagePillProps {
  paths: readonly PillPath[];
  currentId: string | null;
  onSelect: (pathId: string) => void;
  onAdd: (language: LanguageCode) => void;
}

/**
 * Current learning language as text ("EN ▾"), never a flag (PRD 12.2).
 * Disclosure pattern: a button toggles a plain list of buttons (not an ARIA menu).
 */
export function LanguagePill({ paths, currentId, onSelect, onAdd }: LanguagePillProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const current = paths.find((p) => p.id === currentId) ?? null;
  const lang = current ? LANGUAGES[current.language] : null;
  const missing = LANGUAGE_CODES.filter((code) => LANGUAGES[code].available && !paths.some((p) => p.language === code));

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // A null relatedTarget (e.g. Safari not focusing clicked buttons) is handled by the pointerdown listener.
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget;
    if (next instanceof Node && !e.currentTarget.contains(next)) setOpen(false);
  };

  const itemClass = 'flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm hover:bg-text/5';

  return (
    <div ref={wrapperRef} className="relative" onBlur={onBlur}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={lang ? `${lang.short} – Ngôn ngữ đang học: ${lang.nameVi}. Đổi ngôn ngữ` : 'Chọn ngôn ngữ học'}
        onClick={() => setOpen((v) => !v)}
        className="glass inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold"
      >
        {lang ? lang.short : 'Ngôn ngữ'}
        <ChevronDown aria-hidden className="size-4" />
      </button>
      <ul
        id={panelId}
        hidden={!open}
        className="absolute right-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-surface-solid p-1.5 shadow-[var(--shadow-card)]"
      >
        {paths.map((path) => {
          const item = LANGUAGES[path.language];
          const active = path.id === currentId;
          return (
            <li key={path.id}>
              <button
                type="button"
                aria-current={active ? 'true' : undefined}
                onClick={() => {
                  setOpen(false);
                  if (!active) onSelect(path.id);
                }}
                className={itemClass}
              >
                <span>
                  <span className="font-semibold">{item.short}</span> · {item.nameVi} <span lang={path.language}>({item.nativeName})</span>
                  {path.status === 'paused' && <span className="text-muted"> · tạm dừng</span>}
                </span>
                {active && <Check aria-hidden className="size-4 shrink-0 text-primary" />}
              </button>
            </li>
          );
        })}
        {missing.map((code) => (
          <li key={code}>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onAdd(code);
              }}
              className={itemClass}
            >
              <span>+ Thêm {LANGUAGES[code].nameVi}</span>
              <Plus aria-hidden className="size-4 shrink-0 text-muted" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

`apps/web/src/components/layout/AppBar.tsx` — replace the `<LanguagePill />` usage and add the wiring:
```tsx
import { Link, useNavigate } from 'react-router';
import { LanguagePill } from '@/components/ui/LanguagePill';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthProvider';
import { learningPathErrorMessage } from '@/features/learning-paths/error-map';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { useProfile } from '@/features/profile/ProfileProvider';
import { asset } from '@/lib/asset';

export function AppBar() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { paths, currentId, setCurrent } = useLearningPaths();
  const toast = useToast();
  const navigate = useNavigate();
  const initial = (profile?.displayName || user?.email || '?').trim().charAt(0).toUpperCase();
  return (
    <header className="glass sticky top-0 z-30 border-x-0 border-t-0 pt-safe">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-safe">
        <Link to="/app" className="inline-flex min-h-11 items-center gap-2 font-bold tracking-[-0.02em] lg:invisible">
          <img src={asset('brand/logo-mark.svg')} alt="" width={28} height={28} className="size-7" />
          <span>Linguo</span>
        </Link>
        <div className="flex items-center gap-2">
          <LanguagePill
            paths={paths}
            currentId={currentId}
            onSelect={(id) => {
              setCurrent(id).catch((error: unknown) => toast.show({ tone: 'error', message: learningPathErrorMessage(error) }));
            }}
            onAdd={(language) => navigate(`/app/bat-dau?lang=${language}`)}
          />
          <Link
            to="/app/cai-dat"
            aria-label="Tài khoản và cài đặt"
            className="inline-flex size-11 items-center justify-center rounded-full bg-primary/15 text-[15px] font-bold text-primary"
          >
            {initial}
          </Link>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 5: Run everything**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/constants.ts packages/shared/src/schemas.test.ts apps/web/src/routes/app/HomePage.tsx apps/web/src/routes/app/home apps/web/src/components/ui/LanguagePill.tsx apps/web/src/components/ui/expressive.test.tsx apps/web/src/components/layout/AppBar.tsx apps/web/src/components/layout/shell.test.tsx
git commit -m "feat(home): show the current learning path, switch languages and enable Korean"
```

---

### Task 6: Settings — "Lộ trình học" section

**Prerequisite:** Task 3 merged.

**Files:**
- Create: `apps/web/src/routes/app/settings/LearningPathsSection.tsx`, `PathPlanEditor.tsx`, test `learning-paths-section.test.tsx`
- Modify: `apps/web/src/routes/app/SettingsPage.tsx` (render the section after the profile section)

- [ ] **Step 1: Write failing test** — `apps/web/src/routes/app/settings/learning-paths-section.test.tsx`

```tsx
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { REFERENCE, TEST_PATH } from '../../../../tests/unit/learning-fixtures';
import { renderWithProviders } from '../../../../tests/unit/render';
import { LearningPathsSection } from './LearningPathsSection';

const mocks = vi.hoisted(() => ({ setPathStatus: vi.fn(), updatePlan: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({}), requireSupabase: () => ({}) }));
vi.mock('@/features/learning-paths/useReferenceHours', () => ({
  useReferenceHours: () => ({ status: 'ready', data: REFERENCE, retry: vi.fn() }),
}));
vi.mock('@/features/learning-paths/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/learning-paths/service')>()),
  setPathStatus: mocks.setPathStatus,
  updatePlan: mocks.updatePlan,
}));

beforeEach(() => {
  mocks.setPathStatus.mockReset();
  mocks.updatePlan.mockReset();
});

describe('LearningPathsSection', () => {
  it('lists paths and links to add the missing language', () => {
    renderWithProviders(<LearningPathsSection />, { route: '/app/cai-dat' });
    const section = screen.getByRole('region', { name: 'Lộ trình học' });
    expect(within(section).getByText('Tiếng Anh · Giao tiếp đời sống')).toBeInTheDocument();
    expect(within(section).getByText('A2 → B1 · khoảng 43–69 tuần')).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: '+ Thêm Tiếng Hàn' })).toHaveAttribute('href', '/app/bat-dau?lang=ko');
  });

  it('pauses a path', async () => {
    const upsertPath = vi.fn();
    mocks.setPathStatus.mockResolvedValue({ ...TEST_PATH, status: 'paused' });
    renderWithProviders(<LearningPathsSection />, { paths: { upsertPath } });
    await userEvent.click(screen.getByRole('button', { name: 'Tạm dừng' }));
    expect(mocks.setPathStatus).toHaveBeenCalledWith({}, 'path-en', 'paused');
    expect(upsertPath).toHaveBeenCalledWith({ ...TEST_PATH, status: 'paused' });
    expect(await screen.findByText('Đã tạm dừng lộ trình.')).toBeInTheDocument();
  });

  it('archives only after confirmation and reloads', async () => {
    const reload = vi.fn();
    mocks.setPathStatus.mockResolvedValue({ ...TEST_PATH, status: 'archived' });
    renderWithProviders(<LearningPathsSection />, { paths: { reload } });
    await userEvent.click(screen.getByRole('button', { name: 'Lưu trữ' }));
    expect(mocks.setPathStatus).not.toHaveBeenCalled();
    expect(screen.getByText(/Lịch sử học vẫn được giữ/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Xác nhận lưu trữ' }));
    expect(mocks.setPathStatus).toHaveBeenCalledWith({}, 'path-en', 'archived');
    expect(reload).toHaveBeenCalled();
  });

  it('edits the plan with a live estimate', async () => {
    const upsertPath = vi.fn();
    mocks.updatePlan.mockResolvedValue({ ...TEST_PATH, targetLevel: 'b2' });
    renderWithProviders(<LearningPathsSection />, { paths: { upsertPath } });
    await userEvent.click(screen.getByRole('button', { name: 'Sửa kế hoạch' }));
    await userEvent.selectOptions(screen.getByLabelText('Bậc mục tiêu'), 'b2');
    await userEvent.click(screen.getByRole('radio', { name: '45–60 phút mỗi ngày' }));
    expect(screen.getByText('Khoảng 44–72 tuần')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Lưu kế hoạch' }));
    expect(mocks.updatePlan).toHaveBeenCalledWith({}, 'path-en', {
      goalType: 'daily_communication',
      targetLevel: 'b2',
      weeklyMinutes: [60, 60, 60, 60, 60, 60, 60],
      targetDate: null,
    });
    expect(upsertPath).toHaveBeenCalledWith({ ...TEST_PATH, targetLevel: 'b2' });
  });

  it('rejects a past target date', async () => {
    renderWithProviders(<LearningPathsSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Sửa kế hoạch' }));
    const date = screen.getByLabelText('Ngày mục tiêu (không bắt buộc)');
    fireEvent.change(date, { target: { value: '2000-01-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'Lưu kế hoạch' }));
    expect(screen.getAllByText('Ngày mục tiêu đã qua.').length).toBeGreaterThan(0);
    expect(mocks.updatePlan).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @linguo/web test -- learning-paths-section`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`apps/web/src/routes/app/settings/PathPlanEditor.tsx`:
```tsx
import { useMemo, useState, type FormEvent } from 'react';
import {
  allowedTargets,
  defaultTarget,
  DEFAULT_TIMEZONE,
  estimatePath,
  fieldErrors,
  GOAL_LABELS,
  GOALS_BY_LANGUAGE,
  LEVEL_INFO,
  updatePlanSchema,
  type GoalType,
} from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input, inputClasses } from '@/components/ui/Input';
import { EstimateSummary } from '@/features/learning-paths/components/EstimateSummary';
import { ScheduleEditor, type ScheduleValue } from '@/features/learning-paths/components/ScheduleEditor';
import { presetFromWeek } from '@/features/learning-paths/components/schedule';
import { learningPathErrorMessage } from '@/features/learning-paths/error-map';
import { updatePlan, type LearningPath } from '@/features/learning-paths/service';
import { useReferenceHours } from '@/features/learning-paths/useReferenceHours';
import { useProfile } from '@/features/profile/ProfileProvider';
import { cn } from '@/lib/cn';
import { todayIso } from '@/lib/dates';
import { requireSupabase } from '@/lib/supabase';

interface Props {
  path: LearningPath;
  onSaved: (path: LearningPath) => void;
  onCancel: () => void;
}

export function PathPlanEditor({ path, onSaved, onCancel }: Props) {
  const { profile } = useProfile();
  const today = todayIso(profile?.timezone ?? DEFAULT_TIMEZONE);
  const reference = useReferenceHours();
  const [goalType, setGoalType] = useState<GoalType>(path.goalType);
  const [targetLevel, setTargetLevel] = useState(path.targetLevel);
  const [schedule, setSchedule] = useState<ScheduleValue>({ preset: presetFromWeek(path.weeklyMinutes), weeklyMinutes: path.weeklyMinutes });
  const [targetDate, setTargetDate] = useState(path.targetDate ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targets = allowedTargets(path.language, goalType, path.currentLevel);
  const dateError = targetDate && targetDate < today ? 'Ngày mục tiêu đã qua.' : undefined;
  const parsed = updatePlanSchema.safeParse({
    language: path.language,
    goalType,
    currentLevel: path.currentLevel,
    targetLevel,
    weeklyMinutes: schedule.weeklyMinutes,
    targetDate: targetDate || null,
  });

  const estimate = useMemo(() => {
    if (!parsed.success || dateError || !reference.data) return null;
    try {
      return estimatePath({ ...parsed.data, today }, reference.data[path.language]);
    } catch {
      return null;
    }
  }, [parsed, dateError, reference.data, today, path.language]);

  const idBase = `plan-${path.id}`;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (dateError) {
      setError(dateError);
      return;
    }
    if (!parsed.success) {
      setError(Object.values(fieldErrors(parsed.error))[0] ?? 'Thông tin chưa hợp lệ.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { goalType: g, targetLevel: t, weeklyMinutes, targetDate: d } = parsed.data;
      onSaved(await updatePlan(requireSupabase(), path.id, { goalType: g, targetLevel: t, weeklyMinutes, targetDate: d }));
    } catch (err) {
      setError(learningPathErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form noValidate onSubmit={save} className="space-y-4 border-t border-border pt-4">
      <FormField label="Mục tiêu">
        {({ invalid, ...a11y }) => (
          <select
            {...a11y}
            aria-invalid={invalid || undefined}
            value={goalType}
            onChange={(e) => {
              const g = e.target.value as GoalType;
              setGoalType(g);
              setTargetLevel(defaultTarget(path.language, g, path.currentLevel) ?? '');
            }}
            className={cn(inputClasses(invalid), 'appearance-none')}
          >
            {GOALS_BY_LANGUAGE[path.language].map((g) => (
              <option key={g} value={g}>
                {GOAL_LABELS[g]}
              </option>
            ))}
          </select>
        )}
      </FormField>
      <FormField label="Bậc mục tiêu" error={targets.length === 0 ? 'Bạn đã đạt mục tiêu này. Hãy chọn mục tiêu khác.' : undefined}>
        {({ invalid, ...a11y }) => (
          <select
            {...a11y}
            aria-invalid={invalid || undefined}
            value={targetLevel}
            onChange={(e) => setTargetLevel(e.target.value)}
            className={cn(inputClasses(invalid), 'appearance-none')}
          >
            {targets.map((code) => (
              <option key={code} value={code}>
                {LEVEL_INFO[code].label}
              </option>
            ))}
          </select>
        )}
      </FormField>
      <div className="space-y-2">
        <h4 id={`${idBase}-schedule`} className="px-1 text-sm font-medium">
          Thời gian học
        </h4>
        <ScheduleEditor value={schedule} onChange={setSchedule} labelledBy={`${idBase}-schedule`} />
      </div>
      <FormField label="Ngày mục tiêu (không bắt buộc)" error={dateError}>
        {({ invalid, ...a11y }) => (
          <Input {...a11y} invalid={invalid} type="date" min={today} value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        )}
      </FormField>
      {estimate && <EstimateSummary estimate={estimate} />}
      {error && (
        <p role="alert" className="px-1 text-sm text-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={saving}>
          Lưu kế hoạch
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Huỷ
        </Button>
      </div>
    </form>
  );
}
```

`apps/web/src/routes/app/settings/LearningPathsSection.tsx`:
```tsx
import { useState } from 'react';
import { Link } from 'react-router';
import { GOAL_LABELS, LANGUAGE_CODES, LANGUAGES, LEVEL_INFO, type LevelCode, type PathStatus } from '@linguo/shared';
import { Button, buttonClasses } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { SolidCard } from '@/components/ui/SolidCard';
import { useToast } from '@/components/ui/Toast';
import { learningPathErrorMessage } from '@/features/learning-paths/error-map';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { setPathStatus, type LearningPath } from '@/features/learning-paths/service';
import { requireSupabase } from '@/lib/supabase';
import { PathPlanEditor } from './PathPlanEditor';

const STATUS_DONE: Partial<Record<PathStatus, string>> = {
  paused: 'Đã tạm dừng lộ trình.',
  active: 'Đã tiếp tục lộ trình.',
  archived: 'Đã lưu trữ lộ trình. Lịch sử học vẫn được giữ.',
};

function PathItem({ path }: { path: LearningPath }) {
  const { upsertPath, reload } = useLearningPaths();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [busy, setBusy] = useState<PathStatus | null>(null);
  const from = LEVEL_INFO[path.currentLevel as LevelCode].label;
  const to = LEVEL_INFO[path.targetLevel as LevelCode].label;

  async function changeStatus(status: PathStatus) {
    setBusy(status);
    try {
      const updated = await setPathStatus(requireSupabase(), path.id, status);
      upsertPath(updated);
      if (status === 'archived') reload();
      const done = STATUS_DONE[status];
      if (done) toast.show({ tone: 'success', message: done });
    } catch (error) {
      toast.show({ tone: 'error', message: learningPathErrorMessage(error) });
    } finally {
      setBusy(null);
      setConfirmArchive(false);
    }
  }

  return (
    <li className="space-y-3 rounded-2xl border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            {LANGUAGES[path.language].nameVi} · {GOAL_LABELS[path.goalType]}
          </p>
          <p className="text-sm text-muted">
            {from} → {to} · khoảng {path.estimate.weeksMin}–{path.estimate.weeksMax} tuần
          </p>
        </div>
        {path.status === 'paused' && <span className="shrink-0 rounded-full bg-warn/15 px-3 py-1 text-xs font-semibold">Tạm dừng</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
          Sửa kế hoạch
        </Button>
        {path.status === 'active' && (
          <Button variant="ghost" loading={busy === 'paused'} onClick={() => void changeStatus('paused')}>
            Tạm dừng
          </Button>
        )}
        {path.status === 'paused' && (
          <Button variant="ghost" loading={busy === 'active'} onClick={() => void changeStatus('active')}>
            Tiếp tục
          </Button>
        )}
        {!confirmArchive && (
          <Button variant="danger" onClick={() => setConfirmArchive(true)}>
            Lưu trữ
          </Button>
        )}
      </div>
      {confirmArchive && (
        <div role="group" aria-label="Xác nhận lưu trữ" className="space-y-3 rounded-2xl bg-error/5 p-3">
          <p className="text-[15px]">
            Lưu trữ lộ trình này? Lịch sử học vẫn được giữ và bạn có thể tạo lộ trình mới cho ngôn ngữ này.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" loading={busy === 'archived'} onClick={() => void changeStatus('archived')}>
              Xác nhận lưu trữ
            </Button>
            <Button variant="ghost" onClick={() => setConfirmArchive(false)}>
              Huỷ
            </Button>
          </div>
        </div>
      )}
      {editing && (
        <PathPlanEditor
          path={path}
          onCancel={() => setEditing(false)}
          onSaved={(updated) => {
            upsertPath(updated);
            setEditing(false);
            toast.show({ tone: 'success', message: 'Đã lưu kế hoạch. Ước lượng đã được tính lại.' });
          }}
        />
      )}
    </li>
  );
}

export function LearningPathsSection() {
  const { status, paths, reload } = useLearningPaths();
  const missing = LANGUAGE_CODES.filter((code) => LANGUAGES[code].available && !paths.some((p) => p.language === code));
  return (
    <section id="lo-trinh" aria-labelledby="paths-heading">
      <SolidCard className="space-y-4">
        <h2 id="paths-heading" className="text-lg font-bold">
          Lộ trình học
        </h2>
        {status === 'loading' && <Skeleton className="block h-24 w-full rounded-2xl" />}
        {status === 'error' && <ErrorState title="Không tải được lộ trình" onRetry={reload} />}
        {status === 'ready' && paths.length === 0 && <p className="text-[15px] text-muted">Bạn chưa có lộ trình nào.</p>}
        {status === 'ready' && paths.length > 0 && (
          <ul className="space-y-3">
            {paths.map((path) => (
              <PathItem key={path.id} path={path} />
            ))}
          </ul>
        )}
        {status === 'ready' &&
          missing.map((code) => (
            <Link key={code} to={`/app/bat-dau?lang=${code}`} className={buttonClasses('ghost')}>
              + Thêm {LANGUAGES[code].nameVi}
            </Link>
          ))}
      </SolidCard>
    </section>
  );
}
```
Note: Korean becomes `available` in Task 5; until both merge, the "+ Thêm Tiếng Hàn" link test relies on Task 5's constant. If Task 6 is verified before Task 5 lands, temporarily assert only the section heading and path text, and restore the link assertion once Task 5 is merged (the controller re-runs the suite after the wave).

`apps/web/src/routes/app/SettingsPage.tsx`: add `import { LearningPathsSection } from './settings/LearningPathsSection';` and render `<LearningPathsSection />` directly after the closing `</section>` of the profile section (`aria-labelledby="profile-heading"`).

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `pnpm --filter @linguo/web test && pnpm typecheck && pnpm lint`
Expected: PASS (existing settings tests still pass — the section renders the default TEST_PATH and does not call the service until clicked).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/app/settings apps/web/src/routes/app/SettingsPage.tsx
git commit -m "feat(settings): manage learning paths: edit plan, pause, resume, archive"
```

---

## Wave 4

### Task 7: E2E coverage, final verification

**Prerequisite:** Tasks 1–6 merged.

**Files:**
- Modify: `apps/web/tests/e2e/fixtures.ts` (stateful Supabase mock for paths, reference hours, RPCs)
- Create: `apps/web/tests/e2e/onboarding.spec.ts`

- [ ] **Step 1: Extend the Supabase mock** — in `apps/web/tests/e2e/fixtures.ts`, replace `mockSupabase` (keep `SUPABASE_URL`, `USER_ID`, `signIn`, `fakeJwt`, `expectNoHorizontalScroll` as they are) with:

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

interface FixtureLevel {
  levelCode: string;
  ordinal: number;
  cumulativeHours: number;
}
const ESTIMATE_FIXTURES = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../../packages/shared/src/learning/estimate.fixtures.json', import.meta.url)), 'utf8'),
) as { referenceHours: Record<string, FixtureLevel[]> };

const REFERENCE_ROWS = Object.entries(ESTIMATE_FIXTURES.referenceHours).flatMap(([language, levels]) =>
  levels.map((l) => ({ language_code: language, level_code: l.levelCode, ordinal: l.ordinal, cumulative_hours: l.cumulativeHours, reviewed: false })),
);

const ESTIMATE = {
  hours_needed: 185,
  weeks_min: 43,
  weeks_mid: 53,
  weeks_max: 69,
  feasibility: 'no_deadline',
  suggested_minutes_per_day: null,
  suggested_date: null,
  assumptions: { weekly_minutes: 210, hours_needed: 185, reference_reviewed: false, multiplier_range: [0.8, 1.3] },
};

export function pathRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'path-en',
    user_id: USER_ID,
    language_code: 'en',
    start_point: 'some',
    goal_type: 'daily_communication',
    current_level: 'a2',
    target_level: 'b1',
    weekly_minutes: [30, 30, 30, 30, 30, 30, 30],
    target_date: null,
    status: 'active',
    estimate: ESTIMATE,
    created_at: '2026-10-13T01:00:00Z',
    updated_at: '2026-10-13T01:00:00Z',
    ...overrides,
  };
}

interface MockOptions {
  displayName?: string;
  /** Learning path rows; defaults to one English path so existing app tests keep their home screen. */
  paths?: Array<Record<string, unknown>>;
}

/** Answer every Supabase request so tests never touch a real backend. Paths and the current id are stateful. */
export async function mockSupabase(page: Page, opts: MockOptions = {}) {
  const paths = (opts.paths ?? [pathRow()]).map((p) => ({ ...p }));
  let currentId = (paths[0]?.id as string | undefined) ?? null;

  await page.route(`${SUPABASE_URL}/**`, async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const body = () => (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    switch (url.pathname) {
      case '/rest/v1/profiles':
        if (method === 'GET') {
          return route.fulfill({
            json: { id: USER_ID, display_name: opts.displayName ?? 'Minh Anh', timezone: 'Asia/Ho_Chi_Minh', current_learning_path_id: currentId },
          });
        }
        return route.fulfill({ json: [{ id: USER_ID }] });
      case '/rest/v1/user_preferences':
        if (method === 'GET') return route.fulfill({ json: { theme: 'system', reduce_motion: false } });
        return route.fulfill({ json: [{ user_id: USER_ID }] });
      case '/rest/v1/learning_paths':
        return route.fulfill({ json: paths.filter((p) => p.status !== 'archived') });
      case '/rest/v1/level_reference_hours':
        return route.fulfill({ json: REFERENCE_ROWS });
      case '/rest/v1/rpc/create_learning_path': {
        const b = body();
        const row = pathRow({
          id: `path-${String(b.p_language)}`,
          language_code: b.p_language,
          start_point: b.p_start_point,
          goal_type: b.p_goal_type,
          current_level: b.p_current_level,
          target_level: b.p_target_level,
          weekly_minutes: b.p_weekly_minutes,
          target_date: b.p_target_date ?? null,
          created_at: new Date().toISOString(),
        });
        paths.push(row);
        currentId = row.id as string;
        return route.fulfill({ json: row });
      }
      case '/rest/v1/rpc/set_current_learning_path':
        currentId = String(body().p_id);
        return route.fulfill({ status: 204, body: '' });
      case '/rest/v1/rpc/set_learning_path_status': {
        const b = body();
        const row = paths.find((p) => p.id === b.p_id);
        if (!row) return route.fulfill({ status: 400, json: { code: 'P0001', message: 'path_not_found' } });
        row.status = b.p_status;
        return route.fulfill({ json: row });
      }
      case '/rest/v1/rpc/update_learning_path_plan': {
        const b = body();
        const row = paths.find((p) => p.id === b.p_id);
        if (!row) return route.fulfill({ status: 400, json: { code: 'P0001', message: 'path_not_found' } });
        Object.assign(row, { goal_type: b.p_goal_type, target_level: b.p_target_level, weekly_minutes: b.p_weekly_minutes, target_date: b.p_target_date ?? null });
        return route.fulfill({ json: row });
      }
    }
    if (url.pathname.startsWith('/auth/v1/logout')) return route.fulfill({ status: 204, body: '' });
    return route.fulfill({ status: 404, json: { message: `not mocked: ${method} ${url.pathname}` } });
  });
}
```
(Profile/preferences PATCH now answer with one row because the services `.select()` after updating and treat `[]` as a failure.)

- [ ] **Step 2: Onboarding spec** — `apps/web/tests/e2e/onboarding.spec.ts`

```ts
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { expectNoHorizontalScroll, mockSupabase, pathRow, signIn } from './fixtures';

const SHOT_PROJECTS = ['iphone-se', 'pixel-7', 'iphone-15-pro-landscape'];

async function atStep(page: Page, title: string, testInfo: TestInfo, shot: string) {
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expectNoHorizontalScroll(page);
  if (SHOT_PROJECTS.includes(testInfo.project.name)) {
    await testInfo.attach(`onboarding-${shot}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  }
}

async function next(page: Page) {
  const button = page.getByRole('button', { name: 'Tiếp tục' });
  await expect(button).toBeEnabled();
  const box = await button.boundingBox();
  const viewport = page.viewportSize();
  expect(box && viewport && box.y + box.height <= viewport.height, 'Continue must sit inside the viewport').toBeTruthy();
  await button.click();
}

test('a new user creates an English path through the wizard', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockSupabase(page, { paths: [] });
  await signIn(page);
  await page.goto('/app');
  await expect(page).toHaveURL(/\/app\/bat-dau$/);

  await atStep(page, 'Bạn muốn học ngôn ngữ nào?', testInfo, '1-language');
  await page.getByRole('radio', { name: /Tiếng Anh/ }).check();
  await next(page);

  await atStep(page, 'Bạn đang ở đâu?', testInfo, '2-start');
  await page.getByRole('radio', { name: 'Tôi đã học một ít' }).check();
  await next(page);

  await atStep(page, 'Trình độ hiện tại của bạn', testInfo, '3-level');
  await page.getByRole('radio', { name: /^A2/ }).check();
  await next(page);

  await atStep(page, 'Mục tiêu của bạn', testInfo, '4-goal');
  await page.getByRole('radio', { name: 'Giao tiếp đời sống' }).check();
  await expect(page.getByRole('radio', { name: /^B1/ })).toBeChecked();
  await next(page);

  await atStep(page, 'Bạn học được bao lâu?', testInfo, '5-schedule');
  const fontSizes = await page.locator('input').evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
  for (const size of fontSizes) expect(size).toBeGreaterThanOrEqual(16);
  await next(page);

  await atStep(page, 'Xem lại lộ trình', testInfo, '6-review');
  await expect(page.getByText('Khoảng 43–69 tuần')).toBeVisible();
  await page.getByRole('button', { name: 'Tạo lộ trình' }).click();

  await expect(page.getByRole('heading', { name: 'Lộ trình đã sẵn sàng!' })).toBeVisible();
  await page.getByRole('button', { name: 'Vào trang chủ' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText('Lộ trình của bạn')).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('adding Korean from the language pill preselects it and switching works', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockSupabase(page);
  await signIn(page);
  await page.goto('/app');
  await page.getByRole('button', { name: /Ngôn ngữ đang học/ }).click();
  await page.getByRole('button', { name: '+ Thêm Tiếng Hàn' }).click();
  await expect(page).toHaveURL(/\/app\/bat-dau\?lang=ko$/);
  await expect(page.getByRole('radio', { name: /Tiếng Hàn/ })).toBeChecked();
});

test('switching between two paths updates the pill', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockSupabase(page, {
    paths: [pathRow(), pathRow({ id: 'path-ko', language_code: 'ko', goal_type: 'hangul_basics', current_level: 'hangul', target_level: 'topik1' })],
  });
  await signIn(page);
  await page.goto('/app');
  await page.getByRole('button', { name: /^EN – Ngôn ngữ đang học/ }).click();
  await page.getByRole('button', { name: /Tiếng Hàn/ }).click();
  await expect(page.getByRole('button', { name: /^KO – Ngôn ngữ đang học/ })).toBeVisible();
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`wizard has no serious a11y violations (${colorScheme})`, async ({ page }, testInfo) => {
    test.skip(!['iphone-15-pro', 'pixel-7'].includes(testInfo.project.name), 'a11y runs on two devices');
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme });
    await mockSupabase(page, { paths: [] });
    await signIn(page);
    await page.goto('/app/bat-dau');
    await expect(page.getByRole('heading', { level: 1, name: 'Bạn muốn học ngôn ngữ nào?' })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })), null, 2)).toEqual([]);
  });
}
```

- [ ] **Step 3: Run the whole E2E suite**

Run: `pnpm e2e`
Expected: all pass (existing specs keep working because the mock defaults to one EN path). Fix root causes in components, never weaken assertions. Review the `onboarding-*` screenshot attachments (`pnpm --filter @linguo/web exec playwright show-report`, or open the PNGs with the Read tool): no clipped Vietnamese/Korean text, the Continue bar above the home indicator, cards readable at 320 px.

- [ ] **Step 4: Final verification (all gates)**

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test
node scripts/sync-estimate-fixtures.mjs --check
pnpm exec supabase status || pnpm db:start
pnpm db:reset && pnpm db:test && pnpm db:lint
pnpm db:types && git status --porcelain -- packages/shared/src/database.types.ts
MSYS_NO_PATHCONV=1 VITE_BASE_PATH=/Linguo/ pnpm build
pnpm db:stop
```
Expected: every command exits 0; `git status --porcelain` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/tests/e2e/fixtures.ts apps/web/tests/e2e/onboarding.spec.ts
git commit -m "test(e2e): cover onboarding wizard, language switching and wizard accessibility"
```

---

## Spec coverage check (self-review)

| Spec section | Task |
|---|---|
| §3 data model, seed, RLS, grants | 2 |
| §4 RPCs + error codes | 2 (codes mapped in 3) |
| §5 estimate algorithm, shared fixtures, SQL parity | 1, 2 |
| §6.1 entry points (redirect, Home button, pill "+ Thêm") | 5 (redirect, pill), 4 (`?lang`) |
| §6.2 wizard, draft, focus, celebration | 4 |
| §6.3 Home card, pill switching, spread warning, Settings | 5, 6 |
| §7 code structure | 1–6 (providers mounted in `AppRoute`, see Ground rules) |
| §8 error handling | 3 (error map, provider errors), 4 (create errors, corrupt draft, reference errors), 5 (no redirect on error) |
| §9 tests | 1, 2, 3, 4, 5, 6, 7 |
| §10 acceptance | 7 (E2E + final verification) |
