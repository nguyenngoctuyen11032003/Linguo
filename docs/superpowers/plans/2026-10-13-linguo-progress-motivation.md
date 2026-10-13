# Linguo Spec 8 — Progress, Motivation & Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Spec:** [2026-10-13-linguo-progress-motivation-design.md](../specs/2026-10-13-linguo-progress-motivation-design.md) · **Contract (Wave 0, committed):** `packages/shared/src/progress/contract.ts`.

## Internal interfaces (web)

```ts
// apps/web/src/features/progress/service.ts (G2)
export function getProgressDashboard(client: AppSupabaseClient, pathId: string, range: ProgressRange): Promise<ProgressDashboard>;
export function getMotivationPrefs(client: AppSupabaseClient, userId: string): Promise<MotivationPrefs>;
export function updateMotivationPrefs(client: AppSupabaseClient, userId: string, patch: Partial<MotivationPrefs>): Promise<MotivationPrefs>;
// apps/web/src/features/progress/useProgressDashboard.ts (G2)
export function useProgressDashboard(pathId: string | null, range: ProgressRange): {
  status: 'idle' | 'loading' | 'ready' | 'error'; data: ProgressDashboard | null; error: string | null; reload(): void };
// apps/web/src/features/progress/useMotivationPrefs.ts (G2)
export function useMotivationPrefs(): { status: 'loading' | 'ready' | 'error'; prefs: MotivationPrefs | null;
  update(patch: Partial<MotivationPrefs>): Promise<void>; saving: boolean; error: string | null };
// apps/web/src/features/progress/progress-fixtures.ts (G2): exports `dashboardFixture(overrides?)`, `emptyDashboardFixture()`
// apps/web/src/features/analytics/index.ts (G2)
export function track(name: AnalyticsEventName, props?: Record<string, string | number | boolean>): void;
export function configureAnalytics(o: { client: AppSupabaseClient | null; enabled: boolean }): void; // called by AnalyticsProvider
export function flushAnalytics(): Promise<void>;
export function AnalyticsProvider(props: { children: React.ReactNode }): JSX.Element; // reads auth + prefs, wires pagehide
export function RouteTracker(): null; // page_view with route pattern from useMatches()

// apps/web/src/routes/app/progress/* (G3) — presentational, props only, no data fetching
export function RangeToggle(p: { value: ProgressRange; onChange(r: ProgressRange): void }): JSX.Element;
export function ActivityChart(p: { days: ActivityDay[] }): JSX.Element;
export function TotalsGrid(p: { totals: ProgressDashboard['totals']; retention: { value: number | null; sample: number }; masteredTotal: number }): JSX.Element;
export function AccuracyList(p: { title: string; rows: Array<{ key: string; label: string; attempts: number; accuracy: number | null; prev_accuracy: number | null }>; rangeDays: ProgressRange }): JSX.Element;
export function EstimatesCard(p: { estimates: SkillEstimate[]; pathId: string }): JSX.Element;
export function MistakesList(p: { mistakes: Mistake[] }): JSX.Element;
export function MotivationPanel(p: { motivation: Motivation }): JSX.Element; // includes BadgeGrid
export function HowCalculated(): JSX.Element;
export function MotivationStrip(p: { motivation: Motivation }): JSX.Element; // compact, for HomePage
```

## Common rules (all tasks)

Own worktree, start with `git reset --hard main`, TDD, touch only owned files, commits with NO Co-Authored-By / AI mentions, never commit `.env`. DB tests only in a throwaway Docker container / your own `supabase start` with a unique project id — never another session's stack. Unique `PLAYWRIGHT_PORT`. Do not push.

## Wave 1 (parallel)

- **G1 — DB:** `supabase/migrations/20261015000100_progress.sql`, `supabase/migrations/20261015000110_analytics.sql`, `supabase/tests/progress.test.sql`, `supabase/tests/analytics.test.sql`; hand-add the new tables/columns/RPCs to `packages/shared/src/database.types.ts` (exact generator style). Spec §2–3. Run `supabase db lint --fail-on error` + `supabase test db`.
- **G2 — web data + analytics:** `apps/web/src/features/progress/**`, `apps/web/src/features/analytics/**` (+ tests), unit fakes as needed in `apps/web/tests/unit/**` (additive only). Do not edit routes/components/layout.
- **G3 — progress UI components:** `apps/web/src/routes/app/progress/**` presentational components above (+ tests, using a local copy of fixture data built from the contract schemas — do not import G2 files). Hand-drawn SVG chart with a visually hidden `<table>`; Vietnamese copy; deltas expressed in text + icon; dark/light tokens; mobile 360px without horizontal scroll. No `ProgressPage` yet.

## Wave 2

- **G4 — integration + E2E (after G1–G3 merged):** `ProgressPage` (fetch via `useProgressDashboard` + `useReviewSummary`, `?khoang=` range, all states, badge toast once, `track('progress_viewed')`), router `tien-do` → `ProgressPage`, `AnalyticsProvider`/`RouteTracker` mounted in `AppLayout`/`App`, `MotivationStrip` appended at the END of `HomePage` (another session is adding a card at the top — keep the diff minimal), Settings section `MotivationSection` (new file + one line in `SettingsPage`), `track()` calls at the spec §4 points, `apps/web/tests/e2e/fixtures.ts` mocks (`get_progress_dashboard`, `track_events` default → `0`, `user_preferences` new columns), `apps/web/tests/e2e/progress.spec.ts`.
- **Wave 3 (orchestrator):** merge, regenerate types from a throwaway DB, full `pnpm lint typecheck test`, `db:test`, e2e; push only after linguo-4c reports its deploy is done; record migrations after the production db push.
