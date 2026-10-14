# Bản đồ tính năng Linguo

Mỗi mục: tuyến đường (route), file chính, RPC/migration phía database và test bao phủ. Đường dẫn tính từ gốc repo. Mã nguồn web ở `apps/web/src` (viết tắt `web/`), dùng chung ở `packages/shared/src` (viết tắt `shared/`), test pgTAP ở `supabase/tests`, e2e ở `apps/web/tests/e2e`. Thiết kế chi tiết của từng spec: [docs/superpowers/specs](superpowers/specs/). Trạng thái từng spec và các quyết định đã chốt: [superpowers/HANDOFF.md](superpowers/HANDOFF.md).

Mọi route của người học nằm dưới tiền tố base path của GitHub Pages (`/Linguo/`); bảng route khai báo trong `web/app/router.tsx`. Mọi thao tác dữ liệu đi qua RPC `security definer` hoặc bảng có RLS; client không bao giờ đọc đáp án trước khi trả lời (`supabase/tests/content_no_leak.test.sql`).

| Mục | Tính năng | Route |
|---|---|---|
| 1 | Onboarding và lộ trình học | `/app/bat-dau`, cài đặt |
| 2 | Bài học và trình học (có hàng đợi offline) | `/app/hoc-tap`, `/app/hoc-tap/bai/:lessonId` |
| 3 | Flashcard và ôn tập FSRS | `/app/on-tap` |
| 4 | Kiểm tra đầu vào thích ứng | `/app/kiem-tra/:pathId` |
| 5 | Kế hoạch phiên học | `/app/phien-hoc`, thẻ trên trang chủ |
| 6 | Gia sư AI (gồm `review_writing`) | `/app/gia-su`, nút "Giải thích AI" |
| 7 | Luyện thi TOPIK / CEFR | `/app/luyen-thi` |
| 8 | Tiến độ, động lực, analytics | `/app/tien-do` |
| 9 | Nhắc học, báo cáo tuần, Web Push | `/app/thong-bao`, cài đặt |
| 10 | PWA: cài app, offline | toàn app |
| 11 | Báo lỗi nội dung | nút trong bài/thẻ/đề, cài đặt |
| 12 | Khu quản trị | `/quan-tri` |
| 13 | Xuất và xoá dữ liệu tài khoản | cài đặt |
| 14 | Quyền riêng tư và điều khoản | `/quyen-rieng-tu`, `/dieu-khoan` |

## 1. Onboarding và lộ trình học (Spec 1)

- **Route:** `/app/bat-dau` (6 bước: ngôn ngữ, điểm xuất phát, trình độ, mục tiêu, lịch học, xác nhận); quản lý nhiều lộ trình ở Cài đặt (`/app/cai-dat`).
- **Web:** `web/routes/app/onboarding/`, `web/features/learning-paths/` (service, `LearningPathsProvider`), `web/routes/app/settings/LearningPathsSection.tsx`, `PathPlanEditor.tsx`.
- **Shared:** `shared/learning/` (cấp độ `levels.ts`, ước lượng thời gian `estimate.ts`, fixture `estimate.fixtures.json`).
- **Database:** `20261013000100_foundation.sql` (profiles, user_preferences), `20261013000200_learning_paths.sql` (`create_learning_path`, `update_learning_path_plan`, `set_current_learning_path`, `set_learning_path_status`, `estimate_learning_path`, bảng `level_reference_hours` với `reviewed = false`).
- **Test:** `supabase/tests/learning_paths.test.sql`, `learning_paths_estimate.test.sql`, `foundation.test.sql`; fixture SQL ↔ TS qua `pnpm fixtures:sync`; `web/routes/app/onboarding/onboarding.test.tsx`, `logic.test.ts`; `web/features/learning-paths/learning-paths.test.tsx`; e2e `onboarding.spec.ts`.
- **Lưu ý:** ước lượng thời gian luôn hiển thị là tham khảo, giả định ghi rõ (bảng giờ tham chiếu chưa kiểm duyệt).

## 2. Bài học và trình học (Spec 2)

