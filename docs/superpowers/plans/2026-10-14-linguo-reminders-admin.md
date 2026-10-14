# Linguo Spec 10 + Spec 11 — Reminders/PWA and Content reports/Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Specs:** [Spec 10](../specs/2026-10-13-linguo-reminders-pwa-design.md) · [Spec 11](../specs/2026-10-13-linguo-content-admin-design.md)
**Contracts (Wave 0, committed):** `packages/shared/src/notifications/contract.ts`, `packages/shared/src/admin/contract.ts`.
**Orchestrator:** session linguo-f6 (the only session merging these tasks into `main`).

## Additions to the specs (pinned by the contracts)

- `get_notification_prefs() → jsonb` (creates the default row on first call). `set_notification_prefs` accepts `reset_backoff: true`.
- `list_notifications` returns `{ items, has_more }`. Weekly summary payload = `weeklySummaryPayloadSchema`.
- `BACKOFF_DAYS` defines exactly which ISO days each backoff level keeps.
- `report_content` returns `{ report_id, status: 'open' | 'duplicate' }`; `list_my_reports(p_limit)` feeds Settings → "Báo lỗi của tôi".
- `admin_set_status(..., p_force boolean default false)`; `admin_audit_log_recent(p_limit)` (admin) feeds the "Nhật ký" page.
- Kinds use singular names (`ADMIN_CONTENT_KINDS`); `repo_path` in `admin_get_content` is the YAML file under `content/`.

## Common rules (all tasks)

Own worktree based on `main` at the Wave 0 commit; TDD; touch only owned files; small commits with NO Co-Authored-By / AI mentions; never commit `.env`. **Do not edit `packages/shared/src/database.types.ts`** — the orchestrator regenerates it after merging the migrations; until then call new RPCs/tables through an untyped cast (see `apps/web/src/features/progress/service.ts`) and validate with the zod contract. DB work only in your own isolated Supabase stack (copy `supabase/` to a temp dir, unique `project_id`, ports in your assigned range; check `docker ps` first) — never another session's stack; stop it when done. Do not push. Copy is Vietnamese, warm, guilt-free (see `FORBIDDEN_REMINDER_PHRASES`).

## Wave 1 (parallel, 8 tasks)

