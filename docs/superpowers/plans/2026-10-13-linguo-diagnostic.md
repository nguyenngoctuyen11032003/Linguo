# Linguo Spec 4 — Diagnostic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Adaptive placement test with server-side scoring, honest per-skill report and opt-in level update.
**Spec:** [2026-10-13-linguo-diagnostic-design.md](../specs/2026-10-13-linguo-diagnostic-design.md)
**Contracts (Wave 0, committed):** `packages/shared/src/diagnostic/rpc.ts`.

## Engine contract (D1 implements in `packages/shared/src/diagnostic/engine.ts`; D3 mirrors in SQL)

```ts
export const GRID: number[];                 // -0.5..6.5 step 0.25
export interface ItemParams { b: number; options: number }
export interface Answer { b: number; options: number; correct: boolean }
export function posterior(prior: { mean: number; sd: number }, answers: Answer[]): number[]; // normalised weights on GRID
export function eap(weights: number[]): { mean: number; sd: number };
export function shouldStopSkill(skill: DiagnosticSkill, n: number, sd: number, bankLeft: number): boolean;
export function conservativeLevel(weights: number[]): number;                  // 0..6
export function levelRange(weights: number[]): { low: number; high: number };
export function confidenceFor(sd: number, n: number, rapidShare: number): DiagnosticConfidence;
export function suggestLevel(skills: Array<{ level: number; confidence: DiagnosticConfidence }>): number | null;
export function capLevel(current: number, suggested: number, firstApplied: boolean): number;
export function pickItem(candidates: Array<{ id: string; b: number }>, eapMean: number, r: number): string | null;
export function simulate(opts: { trueTheta: Record<DiagnosticSkill, number>; mode: DiagnosticMode; currentOrdinal: number; bank: BankItem[]; rng: () => number; responder?: 'model' | 'guess' | 'all_right' | 'all_wrong' }): SimResult;
```
SQL mirrors (internal, revoked from clients): `diag_posterior(p_mean float8, p_sd float8, p_b float8[], p_options int[], p_correct bool[]) returns float8[]`, `diag_eap(float8[]) returns jsonb {mean,sd}`, `diag_conservative_level(float8[]) returns int`, `diag_level_range(float8[]) returns jsonb {low,high}`, `diag_confidence(float8, int, float8) returns text`, `diag_suggest_level(int[], text[]) returns int`, `diag_cap_level(int, int, boolean) returns int`.

Fixtures `packages/shared/src/diagnostic/engine.fixtures.json` (D1 writes) → `scripts/sync-diagnostic-fixtures.mjs [--check]` (D3 writes) → `supabase/tests/diagnostic_engine.test.sql`; CI `--check` in the database job.

## Tasks (Wave 1, parallel)

Common: own worktree, `git reset --hard main` first, TDD, only owned files, conventional commits with NO Co-Authored-By/AI mentions. Shared local DB may be running (container `supabase_db_linguo`): validate only inside `begin; … rollback;` with `lock_timeout`, never `db reset`, never terminate others' backends.

- **D1 — engine (TS):** owns `packages/shared/src/diagnostic/{engine.ts,engine.test.ts,simulation.test.ts,engine.fixtures.json}`, export from `diagnostic/index.ts`. Simulation thresholds per spec §6.
- **D2 — schema:** owns `supabase/migrations/20261014000400_diagnostic.sql` (tables, RLS, grants, `assessments` seed rows for en/ko with config), `supabase/tests/diagnostic_schema.test.sql`.
- **D3 — engine (SQL) + parity:** owns `supabase/migrations/20261014000410_diagnostic_engine.sql`, `scripts/sync-diagnostic-fixtures.mjs` (+ test), `supabase/tests/diagnostic_engine.test.sql` (generated), CI step, root `package.json` script `fixtures:diagnostic`.
- **D4 — RPCs:** owns `supabase/migrations/20261014000420_diagnostic_rpc.sql` (diagnostic_status, start, answer, skip, finish, accept per spec §4), `supabase/tests/diagnostic_rpc.test.sql`.
- **D5 — item bank + import:** owns `content/diagnostic/**` (≥ 5 items per skill × level × language: 105 per language; original, demo/"thử nghiệm", `key_confidence: unreviewed`), `packages/shared/src/diagnostic/authoring.ts` (YAML + bundle zod), `scripts/content/*` and `scripts/content-import.mjs` extensions (load/check/build diagnostic files; check: key is an option id, unique stems, counts per skill×level ≥ 5, NFC, demo header), `supabase/migrations/20261014000430_diagnostic_import.sql` (`content_private.import_diagnostic_bundle`, `public.import_diagnostic_content_bundle` service_role only), regenerate `supabase/seed.sql`, tests.
- **D6 — web data:** owns `apps/web/src/features/diagnostic/**` (service, error map, `useDiagnosticRun`, `useDiagnosticStatus`, tests), hand-add types to `packages/shared/src/database.types.ts`.
- **D7 — test runner + report UI:** owns `apps/web/src/routes/app/diagnostic/**` (intro, item screen, skill progress, skip sheet, pause, report, accept flow) + tests; router entries `kiem-tra/:pathId` and `kiem-tra/:pathId/ket-qua` outside AppLayout.
- **D8 — entry points + E2E:** owns edits to onboarding (unsure/new celebration offers), `routes/app/home/DiagnosticCard.tsx`, settings path section "Làm lại bài kiểm tra", `apps/web/tests/e2e/fixtures.ts` (diagnostic mocks), `apps/web/tests/e2e/diagnostic.spec.ts`.

## Wave 2

Merge D1→D8, regenerate fixtures/seed, real-DB run (db reset, test db, db lint, db:types), full lint/typecheck/test/build/e2e (`PLAYWRIGHT_PORT` unique), final review, push.