- **Route:** `/app/hoc-tap` (danh sách bài theo lộ trình), `/app/hoc-tap/bai/:lessonId` (trình học).
- **Web:** `web/routes/app/lesson/` (các bước mục tiêu → giải thích → ví dụ → lỗi thường gặp → bài tập → tóm tắt → lịch ôn), `web/components/exercise/` (mcq, fill_blank, translate, word_bank, listen), `web/features/lesson-player/` (máy trạng thái `playerMachine.ts`, service).
- **Offline:** `outbox.ts` giữ câu trả lời chưa tới server trong localStorage (tối đa 200, hết hạn 7 ngày, backoff tối đa 60 giây), phát lại theo thứ tự với cùng `idempotency_key` (`OutboxSyncProvider.tsx`, `useOutboxSync.ts`); `lessonCache.ts` giữ nội dung chữ của tối đa 2 bài gần nhất, 7 ngày, để mở lại khi mất mạng.
- **Chấm điểm:** chấm trên server theo `shared/content/grading.ts` (cùng thuật toán với hàm SQL `grade_exercise`); fixture dùng chung `grading.fixtures.json`.
- **Database:** `20261014000100_content.sql` (chương trình, unit, bài, học liệu, bài tập, `content_private.exercise_keys`, `import_content_bundle`), `20261014000200_lesson_runs.sql` (`start_lesson`, `get_lesson`, `submit_exercise`, `grade_exercise`, `complete_lesson`, `save_lesson_cursor`, `path_lessons`, `lesson_for_path`), `20261014000600_spec2_sync.sql`, `20261015000800_answer_integrity.sql` (xem HANDOFF).
- **Nội dung:** `content/<en|ko>/programs/...` và `content/<en|ko>/items/`; cách soạn và xuất bản ở [content/README.md](../content/README.md) và [DEPLOY.md](DEPLOY.md) mục "Xuất bản nội dung".
- **Test:** `supabase/tests/lesson_runs.test.sql`, `grading.test.sql`, `answer_integrity.test.sql`, `content.test.sql`, `content_no_leak.test.sql`; `scripts/content-import.test.mjs`; `web/features/lesson-player/*.test.ts(x)`; `web/routes/app/lesson/*.test.tsx`; e2e `lesson.spec.ts`.

## 3. Flashcard và ôn tập FSRS (Spec 3)

- **Route:** `/app/on-tap`; thẻ "đến hạn" trên trang chủ (`web/routes/app/home/ReviewDueCard.tsx`).
- **Web:** `web/routes/app/review/`, `web/components/flashcard/`, `web/features/reviews/` (service, `useReviewSession.ts`, `outbox.ts` cho điểm ôn chưa gửi, dùng chung hạ tầng với outbox bài học).
- **Shared:** `shared/review/` (hợp đồng RPC, `fsrs.fixtures.json`).
- **Database:** `20261014000300_reviews.sql` (review_cards, review_logs, review_item_mastery, srs_config), `20261014000310_reviews_fsrs.sql` (FSRS-6 bằng SQL: `srs_next`, `srs_previews`, ...), `20261014000320_reviews_queue.sql` (`get_review_queue`, `review_summary`, `postpone_reviews`), `20261014000330_reviews_grade.sql` (`grade_review`, `srs_enroll_lesson`, `srs_update_mastery`), `20261015000600_review_grade_guard.sql` (`grade_review` áp đúng bộ lọc của hàng đợi).
- **Test:** `supabase/tests/reviews_schema.test.sql`, `review_fsrs.test.sql`, `reviews_fsrs_snap.test.sql`, `reviews_queue.test.sql`, `reviews_grade.test.sql`; fixture SQL ↔ ts-fsrs qua `pnpm fixtures:fsrs`; `web/features/reviews/*.test.ts(x)`, `web/routes/app/review/*.test.tsx`; e2e `review.spec.ts`.

## 4. Kiểm tra đầu vào thích ứng (Spec 4)

