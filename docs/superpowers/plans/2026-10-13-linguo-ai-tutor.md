# Linguo Spec 5 — AI Tutor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Spec:** [2026-10-13-linguo-ai-tutor-design.md](../specs/2026-10-13-linguo-ai-tutor-design.md) · **Contract (Wave 0, committed):** `packages/shared/src/ai/contract.ts`.

## Internal interfaces (Edge Function)

```ts
// supabase/functions/ai-tutor/lib/gemini.ts (E3)
export type GeminiErrorKind = 'timeout' | 'rate_limited' | 'daily_quota' | 'unavailable' | 'bad_request' | 'schema_rejected' | 'blocked' | 'network';
export class GeminiError extends Error { kind: GeminiErrorKind; status: number | null; attempts: number }
export interface GeminiDeps { fetch: typeof fetch; now: () => number; random: () => number; sleep: (ms: number) => Promise<void> }
export interface GeminiCall { apiKey: string; model: string; system: string; user: string; responseSchema: Record<string, unknown> | null;
  maxOutputTokens: number; temperature: number; timeoutMs: number; deadlineMs: number }
export function callGemini(call: GeminiCall, deps: GeminiDeps): Promise<{ text: string; attempts: number; usedSchema: boolean }>;
// supabase/functions/ai-tutor/lib/breaker.ts (E3)
export function createBreaker(o: { failureThreshold: number; windowMs: number; openMs: number; now: () => number }): {
  canRequest(): boolean; retryAfterSec(): number; onSuccess(): void; onFailure(kind: GeminiErrorKind): void; state(): 'closed' | 'open' | 'half_open' };

// supabase/functions/ai-tutor/lib/prompts/index.ts (E4)
export interface PromptModule { task: AiTask; version: string; system: string; temperature: number; maxOutputTokens: number;
  responseSchema: Record<string, unknown>; buildUser(req: AiRequest, ctx: { lessonContext: string | null }): string;
  cacheable(req: AiRequest): boolean; validate(data: unknown): { ok: true; data: unknown } | { ok: false; error: string } }
export const PROMPTS: Record<AiTask, PromptModule>;
// lib/text.ts (E4)
export function wrapData(tag: 'learner_input' | 'lesson_context', text: string): string;
export function redactPii(text: string): string;
export function extractJson(text: string): unknown;           // strips ``` fences; throws on failure
export function repairPrompt(schema: Record<string, unknown>, badText: string): string;
export function sanitizeOutput<T>(value: T, opts: { language: 'en' | 'ko' }): T; // strip tags/control chars, cap lengths

// supabase/functions/ai-tutor/handler.ts (E5)
export interface HandlerDeps extends GeminiDeps { env: (k: string) => string | undefined; supabase: (authHeader: string) => SupabaseLike; breaker: ReturnType<typeof createBreaker> }
export function handle(req: Request, deps: HandlerDeps): Promise<Response>;
```

## Wave 1 (parallel; common rules as in previous specs: own worktree, `git reset --hard main`, TDD, only owned files, NO Co-Authored-By/AI mentions; throwaway Docker containers only, never other sessions' stacks)

- **E1 — DB:** `supabase/migrations/20261014000500_ai_gateway.sql`, `supabase/tests/ai_gateway.test.sql` (spec §4).
- **E2 — contract sync + Deno setup + CI:** `scripts/sync-ai-contract.mjs` (+ test, `--check`), generated `supabase/functions/_shared/ai-contract.ts`, `supabase/functions/deno.json` (imports `zod` → `npm:zod@4.6.7`, `@supabase/supabase-js` → `npm:@supabase/supabase-js@2`), `.github/workflows/ci.yml` job `functions` (setup-deno pinned, `deno check`/`deno lint`/`deno test` over `supabase/functions`, plus `node scripts/sync-ai-contract.mjs --check`), root scripts, `scripts/check-public-env.mjs` (block `GEMINI` in VITE_* — verify).
- **E3 — Gemini client + breaker:** `supabase/functions/ai-tutor/lib/{gemini.ts,breaker.ts}` + `*_test.ts`.
- **E4 — prompts + text utils:** `supabase/functions/ai-tutor/lib/{prompts/*.ts,text.ts}` + tests.
- **E5 — handler + wiring:** `supabase/functions/ai-tutor/{index.ts,handler.ts,handler_test.ts,lib/cache-key.ts}`, `supabase/config.toml` `[functions.ai-tutor] verify_jwt = true`, `.github/workflows/deploy.yml` (before functions deploy: `supabase secrets set` for GEMINI_API_KEY/GEMINI_MODEL/optional limits from GitHub environment secrets when present), `docs/SETUP.md`/`docs/DEPLOY.md` sections, `supabase/functions/.env.example`.
- **E6 — web data + MarkdownLite:** `apps/web/src/features/ai-tutor/**`, `apps/web/src/components/ai/MarkdownLite.tsx` (+ tests), hand-added types in `database.types.ts`.
- **E7 — AI UI:** `apps/web/src/components/ai/{AiExplainSheet,AiNoticeDialog,AiReportDialog,AiQuotaChip}.tsx`, `apps/web/src/routes/app/tutor/**`, router `gia-su` → `TutorPage`.
- **E8 — integration + E2E:** lesson `FeedbackPanel`/exercise frame "Vì sao?"/"Giải thích AI", review card back "Giải thích AI", Settings privacy section for AI, `apps/web/tests/e2e/fixtures.ts` mock of `**/functions/v1/ai-tutor`, `apps/web/tests/e2e/ai.spec.ts`.

## Wave 2

Merge, regenerate contract copy + types (throwaway container `--db-url ...?sslmode=disable`), full checks incl. `deno test`, e2e (unique PLAYWRIGHT_PORT), push, auto-approve deploy (user-authorised).
