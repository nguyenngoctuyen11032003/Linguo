# Linguo Spec 9 — Exam Practice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Spec:** [2026-10-13-linguo-exam-practice-design.md](../specs/2026-10-13-linguo-exam-practice-design.md) · **Contract (Wave 0, committed):** `packages/shared/src/exam/contract.ts`.

## Shared rule: short_text normalisation (TS and SQL must agree)

`normalizeExamText(s)` = Unicode NFC → trim → collapse runs of whitespace to one space → strip trailing characters in `.?!,;:。、…` → lower-case (locale-independent). A short_text answer is correct when its normalised form equals the normalised form of any accepted answer. Fixtures: `packages/shared/src/exam/grading.fixtures.json` `[{ input, accepted: string[], correct: boolean }]` (≥ 30 cases incl. Hangul, NFD input, trailing punctuation, case, inner double spaces).

## Internal interfaces (web)

```ts
// apps/web/src/features/exam/service.ts (X3)
listExamForms(client, language: LanguageCode): Promise<ExamFormSummary[]>;
startExam(client, a: { pathId: string; formId: string; mode: ExamMode; section?: ExamSection | null; questionType?: string | null }): Promise<ExamAttempt>;
getExamAttempt(client, attemptId: string): Promise<{ kind: 'attempt'; attempt: ExamAttempt } | { kind: 'result'; result: ExamResult }>;
saveExamAnswer(client, a: { attemptId: string; questionId: string; answer: string | null; flagged: boolean; idempotencyKey: string }): Promise<z.infer<typeof examSaveResultSchema>>;
submitExam(client, attemptId: string): Promise<ExamResult>;
examHistory(client, pathId: string, limit?: number): Promise<ExamHistoryEntry[]>;
// hooks (X3)
useExamForms(language: LanguageCode | null): { status; forms: ExamFormSummary[]; error; reload };
useExamHistory(pathId: string | null, limit?: number): { status; entries: ExamHistoryEntry[]; error; reload };
useExamAttempt(attemptId: string): {
  status: 'loading' | 'running' | 'submitting' | 'finished' | 'error';
  attempt: ExamAttempt | null; result: ExamResult | null; error: string | null;
  remainingMs: number | null;            // from deadline_at vs server_now offset; null = untimed
  saveState: 'idle' | 'saving' | 'saved' | 'offline' | 'error';
  setAnswer(questionId: string, answer: string | null): void;   // debounced 800 ms
  toggleFlag(questionId: string): void;
  submit(): Promise<void>;               // flushes pending saves first; auto-called at 0 ms
};
// apps/web/src/features/exam/tts.ts (X3)
canSpeak(lang: 'en' | 'ko'): boolean; speak(text: string, lang: 'en' | 'ko', o?: { rate?: number }): Promise<void>; stopSpeaking(): void;

// apps/web/src/routes/app/exam/components/* (X4) — presentational, props only
ExamFormCard(p: { form: ExamFormSummary; warningVi: string | null; onStart(mode: ExamMode, section?: ExamSection): void; busy: boolean });
QuestionTypePicker(p: { form: ExamFormSummary; onPick(questionType: string): void });
ExamHistoryList(p: { entries: ExamHistoryEntry[]; compact?: boolean });   // reused as ExamHistoryCard on Tiến độ
ExamTimer(p: { remainingMs: number | null });
QuestionNavigator(p: { questions: ExamServedQuestion[]; currentId: string; onGo(id: string): void });
QuestionView(p: { question: ExamServedQuestion; language: 'en' | 'ko'; listenLimit: number | null; onAnswer(a: string | null): void; onToggleFlag(): void });
SubmitDialog(p: { open: boolean; unanswered: number; flagged: number; onConfirm(): void; onCancel(): void });
ResultSummary(p: { result: ExamResult });
QuestionTypeBreakdown(p: { result: ExamResult; onDrill(questionType: string): void });
ReviewList(p: { result: ExamResult });     // incl. essay rubric checklist + sample answer
```

## Common rules (all tasks)

Own worktree, start with `git reset --hard <base branch given in your prompt>`, TDD, touch only owned files, commits with NO Co-Authored-By / AI mentions, never commit `.env`. DB only in your own isolated Supabase stack (copy `supabase/` to a temp dir, unique `project_id`, ports in an unused 57xxx/58xxx range) — never another session's stack. Unique `PLAYWRIGHT_PORT`. Do not push.

## Wave 1 (parallel)

- **X1 — DB:** `supabase/migrations/20261015000200_exams.sql`, `supabase/tests/exams.test.sql`, hand-add types to `packages/shared/src/database.types.ts`. Spec §3 (+ the activity_days hook from Spec 8 — only if `public.activity_days` exists on the base branch; otherwise leave a clearly marked TODO block for the orchestrator).
- **X2 — shared grading + content + pipeline:** `packages/shared/src/exam/{grading.ts,grading.fixtures.json,*.test.ts}` (+ export from `exam/index.ts`), `content/exams/**` (3 demo forms, original content, natural Korean/English, Vietnamese instructions/explanations), `scripts/content/**` + `scripts/content-import.mjs` exam support (+ tests), regenerate `supabase/seed.sql`, `content/README.md` section.
- **X3 — web data:** `apps/web/src/features/exam/**` (+ tests, fixtures).
- **X4 — UI components:** `apps/web/src/routes/app/exam/components/**` (+ tests; local fixtures built from the contract; do not import features/exam).

## Wave 2

- **X5 — pages + integration + E2E:** `ExamHubPage`, `ExamRunnerPage`, `ExamResultPage` in `apps/web/src/routes/app/exam/`, router entries (`luyen-thi` replaces ComingSoonPage; runner and result outside AppLayout like the lesson route), `ExamHistoryCard` on `ProgressPage`, `track('exam_started'|'exam_completed')`, e2e mocks in `apps/web/tests/e2e/fixtures.ts` (`createExamBackend` from the seed bundle + shared grader), `apps/web/tests/e2e/exam.spec.ts`; pgTAP generated from `grading.fixtures.json` (follow the diagnostic fixtures generator pattern).

## Wave 3

- **X6 — AI writing feedback** (after the other session's ai-tutor changes are merged): new task `review_writing` in the AI contract + prompt module + rubric JSON output (`criteria[{key, points, comment_vi}]`, `overall_vi`, `corrected_version`), labelled "Phản hồi luyện tập — không phải điểm chính thức"; button on essay review items.
- **Orchestrator:** merge, regenerate types, full checks, e2e, push/deploy per coordination with linguo-4c.