- **Route:** `/app/kiem-tra/:pathId`, kết quả `/app/kiem-tra/:pathId/ket-qua`; thẻ gợi ý trên trang chủ (`web/routes/app/home/DiagnosticCard.tsx`).
- **Web:** `web/routes/app/diagnostic/`, `web/features/diagnostic/` (`useDiagnosticRun.ts`, `useDiagnosticStatus.ts`).
- **Shared:** `shared/diagnostic/engine.ts` (ước lượng EAP, khoảng và độ tin cậy; fixture `engine.fixtures.json`).
- **Database:** `20261014000400_diagnostic.sql` (assessments, items, attempts, responses), `20261014000410_diagnostic_engine.sql` (`diag_*`), `20261014000420_diagnostic_rpc.sql` (`start_diagnostic`, `answer_diagnostic`, `finish_diagnostic`, `accept_diagnostic_placement`, `skip_diagnostic_skill`, `diagnostic_status`), `20261014000430_diagnostic_import.sql`.
- **Nội dung:** `content/diagnostic/<en|ko>/{vocabulary,grammar,reading}.yaml`. Nghe tự bỏ qua (`not_supported`) cho đến khi có audio; viết/nói không bao giờ được suy ra.
- **Test:** `supabase/tests/diagnostic_schema.test.sql`, `diagnostic_engine.test.sql`, `diagnostic_rpc.test.sql`; `pnpm fixtures:diagnostic`; `shared/diagnostic/engine.test.ts`, `simulation.test.ts`; `web/routes/app/diagnostic/*.test.tsx`; e2e `diagnostic.spec.ts`.

## 5. Kế hoạch phiên học (Spec 6)

- **Route:** `/app/phien-hoc` (độ dài 10/15/30/45/60/90/120 phút, tham số `?phut=`); thẻ "Hôm nay" trên trang chủ (`web/routes/app/home/TodayCard.tsx`).
- **Web:** `web/routes/app/session/`, `web/features/session/` (`usePlanner.ts`, `useTodaySession.ts`), `web/features/session-link/` (đưa người học quay lại phiên sau khi làm xong bài/ôn tập).
- **Shared:** `shared/planner/plan.ts` (bộ lập kế hoạch thuần, chạy phía client), `contract.ts`.
- **Database:** `20261014000900_session_planner.sql` (`get_session_inputs`, `get_today_session`, `save_session_plan`, `reorder_session`, `update_session_item`, `finish_session`, `session_recap`, bảng `study_sessions`).
- **Test:** `supabase/tests/session_planner.test.sql`; `shared/planner/plan.test.ts`, `contract.test.ts`; `web/features/session/*.test.ts(x)`, `web/routes/app/session/session.test.tsx`; e2e `session.spec.ts`, `session-return.spec.ts`.

## 6. Gia sư AI (Spec 5, thêm `review_writing` ở Spec 9)

- **Route:** `/app/gia-su`; nút "Giải thích AI" trong bài học, thẻ ôn, phản hồi bài tập và bài viết trong đề thi.
- **Web:** `web/routes/app/tutor/`, `web/components/ai/` (sheet, modal, quota chip, fallback khi AI lỗi, báo cáo câu trả lời AI, hộp thoại thông báo quyền riêng tư), `web/features/ai-tutor/`.
- **Edge Function:** `supabase/functions/ai-tutor/` (`handler.ts` là pipeline; `lib/gemini.ts`, `lib/breaker.ts`, `lib/ip-limiter.ts`, `lib/prompts/`), cấu hình `[functions.ai-tutor] verify_jwt = true` trong `supabase/config.toml`. Bốn tác vụ: `explain_concept`, `generate_practice`, `analyze_error`, `review_writing` (`AI_TASKS` trong `shared/ai/contract.ts`; bản sao hợp đồng cho Deno ở `supabase/functions/_shared/ai-contract.ts`, đồng bộ bằng `pnpm ai:contract`).
- **Giới hạn (đọc từ code):** quota ngày theo tài khoản `GEMINI_DAILY_USER_LIMIT` (mặc định 20), 30 request/phút/IP theo isolate, payload tối đa 16 KB, bài viết cho `review_writing` tối đa 1500 ký tự; circuit breaker mở sau 5 lỗi upstream trong 60 giây; thiếu `GEMINI_API_KEY`/`GEMINI_MODEL` trả 503 `ai_unavailable`. Vận hành: [RUNBOOK.md](RUNBOOK.md) mục 6.
- **Database:** `20261014000500_ai_gateway.sql` (`ai_cache`, `ai_quota`, `ai_usage`, `ai_reports`, `ai_quota_consume`, `ai_quota_refund`, `ai_usage_log`, `ack_ai_notice`, `ai_report`), `20261015000700_ai_review_writing.sql` (mở rộng danh sách tác vụ).
- **Nhãn:** phản hồi bài viết ghi "Phản hồi luyện tập — không phải điểm chính thức" (`WRITING_FEEDBACK_LABEL` trong `web/components/ai/AiResultView.tsx`); AI không bao giờ sinh câu hỏi trong lúc thi.
- **Test:** `supabase/tests/ai_gateway.test.sql`, `ai_review_writing.test.sql`; Deno `supabase/functions/ai-tutor/handler_test.ts` và `lib/*_test.ts` (CI job `functions`); `shared/ai/contract.test.ts`; `web/components/ai/ai-ui.test.tsx`, `web/features/ai-tutor/*.test.ts(x)`, `web/routes/app/tutor/tutor.test.tsx`; e2e `ai.spec.ts`.