- **N1 — reminders DB:** `supabase/migrations/20261015000300_reminders.sql`, `supabase/tests/reminders.test.sql`. Spec 10 §2 (tables, RPCs, `generate_due_notifications`, ignore/click backoff, `purge_notifications`, retention, unique `(user_id, kind, local_day)`), + `get_notification_prefs`. Stack ports 571xx.
- **N2 — notify-dispatch:** `supabase/functions/notify-dispatch/**` (+ Deno tests, pinned Web Push lib), `[functions.notify-dispatch]` in `supabase/config.toml`, `.github/workflows/notify.yml`, function deploy step in `.github/workflows/deploy.yml`, CI deno check/test covering the new function, docs for `NOTIFY_CRON_SECRET`/VAPID in `docs/DEPLOY.md` + `docs/SETUP.md`, `VITE_VAPID_PUBLIC_KEY` in the env template and `scripts/check-public-env.mjs` allow-list if needed. Spec 10 §3.
- **N3 — PWA:** `vite-plugin-pwa` (pinned, `injectManifest`) in `apps/web/package.json` + lockfile + `vite.config.ts`, `apps/web/src/sw.ts` (precache shell, media CacheFirst 7 d/200, no Supabase caching, navigation fallback, `push`/`notificationclick` → postMessage `SW_MESSAGE_NOTIFICATION_CLICKED`), any SW tsconfig, `apps/web/build/csp.ts` (`worker-src 'self'`, `manifest-src 'self'`) + test, `public/manifest.webmanifest` (shortcuts), `apps/web/src/features/pwa/**`: `registerServiceWorker()`, `useSwUpdate()` + `UpdateToast` (never reloads during a lesson/exam), `useInstallPrompt()` + `InstallAppSection` (iOS instructions). Do not mount in `App.tsx`/`main.tsx` (Wave 2).
- **N4 — notifications web:** `apps/web/src/features/notifications/**` (service, error-map, `useNotificationPrefs`, `useNotifications` with 60 s visible-tab polling, `push.ts` permission/subscribe/unsubscribe via `navigator.serviceWorker.ready`, forbidden-phrase scan test over `features/notifications` + the reminders migration if present), `apps/web/src/components/notifications/NotificationBell.tsx`, `apps/web/src/routes/app/notifications/NotificationsPage.tsx`, `apps/web/src/routes/app/settings/RemindersSection.tsx`, `apps/web/src/routes/app/home/WeeklySummaryCard.tsx` (+ tests). No router/layout/settings mounting (Wave 2).
- **C1 — reports + admin DB:** `supabase/migrations/20261015000400_content_reports.sql`, `20261015000410_admin.sql`, and if needed `20261015000420_import_keep_published.sql`; `supabase/tests/content_reports.test.sql`, `admin.test.sql`. Spec 11 §2–3, staff bootstrap docs section in `docs/DEPLOY.md`. Never edit applied migrations. Stack ports 572xx.
- **C2 — learner report web:** `apps/web/src/features/content-reports/**` (service, error-map, `useReportContent`, `useMyReports`), `apps/web/src/components/report/{ReportContentButton,ReportContentDialog}.tsx`, `apps/web/src/routes/app/settings/MyReportsSection.tsx`, wiring the button into `components/exercise/FeedbackPanel.tsx` and the flashcard back (`components/flashcard/**`) (+ tests). Not the exam/diagnostic review (Wave 2, after X6).
- **C3 — admin web core:** `apps/web/src/features/admin/{service.ts,error-map.ts,useStaffRole.ts,useAdminOverview.ts,useAdminReports.ts,useAdminSources.ts,useAdminAudit.ts}` (+ tests), `apps/web/src/routes/admin/{AdminGuard,AdminLayout,OverviewPage,ReportsPage,SourcesPage,AuditLogPage}.tsx`, `apps/web/src/routes/admin/admin-routes.tsx` (child `RouteObject[]`; content/analytics entries left as clearly marked TODO for Wave 2). Guard renders `NotFoundPage` when not staff; layout sets `<meta name="robots" content="noindex">`.
- **C4 — admin content + analytics web:** `apps/web/src/features/admin/{content.ts,analytics.ts,useAdminContent.ts,useAdminAnalytics.ts,yaml-hint.ts}` (+ tests; own small error helper, orchestrator dedupes), `apps/web/src/routes/admin/content/{ContentListPage,ContentDetailPage}.tsx`, `apps/web/src/routes/admin/analytics/AnalyticsPage.tsx` (hand-drawn SVG, reuse `ActivityChart` if it fits).

Routes: `/app/thong-bao`; `/quan-tri` (overview), `/quan-tri/noi-dung`, `/quan-tri/noi-dung/:kind/:id`, `/quan-tri/bao-loi`, `/quan-tri/nguon`, `/quan-tri/thong-ke`, `/quan-tri/nhat-ky`.

## Wave 2 (after merge)

- Orchestrator: merge in order N1, C1, N2, N3, N4, C2, C3, C4; regenerate `database.types.ts`; drop the untyped casts where trivial.
- **I1 — integration:** router entries (admin lazy chunk), bell in AppBar/Sidebar, Settings sections (Nhắc học, Cài app, Báo lỗi của tôi), Home weekly card, `App.tsx` SW registration + update toast + notification-click handling, report buttons on exam review (after linguo-91's X6) and diagnostic review.
- **I2 — E2E:** mocks in `apps/web/tests/e2e/fixtures.ts`, `reminders.spec.ts`, `pwa.spec.ts` (SW controller after reload, offline shell), `admin.spec.ts` (report from lesson, staff marks fixed, learner gets 404), axe.
- Orchestrator: full `pnpm test`, typecheck, lint, `supabase test db`, deno test, e2e; commit to `main`.
