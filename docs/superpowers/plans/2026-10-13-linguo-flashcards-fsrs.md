# Linguo Spec 3 — Flashcards & FSRS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Server-scheduled FSRS-6 review of learned items with a capped daily queue, idempotent grading, mastery tracking and an offline-capable flashcard UI.

**Architecture:** FSRS math in plpgsql parity-tested against pinned `ts-fsrs` fixtures; cards created by `complete_lesson`; RPCs return JSON matching `packages/shared/src/review/rpc.ts`; web reuses the spec 2 outbox and `OutboxSyncProvider`.

**Tech Stack:** Postgres 17 / Supabase CLI 2.120.0 / pgTAP, `ts-fsrs` (devDependency, pinned exact), zod 4, React 18 + Tailwind v4 + motion, Vitest, Playwright.

**Spec:** [2026-10-13-linguo-flashcards-fsrs-design.md](../specs/2026-10-13-linguo-flashcards-fsrs-design.md)

---

## Wave 0 — contracts (committed by the controller)

- `packages/shared/src/review/rpc.ts` — enums, `reviewCardSchema`, `reviewQueueSchema`, `reviewGradeArgsSchema`, `reviewGradeResultSchema`, `postponeResultSchema`, `reviewSummarySchema`, `REVIEW_ERROR_CODES`.
- `apps/web/src/features/reviews/types.ts` — `GradeMeta`, `CardUiState`, `ReviewSessionApi`.

### Internal SQL contract (B3 implements, B4/B5 call)

```sql
-- All config read from public.srs_config inside. STABLE. Revoked from public/anon/authenticated.
public.srs_next(
  p_state text, p_step smallint, p_stability double precision, p_difficulty double precision,
  p_last_review_at timestamptz, p_rating smallint, p_now timestamptz, p_tz text
) returns jsonb
-- → {"state","step","stability","difficulty","scheduled_days","interval_minutes","due_at","lapse":bool}
-- scheduled_days ≥ 1 → due_at = start of local day (p_tz) of (p_now local date + scheduled_days);
-- learning/relearning steps → due_at = p_now + step minutes (not snapped).
public.srs_retrievability(p_stability double precision, p_elapsed_days double precision) returns double precision
public.srs_adjust_rating(p_rating smallint, p_confidence smallint, p_hint_count smallint) returns smallint
public.srs_previews(<same card args>, p_now timestamptz, p_tz text) returns jsonb
-- → {"again":{"interval_minutes","due_at"},"hard":…,"good":…,"easy":…}
```

### Fixture format (B1 produces, B3 consumes)

`packages/shared/src/review/fsrs.fixtures.json`:
```json
{ "ts_fsrs_version": "x.y.z", "params": { "weights": [21 numbers], "desired_retention": 0.9, "maximum_interval": 365,
  "learning_steps_minutes": [1,10], "relearning_steps_minutes": [10] },
  "cases": [ { "name": "...", "tz": "UTC", "start": "2026-01-01T09:00:00Z",
    "steps": [ { "at": "ISO", "rating": 3, "expected": { "state": "learning", "step": 1, "stability": 0.0, "difficulty": 0.0,
      "scheduled_days": 0, "interval_minutes": 10 } } ] } ] }
```
Fixtures use tz `UTC` so day snapping does not change ts-fsrs intervals; snapping is covered by hand-written pgTAP in B3.

## Wave 1 — 8 parallel tasks

Common: own worktree, `git reset --hard main` first, TDD, only touch owned files, conventional commits with NO Co-Authored-By/AI mentions. You cannot run `supabase start` unless a local stack is already running on ports 553xx (then you may run pgTAP inside `begin; … rollback;` via `docker exec supabase_db_linguo psql`); never `db reset` a shared stack. Report status, branch, SHAs, what is unverified.

- **B1 — fixtures:** owns `scripts/gen-fsrs-fixtures.mjs`, `scripts/sync-fsrs-fixtures.mjs` (+ `.test.mjs`), `packages/shared/src/review/fsrs.fixtures.json`, `supabase/tests/review_fsrs.test.sql` (generated: calls `public.srs_next` per step, comparing state/step/scheduled_days/interval_minutes exactly and stability/difficulty within 1e-6 using `ok(abs(...) < 1e-6)`), root `package.json` scripts `fixtures:fsrs` + devDependency `ts-fsrs` pinned exact, CI database-job `--check` step, add the node test to root `test`. ~40 cases covering new→learning→review, Easy from new, Again in review (lapse→relearning), long overdue, Hard/Good/Easy chains, max interval cap.
- **B2 — schema:** owns `supabase/migrations/20261014000300_reviews.sql`, `supabase/tests/reviews_schema.test.sql`. Tables, `srs_config` seed (weights = the pinned ts-fsrs FSRS-6 defaults — coordinate by reading B1's version choice from `ts-fsrs` docs: use FSRS-6 default `w` from ts-fsrs 5.x `default_w`), indexes, RLS select-own, no client writes, pgTAP RLS A/B + no-grant checks.
- **B3 — FSRS SQL:** owns `supabase/migrations/20261014000310_reviews_fsrs.sql`, `supabase/tests/reviews_fsrs_snap.test.sql`. Implement the internal contract above per FSRS-6 (match ts-fsrs `FSRS.next` with fuzz off, learning steps from config). Hand-written pgTAP for day snapping (Asia/Seoul vs America/Los_Angeles), adjust_rating, previews ordering (again ≤ hard ≤ good ≤ easy).
- **B4 — queue/postpone/summary:** owns `supabase/migrations/20261014000320_reviews_queue.sql`, `supabase/tests/reviews_queue.test.sql`. Per spec §4.
- **B5 — grade/enroll/mastery:** owns `supabase/migrations/20261014000330_reviews_grade.sql` (incl. `create or replace function public.complete_lesson` copied from `20261014000200_lesson_runs.sql` with the `srs_enroll_lesson` call added — keep everything else identical), `supabase/tests/reviews_grade.test.sql`.
- **B6 — web data:** owns `apps/web/src/features/reviews/**` (except `types.ts`), generalising `apps/web/src/features/lesson-player/outbox.ts`/`useOutboxSync.ts`/`OutboxSyncProvider.tsx` so a second outbox (prefix `linguo-review-outbox-v1:`, args schema `reviewGradeArgsSchema`, rpc `grade_review`) syncs through the same provider; lesson-player tests must stay green. Also hand-add the new tables/RPCs to `packages/shared/src/database.types.ts` in generator format (will be regenerated later).
- **B7 — components:** owns `apps/web/src/components/flashcard/**` per spec §6.
- **B8 — screens + E2E:** owns `apps/web/src/routes/app/review/**`, `apps/web/src/routes/app/home/ReviewDueCard.tsx` (+ test), edits `router.tsx` (`on-tap` → `ReviewPage`), `HomePage.tsx`, `apps/web/tests/e2e/fixtures.ts` (review RPC mocks), `apps/web/tests/e2e/review.spec.ts`. Mock B6/B7 modules in unit tests until merged; placeholders only if TS needs them, marked `// placeholder: replaced by Task B6/B7`.

## Wave 2 — integration

Merge B1→B2→B3→B4→B5→B6→B7→B8; regenerate `fsrs` pgTAP; real-DB run (db reset, test db, db lint, db types); full lint/typecheck/test/build/e2e (`PLAYWRIGHT_PORT` unique); final review; push.