## 7. Luyện thi TOPIK I/II và CEFR (Spec 9)

- **Route:** `/app/luyen-thi` (trung tâm: thi thử toàn bài có giờ, luyện theo phần, luyện theo dạng câu), `/app/luyen-thi/lam-bai/:attemptId`, `/app/luyen-thi/ket-qua/:attemptId`.
- **Web:** `web/routes/app/exam/` (+ `components/`), `web/features/exam/` (service, `useExamAttempt.ts`, `tts.ts` đọc kịch bản nghe bằng TTS của trình duyệt khi chưa có audio).
- **Shared:** `shared/exam/` (hợp đồng, `grading.ts`, `bundle.ts`, `grading.fixtures.json`).
- **Database:** `20261015000200_exams.sql` (exam_forms, exam_questions, `content_private.exam_keys`, exam_attempts, exam_answers; `list_exam_forms`, `start_exam`, `save_exam_answer`, `submit_exam`, `get_exam_attempt`, `exam_history`, `import_exam_content_bundle`). Đáp án, giải thích, kịch bản nghe và rubric chỉ trả về sau khi bài đã đóng; server giữ hạn nộp (cho thêm 30 giây).
- **Nội dung:** `content/exams/<en|ko>/*.yaml`. Thang điểm đọc từ khối `scoring` của đề; `scoring.verified = false` thì kết quả hiện cảnh báo "chưa đối chiếu" (`UNVERIFIED_SCORING_LABEL`), và mọi đề mang nhãn "Bài luyện mô phỏng — không phải đề thi chính thức" (`SimulatedBadge`). Hiện `content/exams/ko/topik-i-mock-1.yaml` và `topik-ii-mock-1.yaml` đặt `verified: true`, `content/exams/en/cefr-a2-mock-1.yaml` đặt `verified: false`.
- **Test:** `supabase/tests/exams.test.sql`, `exam_grading.test.sql`; `pnpm fixtures:exam`; `shared/exam/*.test.ts`; `web/features/exam/*.test.ts(x)`, `web/routes/app/exam/*.test.tsx`; e2e `exam.spec.ts`.

## 8. Tiến độ, động lực và analytics (Spec 8)

- **Route:** `/app/tien-do` (hoạt động, học tập, năng lực; XP, chuỗi ngày theo lịch, thử thách tuần, huy hiệu, danh sách lỗi sai, ước lượng); dải động lực trên trang chủ.
- **Web:** `web/routes/app/progress/`, `web/features/progress/` (`useProgressDashboard.ts`, `useMotivationPrefs.ts`), phần bật/tắt động lực ở `web/routes/app/settings/MotivationSection.tsx`.
- **Analytics nội bộ:** `web/features/analytics/` (`client.ts` gom lô tối đa 20 sự kiện, `RouteTracker.tsx` chỉ gửi mẫu route, không gửi id/query). Danh sách sự kiện cố định ở `ANALYTICS_EVENTS` (`shared/progress/contract.ts`). Người học tắt được bằng `user_preferences.analytics_opt_out` (khi đó `track_events` không lưu gì).
- **Database:** `20261015000100_progress.sql` (activity_days, user_badges, các trigger trên attempts/review_logs/lesson_runs, `get_progress_dashboard`), `20261015000110_analytics.sql` (`analytics_events`, `track_events`, `purge_analytics`).
- **Test:** `supabase/tests/progress.test.sql`, `analytics.test.sql`; `web/features/progress/*.test.ts(x)`, `web/features/analytics/*.test.ts(x)`, `web/routes/app/progress/*.test.tsx`; e2e `progress.spec.ts`.

## 9. Nhắc học, báo cáo tuần, Web Push (Spec 10)

- **Route:** hộp thư `/app/thong-bao` (chuông trong thanh app `web/components/notifications/NotificationBell.tsx`), thẻ "Báo cáo tuần" trên trang chủ, lịch nhắc ở Cài đặt (`web/routes/app/settings/RemindersSection.tsx`).
- **Web:** `web/features/notifications/` (service, `push.ts` chỉ đăng ký thiết bị khi người học bấm, `usePushNotifications.ts`, `useWeeklySummary.ts`), `web/routes/app/notifications/`.
- **Edge Function:** `supabase/functions/notify-dispatch/` (`handler.ts`, `push.ts`), `verify_jwt = false`, chỉ nhận `Authorization: Bearer <NOTIFY_CRON_SECRET>`; được workflow `.github/workflows/notify.yml` gọi mỗi 15 phút (xem [DEPLOY.md](DEPLOY.md) mục "Nhắc học & Web Push").
- **Database:** `20261015000300_reminders.sql` (notification_prefs, notifications, push_subscriptions; `get_notification_prefs`, `set_notification_prefs`, `save_push_subscription`, `delete_push_subscription`, `list_notifications`, `mark_notification`, `unread_notification_count`; chỉ `service_role`: `generate_due_notifications`, `purge_notifications`). Báo cáo tuần: Chủ nhật, khung nhắc đầu tiên (19:30 nếu chưa có cấu hình), luôn vào hộp thư, chỉ đẩy ngoài giờ yên lặng. Nội dung nhắc không dùng câu gây áp lực (`forbidden-phrases.test.ts`).
- **Test:** `supabase/tests/reminders.test.sql`; Deno `supabase/functions/notify-dispatch/handler_test.ts`, `push_test.ts`; `web/features/notifications/*.test.ts(x)`, `web/routes/app/notifications/NotificationsPage.test.tsx`, `web/routes/app/settings/RemindersSection.test.tsx`; e2e `reminders.spec.ts`.

## 10. PWA: cài app và offline (Spec 10)

- **Web:** `web/sw.ts` (service worker, build bằng `vite-plugin-pwa` kiểu `injectManifest` trong `apps/web/vite.config.ts`), `web/features/pwa/` (đăng ký `register.ts`, toast cập nhật `UpdateToast.tsx`, `InstallAppSection.tsx` ở Cài đặt, `busy-route.ts`), `web/app/PwaBridge.tsx`, manifest tĩnh `apps/web/public/manifest.webmanifest`.
- **Hành vi (theo chú thích đầu `sw.ts`):** precache vỏ app; điều hướng dùng `index.html` đã cache (SPA fallback chạy offline); ảnh/audio nội dung CacheFirst 7 ngày, 200 mục; mọi lời gọi Supabase (REST/RPC/Auth/Functions) không bao giờ qua service worker; phiên bản mới chỉ kích hoạt khi người học bấm "Tải lại", không tự reload (đặc biệt không giữa bài học, bài thi, kiểm tra, phiên học). Offline giới hạn: vỏ app, bài đã mở, hàng đợi nộp bài/ôn tập (mục 2, 3).
- **Test:** `web/features/pwa/pwa.test.tsx`, `manifest.test.ts`, `sw-helpers.test.ts`; `web/app/pwa-bridge.test.tsx`; e2e `pwa.spec.ts`; CSP có `worker-src`/`manifest-src` (`apps/web/build/csp.test.ts`). Kiểm thử máy thật: [MOBILE-QA.md](MOBILE-QA.md).

## 11. Báo lỗi nội dung (Spec 11)

- **UI:** `web/components/report/` (`ReportContentButton`, `ReportContentDialog`) trong bài tập, thẻ ôn, câu hỏi kiểm tra đầu vào và phần xem lại bài thi; "Báo lỗi của tôi" ở Cài đặt (`web/routes/app/settings/MyReportsSection.tsx`).
- **Web:** `web/features/content-reports/`.
- **Database:** `20261015000400_content_reports.sql` (`content_reports`, `report_content`, `list_my_reports`). Lý do báo: `wrong_answer`, `unclear`, `typo`, `audio`, `translation`, `offensive`, `other` (`REPORT_REASONS` trong `shared/admin/contract.ts`). Người học đọc báo lỗi của mình qua RLS; xử lý chỉ qua RPC của quản trị (mục 12).
- **Test:** `supabase/tests/content_reports.test.sql`; `web/features/content-reports/*.test.ts(x)`, `web/components/report/report.test.tsx`, `my-reports-section.test.tsx`; e2e `admin.spec.ts` (kịch bản "a learner reports a lesson exercise and follows it in Settings").

## 12. Khu quản trị `/quan-tri` (Spec 11)

- **Route (tải lazy thành chunk riêng):** `/quan-tri` (tổng quan), `/quan-tri/noi-dung`, `/quan-tri/noi-dung/:kind/:id`, `/quan-tri/bao-loi`, `/quan-tri/nguon`, `/quan-tri/thong-ke` (admin), `/quan-tri/nhat-ky` (admin). Người không có vai trò thấy trang 404 như mọi đường dẫn lạ.
- **Web:** `web/routes/admin/` (`AdminGuard.tsx`, `AdminLayout.tsx`, `admin-routes.tsx`), `web/features/admin/`. Danh sách đường dẫn con ở `ADMIN_CHILD_PATHS` trong `web/app/router.tsx`, có test giữ đồng bộ với `adminRoutes` (`web/routes/admin/admin-route.test.tsx`).
- **Vai trò (`public.staff_roles`):** `editor` < `reviewer` < `admin`. Cách đọc từng trang và cấp vai trò: [DEPLOY.md](DEPLOY.md) mục "Quản trị nội dung".
- **Database:** `20261015000410_admin.sql` (`staff_role`, `admin_content_overview`, `admin_list_content`, `admin_get_content`, `admin_set_status`, `admin_list_reports`, `admin_resolve_report`, `admin_list_sources`, `admin_analytics`, `admin_ai_usage`, `admin_audit_log_recent`, `admin_grant_role`; helper trong schema `admin_private`), `20261015000420_import_keep_published.sql` (nhập lại nội dung không bao giờ hạ một dòng đã `published`).
- **Test:** `supabase/tests/admin.test.sql`, `content_no_leak.test.sql`; `web/routes/admin/*.test.tsx`, `web/features/admin/*.test.ts(x)`; e2e `admin.spec.ts` (404 cho người học, axe, không cuộn ngang).

## 13. Xuất và xoá dữ liệu tài khoản (Spec 7)

- **Route:** Cài đặt, mục "Tài khoản và dữ liệu" (`web/routes/app/settings/AccountDataSection.tsx`), `web/features/account/service.ts`.
- **Database:** `20261014000910_account_data.sql`: `export_my_data()` (giới hạn 5 lần/giờ), `delete_my_account(text)` (cần gõ đúng cụm xác nhận, ghi một dòng ẩn danh vào `account_deletions`), `purge_expired_data()` (chỉ `service_role`, chạy bởi workflow Maintenance). Quy tắc bao phủ của bản xuất: `account_optional_tables()` (`20261015000610_export_exam_data.sql`), xem HANDOFF.
- **Test:** `supabase/tests/account_data.test.sql`, `account_export_coverage.test.sql`; `web/features/account/service.test.ts`, `account-data-section.test.tsx`; e2e `hardening.spec.ts` (nhóm "account data").

## 14. Quyền riêng tư và điều khoản (Spec 7)

- **Route:** `/quyen-rieng-tu`, `/dieu-khoan` (`web/routes/legal/`, nội dung ở `content.ts`; số ngày lưu trữ lấy từ `web/features/account/retention.ts`); mục "AI và quyền riêng tư" ở Cài đặt (`web/routes/app/settings/AiPrivacySection.tsx`) nói rõ gia sư AI gửi gì tới Gemini gói miễn phí.
- **Bảo mật web đi kèm:** CSP chèn lúc build (`apps/web/build/csp.ts`), `pnpm check:bundle`, gitleaks, kiểm tra biến `VITE_*` (`scripts/check-public-env.mjs`); chi tiết ở [RUNBOOK.md](RUNBOOK.md) mục 7.
- **Test:** `web/routes/legal/legal.test.tsx`, `web/routes/app/settings/ai-privacy-section.test.tsx`; e2e `hardening.spec.ts` (trang pháp lý, axe), `csp.spec.ts`, `a11y.spec.ts`, `a11y-routes.spec.ts`.
