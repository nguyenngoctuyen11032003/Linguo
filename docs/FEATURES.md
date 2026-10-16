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
| 6 | Gia sư AI (8 tác vụ: thêm `review_writing`, `analyze_sentence`, `summarize_session`, `plan_review`, `roleplay_turn`) | `/app/gia-su`, nút "Giải thích AI", `/app/dong-vai` |
| 7 | Luyện thi TOPIK / JLPT / CEFR | `/app/luyen-thi` |
| 8 | Tiến độ, động lực, analytics | `/app/tien-do` |
| 9 | Nhắc học, báo cáo tuần, Web Push | `/app/thong-bao`, cài đặt |
| 10 | PWA: cài app, offline | toàn app |
| 11 | Báo lỗi nội dung | nút trong bài/thẻ/đề, cài đặt |
| 12 | Khu quản trị (gồm trang Nhân sự) | `/quan-tri`, `/quan-tri/nhan-su` |
| 13 | Xuất và xoá dữ liệu tài khoản | cài đặt |
| 14 | Quyền riêng tư và điều khoản | `/quyen-rieng-tu`, `/dieu-khoan` |
| 15 | Luyện nói | `/app/luyen-noi` |
| 16 | Đóng vai hội thoại với AI | `/app/dong-vai` |
| 17 | Từ vựng của tôi (nhập CSV) | `/app/tu-vung-cua-toi` |
| 18 | Quy ước hiệu năng, truy cập và thông báo lỗi | toàn app |
| 19 | Audio thật cho bài nghe (tạo offline bằng Gemini TTS) | bài nghe, thẻ ôn, phần nghe của đề |
| 20 | Công cụ giáo viên và lớp học | `/giao-vien`, `/app/lop-hoc` |
| 21 | Tiếng Nhật (ngôn ngữ thứ ba) | toàn app |

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
- **Trang Học tập (`web/routes/app/learn/`):** gợi ý bài tiếp theo (`pickNextLesson` trong `grouping.ts`: bài đang học, nếu không thì bài chưa học đầu tiên đã đủ bài tiên quyết) và hiện tiến độ theo chương trình và từng unit (`learnedCount`).
- **Cấu trúc trang bài học (`web/routes/app/lesson/LessonPage.tsx`):** tên bài là `h1` của trang; bộ đếm câu hỏi là một đoạn `aria-live="polite"` (đọc lại khi sang câu mới); nút thoát chỉ hỏi xác nhận khi còn câu trả lời chưa gửi (`run.pendingCount > 0`).
- **Chấm điểm:** chấm trên server theo `shared/content/grading.ts` (cùng thuật toán với hàm SQL `grade_exercise`); fixture dùng chung `grading.fixtures.json`. Đáp án tiếng Nhật được so sánh sau khi bỏ mọi khoảng trắng.
- **Database:** `20261014000100_content.sql` (chương trình, unit, bài, học liệu, bài tập, `content_private.exercise_keys`, `import_content_bundle`), `20261014000200_lesson_runs.sql` (`start_lesson`, `get_lesson`, `submit_exercise`, `grade_exercise`, `complete_lesson`, `save_lesson_cursor`, `path_lessons`, `lesson_for_path`), `20261014000600_spec2_sync.sql`, `20261015000800_answer_integrity.sql` (khoá đáp án theo phiên bản, kẹp `client_at`), `20261016000500_content_admin_hardening.sql` (quy tắc `client_at` 48 giờ), `20261016000800_progress_vocab_hardening.sql` (siết còn 12 giờ, chặn giả thời gian hoạt động); xem [HANDOFF](superpowers/HANDOFF.md) mục 2.
- **Nội dung:** `content/<en|ko|ja>/programs/...` và `content/<en|ko|ja>/items/`; cách soạn và xuất bản ở [content/README.md](../content/README.md) và [DEPLOY.md](DEPLOY.md) mục "Xuất bản nội dung".
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
- **Nội dung:** `content/diagnostic/<en|ko|ja>/{vocabulary,grammar,reading}.yaml`. Nghe tự bỏ qua (`not_supported`) cho đến khi có audio; viết/nói không bao giờ được suy ra.
- **Test:** `supabase/tests/diagnostic_schema.test.sql`, `diagnostic_engine.test.sql`, `diagnostic_rpc.test.sql`; `pnpm fixtures:diagnostic`; `shared/diagnostic/engine.test.ts`, `simulation.test.ts`; `web/routes/app/diagnostic/*.test.tsx`; e2e `diagnostic.spec.ts`.

## 5. Kế hoạch phiên học (Spec 6)

- **Route:** `/app/phien-hoc` (độ dài 10/15/30/45/60/90/120 phút, tham số `?phut=`); thẻ "Hôm nay" trên trang chủ (`web/routes/app/home/TodayCard.tsx`).
- **Web:** `web/routes/app/session/`, `web/features/session/` (`usePlanner.ts`, `useTodaySession.ts`), `web/features/session-link/` (đưa người học quay lại phiên sau khi làm xong bài/ôn tập).
- **Shared:** `shared/planner/plan.ts` (bộ lập kế hoạch thuần, chạy phía client), `contract.ts`.
- **Bỏ qua và hoàn tác:** bỏ qua một hoạt động hiện nút "Hoàn tác" trong `UNDO_VISIBLE_MS` = 8 giây (`web/routes/app/session/SessionPage.tsx`); nút đổi thứ tự cao 44px và đọc lại vị trí mới cho trình đọc màn hình. Khi phiên xong, `web/routes/app/session/SessionSummaryButton.tsx` gọi tác vụ AI `summarize_session` (mục 6).
- **Database:** `20261014000900_session_planner.sql` (`get_session_inputs`, `get_today_session`, `save_session_plan`, `reorder_session`, `update_session_item`, `finish_session`, `session_recap`, bảng `study_sessions`).
- **Test:** `supabase/tests/session_planner.test.sql`; `shared/planner/plan.test.ts`, `contract.test.ts`; `web/features/session/*.test.ts(x)`, `web/routes/app/session/session.test.tsx`; e2e `session.spec.ts`, `session-return.spec.ts`.

## 6. Gia sư AI (Spec 5; thêm `review_writing` ở Spec 9, bốn tác vụ nữa ở PRD §8.2)

- **Route:** `/app/gia-su`; nút "Giải thích AI" trong bài học, thẻ ôn, phản hồi bài tập và bài viết trong đề thi.
- **Web:** `web/routes/app/tutor/`, `web/components/ai/` (sheet, modal, quota chip, fallback khi AI lỗi, báo cáo câu trả lời AI, hộp thoại thông báo quyền riêng tư), `web/features/ai-tutor/`.
- **Edge Function:** `supabase/functions/ai-tutor/` (`handler.ts` là pipeline; `lib/gemini.ts`, `lib/breaker.ts`, `lib/ip-limiter.ts`, `lib/prompts/`), cấu hình `[functions.ai-tutor] verify_jwt = true` trong `supabase/config.toml`. Tám tác vụ: `explain_concept`, `generate_practice`, `analyze_error`, `review_writing`, `analyze_sentence`, `summarize_session`, `plan_review`, `roleplay_turn` (`AI_TASKS` trong `shared/ai/contract.ts`; bản sao hợp đồng cho Deno ở `supabase/functions/_shared/ai-contract.ts`, đồng bộ bằng `pnpm ai:contract`).
- **Bốn tác vụ thêm (migration `20261016000200_ai_more_tasks.sql` và `20261016000600_ai_roleplay.sql`; chỉ mở rộng danh sách tác vụ trong CHECK của `ai_cache`, `ai_usage`, `ai_reports` và trong các RPC của cache/log):**
  - `analyze_sentence`: phân tích một câu (tối đa `ANALYZE_SENTENCE_MAX_CHARS` = 160 ký tự) ở tab phân tích câu của trang gia sư (`web/routes/app/tutor/TutorPage.tsx`); có cache như `explain_concept`.
  - `summarize_session`: tóm tắt phiên học khi hoàn thành (`web/routes/app/session/SessionSummaryButton.tsx`); đầu vào là bản tóm tắt gọn do client dựng (tối đa `SESSION_SUMMARY_MAX_ACTIVITIES` = 12 hoạt động); không cache.
  - `plan_review`: kế hoạch ôn từ các lỗ hổng đã phát hiện, ở trang Tiến độ (`web/routes/app/progress/ReviewPlanButton.tsx`, `review-plan.ts`); tối đa `PLAN_REVIEW_MAX_GAPS` = 10 lỗ hổng vào, `PLAN_REVIEW_MAX_STEPS` = 5 bước ra; có cache theo đầu vào.
  - `roleplay_turn`: xem mục 16.
  - Đầu ra được kiểm trong `supabase/functions/ai-tutor/lib/prompts/` và hiển thị bằng `web/components/ai/AiMoreViews.tsx`.
- **Giới hạn (đọc từ code):** quota ngày theo tài khoản `GEMINI_DAILY_USER_LIMIT` (mặc định 20), 30 request/phút/IP theo isolate, payload tối đa 16 KB, bài viết cho `review_writing` tối đa 1500 ký tự; circuit breaker mở sau 5 lỗi upstream trong 60 giây; thiếu `GEMINI_API_KEY`/`GEMINI_MODEL` trả 503 `ai_unavailable`. Vận hành: [RUNBOOK.md](RUNBOOK.md) mục 6.
- **Database:** `20261014000500_ai_gateway.sql` (`ai_cache`, `ai_quota`, `ai_usage`, `ai_reports`, `ai_quota_consume`, `ai_quota_refund`, `ai_usage_log`, `ack_ai_notice`, `ai_report`), `20261015000700_ai_review_writing.sql` (mở rộng danh sách tác vụ).
- **Nhãn:** phản hồi bài viết ghi "Phản hồi luyện tập — không phải điểm chính thức" (`WRITING_FEEDBACK_LABEL` trong `web/components/ai/AiResultView.tsx`); AI không bao giờ sinh câu hỏi trong lúc thi.
- **Test:** `supabase/tests/ai_gateway.test.sql`, `ai_review_writing.test.sql`, `ai_more_tasks.test.sql`, `ai_roleplay.test.sql`; Deno `supabase/functions/ai-tutor/handler_test.ts` và `lib/*_test.ts` (CI job `functions`); `shared/ai/contract.test.ts`, `contract-more.test.ts`, `contract-roleplay.test.ts`; `web/components/ai/ai-ui.test.tsx`, `web/features/ai-tutor/*.test.ts(x)`, `web/routes/app/tutor/tutor.test.tsx`; e2e `ai.spec.ts`, `ai-more.spec.ts`.

## 7. Luyện thi TOPIK I/II, JLPT và CEFR (Spec 9; JLPT ở mục 21)

- **Route:** `/app/luyen-thi` (trung tâm: thi thử toàn bài có giờ, luyện theo phần, luyện theo dạng câu), `/app/luyen-thi/lam-bai/:attemptId`, `/app/luyen-thi/ket-qua/:attemptId`.
- **Web:** `web/routes/app/exam/` (+ `components/`), `web/features/exam/` (service, `useExamAttempt.ts`, `tts.ts` đọc kịch bản nghe bằng TTS của trình duyệt khi chưa có audio).
- **Shared:** `shared/exam/` (hợp đồng, `grading.ts`, `bundle.ts`, `grading.fixtures.json`).
- **Database:** `20261015000200_exams.sql` (exam_forms, exam_questions, `content_private.exam_keys`, exam_attempts, exam_answers; `list_exam_forms`, `start_exam`, `save_exam_answer`, `submit_exam`, `get_exam_attempt`, `exam_history`, `import_exam_content_bundle`). Đáp án, giải thích, kịch bản nghe và rubric chỉ trả về sau khi bài đã đóng; server giữ hạn nộp (cho thêm 30 giây).
- **Nội dung:** `content/exams/<en|ko|ja>/*.yaml`. Thang điểm đọc từ khối `scoring` của đề; `scoring.verified = false` thì kết quả hiện cảnh báo "chưa đối chiếu" (`UNVERIFIED_SCORING_LABEL`), và mọi đề mang nhãn "Bài luyện mô phỏng — không phải đề thi chính thức" (`SimulatedBadge`). Hiện `content/exams/ko/topik-i-mock-1.yaml` và `topik-ii-mock-1.yaml` đặt `verified: true`, `content/exams/en/cefr-a2-mock-1.yaml` đặt `verified: false`; ba đề `content/exams/ja/jlpt-n{5,4,3}-mock-1.yaml` đặt `verified: true`. Câu nghe có `audio_asset_id` được phát bằng `playContentAudioOnce` (mục 19).
- **Test:** `supabase/tests/exams.test.sql`, `exam_grading.test.sql`; `pnpm fixtures:exam`; `shared/exam/*.test.ts`; `web/features/exam/*.test.ts(x)`, `web/routes/app/exam/*.test.tsx`; e2e `exam.spec.ts`.

## 8. Tiến độ, động lực và analytics (Spec 8)

- **Route:** `/app/tien-do` (hoạt động, học tập, năng lực; XP, chuỗi ngày theo lịch, thử thách tuần, huy hiệu, danh sách lỗi sai, ước lượng); dải động lực trên trang chủ.
- **Web:** `web/routes/app/progress/`, `web/features/progress/` (`useProgressDashboard.ts`, `useMotivationPrefs.ts`), phần bật/tắt động lực ở `web/routes/app/settings/MotivationSection.tsx`.
- **Luyện thi tính vào chuỗi ngày (`20261016000100_exam_activity.sql`):** khi đóng một lượt thi (nộp hoặc hết giờ), `exam_close_attempt` cộng lượt đó vào `activity_days` đúng một lần: số câu = số đáp án khác rỗng; thời gian hoạt động = tổng khoảng cách giữa các lần lưu đáp án, mỗi khoảng tối đa 120 giây (khoảng đầu tính từ `started_at`), mỗi đáp án được tính vào ngày của lần lưu cuối của nó (`20261016000800_progress_vocab_hardening.sql`, trước đó là ngày đóng lượt); XP luôn 0 (luyện thi không dùng để cày XP); ngày tính theo múi giờ của người học. Cột `exam_attempts.activity_counted_at` đánh dấu lượt đã được cộng nên đóng lại hay chạy lại không cộng đôi. Cuối migration gọi `exam_backfill_activity()` để cộng các lượt đã đóng trước đó (gọi lần hai không còn gì để làm). Ngưỡng ngày hoạt động vẫn là `STREAK_RULES` (10 lượt ôn hoặc 5 phút).
- **Analytics nội bộ:** `web/features/analytics/` (`client.ts` gom lô tối đa 20 sự kiện, `RouteTracker.tsx` chỉ gửi mẫu route, không gửi id/query). Danh sách sự kiện cố định ở `ANALYTICS_EVENTS` (`shared/progress/contract.ts`). Người học tắt được bằng `user_preferences.analytics_opt_out` (khi đó `track_events` không lưu gì).
- **Database:** `20261015000100_progress.sql` (activity_days, user_badges, các trigger trên attempts/review_logs/lesson_runs, `get_progress_dashboard`), `20261015000110_analytics.sql` (`analytics_events`, `track_events`, `purge_analytics`, được workflow Maintenance gọi hằng ngày), `20261016000700_client_errors.sql` (sự kiện `client_error` báo lỗi kỹ thuật ẩn danh từ `web/lib/error-reporting.ts`, xem RUNBOOK mục 9).
- **Test:** `supabase/tests/progress.test.sql`, `analytics.test.sql`, `client_errors.test.sql`, `exam_activity.test.sql`; `web/features/progress/*.test.ts(x)`, `web/features/analytics/*.test.ts(x)`, `web/routes/app/progress/*.test.tsx`; e2e `progress.spec.ts`.

## 9. Nhắc học, báo cáo tuần, Web Push (Spec 10)

- **Route:** hộp thư `/app/thong-bao` (chuông trong thanh app `web/components/notifications/NotificationBell.tsx`), thẻ "Báo cáo tuần" trên trang chủ, lịch nhắc ở Cài đặt (`web/routes/app/settings/RemindersSection.tsx`).
- **Web:** `web/features/notifications/` (service, `push.ts` chỉ đăng ký thiết bị khi người học bấm, `usePushNotifications.ts`, `useWeeklySummary.ts`), `web/routes/app/notifications/`.
- **Edge Function:** `supabase/functions/notify-dispatch/` (`handler.ts`, `push.ts`), `verify_jwt = false`, chỉ nhận `Authorization: Bearer <NOTIFY_CRON_SECRET>`; được workflow `.github/workflows/notify.yml` gọi mỗi 15 phút (xem [DEPLOY.md](DEPLOY.md) mục "Nhắc học & Web Push").
- **Database:** `20261015000300_reminders.sql` (notification_prefs, notifications, push_subscriptions; `get_notification_prefs`, `set_notification_prefs`, `save_push_subscription`, `delete_push_subscription`, `list_notifications`, `mark_notification`, `unread_notification_count`; chỉ `service_role`: `generate_due_notifications`, `purge_notifications`). Báo cáo tuần: Chủ nhật, khung nhắc đầu tiên (19:30 nếu chưa có cấu hình), luôn vào hộp thư, chỉ đẩy ngoài giờ yên lặng. Nội dung nhắc không dùng câu gây áp lực (`forbidden-phrases.test.ts`).
- **Gia cố (`20261016000400_notify_hardening.sql`, `supabase/functions/notify-dispatch/endpoint.ts`):**
  - Endpoint push chỉ nhận FCM, Mozilla autopush, WNS, Apple (`is_allowed_push_endpoint` trong RPC lẫn CHECK, kiểm lại trong function, không theo redirect); `save_push_subscription` giới hạn 20 lần/giờ; client không đọc được khoá `p256dh`/`auth` của chính mình.
  - Cửa sổ bù: nhắc vẫn đến hạn trong 60 phút kể từ đầu khung (`REMINDER_RULES.window_minutes`) vì cron GitHub hay chạy muộn; chỉ bỏ qua khi đã có nhắc của người đó trong cùng khung.
  - Nội dung push luôn chung chung theo loại thông báo (`reminders_push_text`); tên bài, số thẻ, số phút chỉ ở hộp thư trong app.
  - Gửi thử lại được: `pending_push_notifications` trả các dòng chưa gửi push trong 4 giờ (`PUSH_TTL_SECONDS`). Chỉ phản hồi 401/403 của push service tăng `failure_count` (xoá khi đạt `max_push_failures` = 10); 404/410 xoá ngay; lỗi mạng, 429, 5xx không tính.
  - Dọn: `notify-dispatch` gọi `purge_notifications` mỗi đêm (các lượt chạy trong giờ UTC 20, `PURGE_UTC_HOUR`).
  - Đăng xuất: `releasePushOnSignOut` (`web/features/notifications/push.ts`) huỷ subscription của thiết bị và xoá endpoint phía server trước `signOut` (tốt nhất có thể, không chặn, tối đa 2,5 giây).
  - Bấm vào thông báo (`web/features/pwa/sw-click.ts`): nếu app đang mở thì chỉ focus, **không** điều hướng cửa sổ đó (tránh mất bài đang làm); app nhận đích qua `postMessage` và tự định tuyến trong `web/app/PwaBridge.tsx` (hỏi trước khi rời bài học/bài thi).
- **Test:** `supabase/tests/reminders.test.sql`, `notify_hardening.test.sql`; Deno `supabase/functions/notify-dispatch/handler_test.ts`, `push_test.ts`, `endpoint_test.ts`; `web/features/pwa/sw-click.test.ts`; `web/features/notifications/*.test.ts(x)`, `web/routes/app/notifications/NotificationsPage.test.tsx`, `web/routes/app/settings/RemindersSection.test.tsx`; e2e `reminders.spec.ts`.

## 10. PWA: cài app và offline (Spec 10)

- **Web:** `web/sw.ts` (service worker, build bằng `vite-plugin-pwa` kiểu `injectManifest` trong `apps/web/vite.config.ts`), `web/features/pwa/` (đăng ký `register.ts`, toast cập nhật `UpdateToast.tsx`, `InstallAppSection.tsx` ở Cài đặt, `busy-route.ts`), `web/app/PwaBridge.tsx`, manifest tĩnh `apps/web/public/manifest.webmanifest`.
- **Hành vi (theo chú thích đầu `sw.ts`):** precache vỏ app; điều hướng dùng `index.html` đã cache (SPA fallback chạy offline); ảnh/audio nội dung CacheFirst 7 ngày, 200 mục; mọi lời gọi Supabase (REST/RPC/Auth/Functions) không bao giờ qua service worker; phiên bản mới chỉ kích hoạt khi người học bấm "Tải lại", không tự reload (đặc biệt không giữa bài học, bài thi, kiểm tra, phiên học). Offline giới hạn: vỏ app, bài đã mở, hàng đợi nộp bài/ôn tập (mục 2, 3).
- **Test:** `web/features/pwa/pwa.test.tsx`, `manifest.test.ts`, `sw-helpers.test.ts`; `web/app/pwa-bridge.test.tsx`; e2e `pwa.spec.ts`; CSP có `worker-src`/`manifest-src` (`apps/web/build/csp.test.ts`). Kiểm thử máy thật: [MOBILE-QA.md](MOBILE-QA.md).

## 11. Báo lỗi nội dung (Spec 11)

- **UI:** `web/components/report/` (`ReportContentButton`, `ReportContentDialog`) trong bài tập, thẻ ôn, câu hỏi kiểm tra đầu vào và phần xem lại bài thi; "Báo lỗi của tôi" ở Cài đặt (`web/routes/app/settings/MyReportsSection.tsx`).
- **Web:** `web/features/content-reports/`.
- **Database:** `20261015000400_content_reports.sql` (`content_reports`, `report_content`, `list_my_reports`; cách tính báo trùng được sửa ở `20261016000500_content_admin_hardening.sql`). Lý do báo: `wrong_answer`, `unclear`, `typo`, `audio`, `translation`, `offensive`, `other` (`REPORT_REASONS` trong `shared/admin/contract.ts`). Người học đọc báo lỗi của mình qua RLS; xử lý chỉ qua RPC của quản trị (mục 12).
- **Test:** `supabase/tests/content_reports.test.sql`; `web/features/content-reports/*.test.ts(x)`, `web/components/report/report.test.tsx`, `my-reports-section.test.tsx`; e2e `admin.spec.ts` (kịch bản "a learner reports a lesson exercise and follows it in Settings").

## 12. Khu quản trị `/quan-tri` (Spec 11)

- **Route (tải lazy thành chunk riêng):** `/quan-tri` (tổng quan), `/quan-tri/noi-dung`, `/quan-tri/noi-dung/:kind/:id`, `/quan-tri/bao-loi`, `/quan-tri/nguon`, `/quan-tri/thong-ke` (admin), `/quan-tri/nhat-ky` (admin), `/quan-tri/nhan-su` (admin). Người không có vai trò thấy trang 404 như mọi đường dẫn lạ. Thanh menu (`AdminLayout.tsx`) dưới breakpoint `lg` là một hàng cuộn ngang (không xuống dòng ở 320px, mục đang mở tự cuộn vào tầm nhìn bên trong hàng, không cuộn cả trang); liên kết chính của mỗi dòng ở Nội dung và Nguồn cao tối thiểu 44px.
- **Web:** `web/routes/admin/` (`AdminGuard.tsx`, `AdminLayout.tsx`, `admin-routes.tsx`), `web/features/admin/`. Danh sách đường dẫn con ở `ADMIN_CHILD_PATHS` trong `web/app/router.tsx`, có test giữ đồng bộ với `adminRoutes` (`web/routes/admin/admin-route.test.tsx`).
- **Vai trò (`public.staff_roles`):** `editor` < `reviewer` < `admin`. Cách đọc từng trang và cấp vai trò: [DEPLOY.md](DEPLOY.md) mục "Quản trị nội dung".
- **Database:** `20261015000410_admin.sql` (`staff_role`, `admin_content_overview`, `admin_list_content`, `admin_get_content`, `admin_set_status`, `admin_list_reports`, `admin_resolve_report`, `admin_list_sources`, `admin_analytics`, `admin_ai_usage`, `admin_audit_log_recent`, `admin_grant_role`; helper trong schema `admin_private`), `20261015000420_import_keep_published.sql` (nhập lại nội dung không bao giờ hạ một dòng đã `published`).
- **Gia cố (`20261016000500_content_admin_hardening.sql`):** báo lỗi chỉ là `duplicate` của báo lỗi chưa xử lý cùng lý do và cùng phiên bản nội dung (mỗi người một báo lỗi chưa xử lý cho mỗi mục); import không tự duyệt/xuất bản dòng còn báo lỗi chưa xử lý và giữ trạng thái do người duyệt đặt; `admin_grant_role` không gỡ hay hạ admin cuối cùng; `admin_audit_log` chỉ thêm, không sửa; đọc đáp án qua `admin_get_content` để lại một dòng nhật ký.
- **Nhân sự (`/quan-tri/nhan-su`, admin; `web/routes/admin/staff/StaffPage.tsx`, `RevokeRoleDialog.tsx`, `web/features/admin/staff.ts`, `useAdminStaff.ts`):** danh sách mọi dòng `staff_roles` kèm email, tên hiển thị, người cấp và ngày cấp (admin trước, rồi reviewer, editor); tìm một tài khoản theo email (khớp chính xác, không phân biệt hoa thường) hoặc user id rồi cấp/đổi vai trò; đổi vai trò hoặc thu hồi (hộp thoại xác nhận) ngay trên từng dòng. Mọi thay đổi đi qua `admin_grant_role` và vào nhật ký. Database: `20261017000500_admin_staff.sql` (`admin_list_staff`: tối đa một dòng nhật ký `list_staff` mỗi admin mỗi 10 phút; `admin_find_user`: một dòng `find_user` mỗi lần tìm, không ghi chữ đã tìm). Admin cuối cùng không thể bị hạ/gỡ (`20261016000500`) và không xoá được tài khoản của mình (`20261018090000_db_hardening.sql`, lỗi `last_admin_required`).
- **Test:** `supabase/tests/admin.test.sql`, `admin_staff.test.sql`, `db_hardening.test.sql`, `content_no_leak.test.sql`; `web/routes/admin/*.test.tsx`, `web/routes/admin/staff/StaffPage.test.tsx`, `web/features/admin/*.test.ts(x)`; e2e `admin.spec.ts` (404 cho người học, axe, không cuộn ngang), `admin-staff.spec.ts`.

## 13. Xuất và xoá dữ liệu tài khoản (Spec 7)

- **Route:** Cài đặt, mục "Tài khoản và dữ liệu" (`web/routes/app/settings/AccountDataSection.tsx`), `web/features/account/service.ts`.
- **Database:** `20261014000910_account_data.sql`: `export_my_data()` (giới hạn 5 lần/giờ), `delete_my_account(text)` (cần gõ đúng cụm xác nhận, ghi một dòng ẩn danh vào `account_deletions`), `purge_expired_data()` (chỉ `service_role`, chạy bởi workflow Maintenance cùng `purge_analytics()`). Quy tắc bao phủ của bản xuất: `account_optional_tables()` (bản mới nhất ở `20261017000400_teacher_tools.sql`, thêm `teacher_profiles`, `class_members`, `class_join_attempts` sau ba bảng từ vựng cá nhân của `20261016000300`), xem HANDOFF. Admin cuối cùng không xoá được tài khoản (`20261018090000_db_hardening.sql`, `last_admin_required`).
- **Test:** `supabase/tests/account_data.test.sql`, `account_export_coverage.test.sql`; `web/features/account/service.test.ts`, `account-data-section.test.tsx`; e2e `hardening.spec.ts` (nhóm "account data").

## 14. Quyền riêng tư và điều khoản (Spec 7)

- **Route:** `/quyen-rieng-tu`, `/dieu-khoan` (`web/routes/legal/`, nội dung ở `content.ts`; số ngày lưu trữ lấy từ `web/features/account/retention.ts`); mục "AI và quyền riêng tư" ở Cài đặt (`web/routes/app/settings/AiPrivacySection.tsx`) nói rõ gia sư AI gửi gì tới Gemini gói miễn phí.
- **Bảo mật web đi kèm:** CSP chèn lúc build (`apps/web/build/csp.ts`), `pnpm check:bundle`, gitleaks, kiểm tra biến `VITE_*` (`scripts/check-public-env.mjs`); chi tiết ở [RUNBOOK.md](RUNBOOK.md) mục 7.
- **Test:** `web/routes/legal/legal.test.tsx`, `web/routes/app/settings/ai-privacy-section.test.tsx`; e2e `hardening.spec.ts` (trang pháp lý, axe), `csp.spec.ts`, `a11y.spec.ts`, `a11y-routes.spec.ts`.

## 15. Luyện nói (PRD §6.9)

- **Route:** `/app/luyen-noi` (có trong thanh điều hướng); chế độ "Nhắc lại câu", "Trả lời mở", "Đóng vai" (kịch bản soạn sẵn trong `web/features/speaking/content.ts`, không gọi AI; đóng vai với AI ở mục 16).
- **Web:** `web/routes/app/speaking/` (`SpeakingPage.tsx`, `RepeatMode.tsx`, `OpenMode.tsx`, `RolePlayMode.tsx`, `PracticePanel.tsx`), `web/features/speaking/`. Câu luyện lấy từ bài học trong lộ trình (`useSpeakingMaterial.ts`, tối đa `LESSON_CHOICES_MAX` = 30 bài); không có thì dùng bộ câu mẫu `FALLBACK_SENTENCES`.
- **Ghi âm chỉ trong bộ nhớ:** `useRecorder.ts` dùng `MediaRecorder`, giữ `Blob` sau một object URL, không tải lên và không lưu; tự dừng sau `RECORDING_MAX_MS` = 60 giây; rời trang thì dừng, nhả micro và thu hồi URL. Thiếu `getUserMedia`/`MediaRecorder` hoặc bị từ chối quyền thì màn hình rơi về nghe mẫu và tự luyện.
- **Chép lời là tuỳ chọn:** chỉ bật khi người học tích; dùng Web Speech API của trình duyệt (`useSpeechRecognition.ts`), có thể sai và sửa được; trình duyệt không hỗ trợ thì ẩn. Một số trình duyệt gửi âm thanh tới dịch vụ nhận dạng của chính họ, màn hình có ghi chú về điều này.
- **So từng từ (chỉ là gợi ý):** khi có câu mẫu và bản chép, `align.ts` gióng bản chép với câu mẫu theo thứ tự (edit distance có trọng số) và đánh dấu từng từ: nghe khớp, gần đúng (tiếng Hàn khác tiểu từ/đuôi hoặc lệch nhỏ theo jamo; tiếng Anh thêm đuôi ngắn), nghe thành từ khác, chưa thấy; chữ kana/Hán so theo từng ký tự. `WordFeedback.tsx` hiện mỗi trạng thái bằng biểu tượng, kiểu gạch chân và chữ (không chỉ màu), có tóm tắt cho trình đọc màn hình, và gợi ý tối đa 3 từ để nghe mẫu riêng từ đó (`useTts`). Không có điểm hay tỉ lệ.
- **Tự đánh giá:** năm trục (`RATING_AXES`: độ dễ hiểu, âm mục tiêu, nhịp và ngắt nghỉ, độ trôi chảy, hợp nội dung), mức 1–3, không có điểm tổng. Chỉ điểm tự đánh giá được lưu trong `localStorage` của trình duyệt (`ratings.ts`, khoá `linguo-speaking-v1:<userId>`, tối đa `REFLECTIONS_MAX` = 30 mục), không bao giờ lưu âm thanh hay bản chép, và không gửi gì lên server. Không suy ra trình độ từ một bản ghi.
- **CSP:** `media-src` có thêm `blob:` để phát lại bản ghi (`apps/web/build/csp.ts`, có chú thích; test ở `apps/web/build/csp.test.ts`).
- **Database:** không có migration riêng.
- **Test:** `web/features/speaking/*.test.ts(x)`, `web/routes/app/speaking/speaking.test.tsx`; e2e `speaking.spec.ts` (gồm kiểm không có lời gọi tải lên Supabase storage).

## 16. Đóng vai hội thoại với AI (PRD §8.2 #6)

- **Route:** `/app/dong-vai` (tiêu đề "Đóng vai với AI"): chọn kịch bản, trò chuyện, nhận xét sửa lỗi và tổng kết cuối buổi.
- **Danh mục kịch bản cố định:** `shared/ai/roleplay-catalog.ts` (bảy kịch bản cho mỗi ngôn ngữ en/ko/ja: `cafe_order`, `ask_directions`, `hotel_checkin`, `doctor_visit`, `job_interview`, `shopping_bargain`, `introductions`). Yêu cầu `roleplay_turn` chỉ mang khoá kịch bản; vai và mục tiêu do Edge Function lấy từ chính file này, không bao giờ từ chữ của client (chống prompt injection). File được sao nguyên văn sang `supabase/functions/_shared/roleplay-catalog.ts` bởi `pnpm ai:contract`.
- **Giới hạn:** tối đa `ROLEPLAY_MAX_TURNS` = 12 lượt (lượt 0 là câu mở đầu của đối tác, lượt cuối khép hội thoại); mỗi request gửi tối đa `ROLEPLAY_HISTORY_MAX_TURNS` = 10 lượt gần nhất, mỗi lượt tối đa `ROLEPLAY_TURN_MAX_CHARS` = 300 ký tự; trả lời của đối tác tối đa `ROLEPLAY_REPLY_MAX_CHARS` = 400 ký tự và tối đa `ROLEPLAY_MAX_CORRECTIONS` = 2 sửa lỗi. **Mỗi lượt là một request, trừ một lượt quota AI** (cùng quota ngày với các tác vụ khác). Không cache.
- **Không lưu lịch sử trên server:** hội thoại sống trong state React và `localStorage` (`web/features/roleplay/storage.ts`, khoá `linguo:roleplay:v2:<userId>`, đọc một lần khoá cũ `linguo:roleplay:v1:<userId>` trong `sessionStorage` rồi chuyển sang) để tải lại trang hay đóng tab không mất: cả buổi dở dang lẫn buổi đã kết thúc nhưng chưa xem tổng kết đều được giữ lại (chỉ lưu các lượt đã xác nhận, không lưu lượt đang gửi hay gửi lỗi); hết hạn 24 giờ sau tin nhắn cuối (`ROLEPLAY_TTL_MS`); xoá khi rời buổi hoặc xem xong tổng kết (`discard`/`forgetSaved` trong `useRoleplaySession.ts`), khi đăng xuất và khi xoá tài khoản (`clearAllLocalLearnerData`); chỉ nằm trên thiết bị đó, không đồng bộ sang thiết bị khác; log AI chỉ lưu siêu dữ liệu. Server kiểm đầu ra: trả lời tiếng Hàn phải có Hangul, tiếng Anh không được có Hangul (`supabase/functions/ai-tutor/lib/prompts/roleplay_turn.ts`).
- **Web:** `web/routes/app/roleplay/` (`ScenarioPicker.tsx`, `ChatView.tsx`, `RecapView.tsx`), `web/features/roleplay/` (`session.ts`, `useRoleplaySession.ts`).
- **Database:** `20261016000600_ai_roleplay.sql` (thêm `roleplay_turn` vào danh sách tác vụ của `ai_cache`, `ai_usage`, `ai_reports` và các RPC liên quan).
- **Test:** `supabase/tests/ai_roleplay.test.sql`; Deno `supabase/functions/ai-tutor/lib/prompts/prompts_roleplay_test.ts`; `shared/ai/contract-roleplay.test.ts`; `web/features/roleplay/*.test.ts(x)`, `web/routes/app/roleplay/roleplay.test.tsx`; e2e `roleplay.spec.ts` (mock `roleplay_turn` xác định), quét axe ở `a11y-routes.spec.ts`.

## 17. Từ vựng của tôi (nhập CSV)

Thiết kế đầy đủ: [specs/2026-10-14-linguo-personal-vocab-design.md](superpowers/specs/2026-10-14-linguo-personal-vocab-design.md).

- **Route:** `/app/tu-vung-cua-toi` (danh sách), `/app/tu-vung-cua-toi/:listId` (chi tiết), `/app/tu-vung-cua-toi/:listId/on-tap` (ôn bằng flashcard).
- **Web:** `web/routes/app/vocab/` (`ImportDialog.tsx`, `PersonalListsPage.tsx`, `PersonalListPage.tsx`, `PersonalReviewPage.tsx`, các hộp thoại sửa/xoá), `web/features/personal-vocab/` (service, `outbox.ts`).
- **Chấm offline qua outbox:** điểm `grade_personal_word` không tới được server (mất mạng, timeout, 408/5xx) xếp vào `localStorage` khoá `linguo-personal-outbox-v1:<userId>` (`web/features/personal-vocab/outbox.ts`, dùng chung hạ tầng `openOutbox`/`useOutboxSync` với outbox bài học và ôn tập: cùng trần, backoff và hết hạn 7 ngày) và được `OutboxSyncProvider` gửi lại theo đúng thứ tự với cùng idempotency key khi có mạng lại, khi tab hiện trở lại và mỗi 15 giây (`OUTBOX_SYNC_INTERVAL_MS`). Như outbox bài học và ôn tập, hàng đợi này **được giữ khi đăng xuất** (chỉ xoá khi xoá tài khoản, `web/features/account/service.ts`). Cảnh báo "chưa đồng bộ" khi đăng xuất ở Cài đặt (`web/routes/app/SettingsPage.tsx`) đếm cả ba hàng đợi (câu trả lời bài học, lượt chấm thẻ ôn tập, lượt chấm từ vựng cá nhân qua `outbox.personalVocab.pendingCount`), và nút "Đồng bộ ngay" gửi cả ba.
- **Shared:** `shared/personal-vocab/` (`contract.ts`, `limits.ts`, `csv.ts`): CSV được phân tích hoàn toàn ở trình duyệt (từ chối file trên 1 MiB, nhận dấu `,` `;` tab, tiêu đề song ngữ); chỉ các dòng đã qua xem trước được gửi lên.
- **Giới hạn (`PERSONAL_VOCAB_LIMITS`, trùng với SQL):** 20 danh sách/người, 1000 từ/danh sách, 5000 từ/người, 1000 dòng/lần nhập, 10 lần nhập/giờ, file CSV tối đa 1 MiB (1.048.576 byte).
- **Database:** `20261016000300_personal_vocab.sql`: bảng `personal_word_lists`, `personal_words`, `personal_vocab_imports` (RLS chỉ chủ sở hữu; client chỉ đọc, ghi qua RPC); RPC `list_personal_lists`, `create_personal_list`, `rename_personal_list`, `delete_personal_list`, `import_personal_words`, `update_personal_word`, `delete_personal_word`, `get_personal_review_queue`, `grade_personal_word`.
- **Dùng lại FSRS, tách khỏi tiến độ:** chấm điểm gọi `srs_next`/`srs_previews` hiện có; ôn từ cá nhân không ghi `review_cards`, `review_logs`, mastery, chuỗi ngày, huy hiệu hay analytics (theo ghi chú thiết kế).
- **Xuất và xoá dữ liệu:** ba bảng nằm trong `account_optional_tables()` nên có trong `export_my_data` và bị xoá cùng tài khoản (cascade).
- **Test:** `supabase/tests/personal_vocab.test.sql`, `account_export_coverage.test.sql`; `shared/personal-vocab/*.test.ts`; `web/features/personal-vocab/*.test.ts(x)` (gồm outbox), `web/features/lesson-player/OutboxSyncProvider.test.tsx`, `web/routes/app/vocab/vocab.test.tsx`; e2e `personal-vocab.spec.ts`.

## 18. Quy ước hiệu năng, truy cập và thông báo lỗi

Quy ước áp dụng cho mọi route; nhiều điều trong đó có test hoặc bước CI bắt khi vi phạm.

- **Route tải lazy:** các trang người học và `/quan-tri` tải theo nhu cầu bằng `lazyPage(...)` trong `web/app/router.tsx`.
- **Animation:** `LazyMotion` ở chế độ `strict` (`web/providers/MotionProvider.tsx`), tính năng nạp lười trong `web/providers/motion-features.ts`. Mọi component phải `import { m as motion } from 'motion/react'`; import `motion` đầy đủ sẽ báo lỗi ở dev thay vì lặng lẽ kéo cả thư viện vào bundle đầu.
- **Chunk vendor:** `v-react`, `v-router`, `v-supabase`, `v-zod`, `v-lucide`, `v-lucide-app` (`apps/web/vite.config.ts`, `codeSplitting.groups`).
- **zod ở chế độ `jitless`, giữ trong chunk `v-zod`:** `web/app/zod-config.ts` (import đầu tiên của `main.tsx`). Zod 4 thử `Function('')` ở lần parse object đầu để quyết định có biên dịch parser hay không; CSP không có `'unsafe-eval'` (`apps/web/build/csp.ts`) nên phép thử đó bị báo là vi phạm CSP. `jitless` bỏ phép thử. File được ghim vào cùng chunk `v-zod` để cờ chạy ngay sau zod và trước mọi module tạo schema (commit `ad0ea9d`).
- **Ngân sách kích thước:** `pnpm build` rồi `pnpm check:bundle-size` (`scripts/check-bundle-size.mjs`; CI job `web` chạy sau `check:bundle`). Script đi theo các `import` tĩnh từ `dist/index.html` và fail khi chunk vào (`index-*.js`) vượt 33 KiB gzip, tổng JS tải đầu vượt 240 KiB gzip (`BUDGETS`), hoặc một chunk phải lazy (`LAZY_CHUNKS`: admin, motion-features, các trang lớn) bị import tĩnh. Tăng ngân sách phải có lý do trong commit. Test: `node --test scripts/check-bundle-size.test.mjs` (có trong `pnpm test`).
- **Tiêu đề trang và thông báo chuyển trang:** tên trang khai báo tập trung ở `web/lib/route-titles.ts` (thêm route mới thì thêm vào `ROUTE_NAMES`); `RouteAnnouncer` (`web/components/layout/RouteAnnouncer.tsx`) đặt `document.title`, đọc tên trang bằng vùng live và chuyển focus tới `h1` (hoặc `main`).
- **Màu và trạng thái vô hiệu:** viền ô nhập dùng token `--input-border` (`web/design/tokens.css`, tương phản 3:1, ánh xạ thành `color-input-border` trong `global.css`); điều khiển tự làm dùng `DISABLED_NEUTRAL` và `DISABLED_NEUTRAL_TRACK` (`web/components/ui/disabled-styles.ts`) thay vì giảm độ mờ.
- **Không hiện mã lỗi thô cho người học:** lỗi chưa có thông điệp tiếng Việt riêng dùng `GENERIC_ERROR_MESSAGE` hoặc `genericErrorMessage(code)` (`web/lib/error-fallback.ts`; mã chỉ được `console.debug` ở dev). `ErrorState` mặc định dùng thông điệp này.
- **Bố cục hẹp:** không cuộn ngang ở 320px (e2e `layout.spec.ts`, `a11y-routes.spec.ts`).

## 19. Audio thật cho bài nghe (PRD §19 P2)

Hợp đồng đầy đủ và cách chạy: [AUDIO.md](AUDIO.md).

- **Tạo offline, không bao giờ theo yêu cầu người học:** `scripts/generate-audio.mjs` (`pnpm audio:plan` chỉ in kế hoạch, `pnpm audio:check` đối chiếu YAML với manifest không cần mạng, `pnpm audio:generate` tạo thật) đọc `fallback_text` của bài `listen` và `script` của câu nghe trong đề, gọi Gemini TTS, tải WAV lên Storage rồi ghi `audio_asset_id` thẳng vào YAML. Cần `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` trong shell (tuỳ chọn `GEMINI_TTS_MODEL`); không chạy trong CI. Giọng theo ngôn ngữ ở `VOICES` (en, ko, ja); hội thoại hai người dùng hai giọng.
- **Lưu trữ:** bucket `content-audio` đọc công khai, chỉ `service_role` ghi, không liệt kê được; file ở `<lang>/<audio_asset_id>.wav`. Id `<lang>-<32 hex>` tính từ ngôn ngữ, giọng và văn bản đã chuẩn hoá (`shared/content/audio.ts`: `audioAssetUrl`, `isAudioAssetId`, `AUDIO_ASSET_ID_RE`). Bảng `public.audio_assets` ghi các file đã tải lên (không chứa văn bản, chỉ sha256); bản sao trong repo là `supabase/content-audio-manifest.json` (chưa có cho tới lần tạo đầu tiên).
- **Web:** `web/features/audio/` (`ContentAudio.tsx`, `useContentAudio.ts`, `content-audio.ts`, `sw-audio.ts`), dùng ở bài nghe của bài học, thẻ ôn và đề thi (`playContentAudioOnce` chỉ tính lượt nghe khi đã phát thật). Nút Nghe/Tạm dừng, nghe lại từ đầu, nghe chậm 0,75×, cao tối thiểu 48px; không tải trước lần bấm đầu. Tải lỗi thì hiện "Không phát được bản ghi âm", nút "Thử lại" và rơi về giọng đọc của máy. Service worker giữ tối đa 80 file trong 30 ngày (cache `linguo-content-audio-v1`), nên đoạn đã nghe nghe lại được khi offline.
- **Hiện trạng:** chưa tạo file nào; mọi `audio_asset_id` trong `content/` vẫn là `null`, nên ứng dụng vẫn đọc bằng TTS của trình duyệt (HANDOFF mục 3).
- **Database:** `20261017000200_content_audio.sql` (bucket, `audio_assets`).
- **Test:** `supabase/tests/content_audio.test.sql`; `scripts/generate-audio.test.mjs` (trong `pnpm test`); `shared/content/audio.test.ts`; `web/features/audio/*.test.ts(x)`; e2e `content-audio.spec.ts`.

## 20. Công cụ giáo viên và lớp học (PRD §19 P2 "Công cụ giáo viên")

- **Giáo viên (`/giao-vien`, `/giao-vien/lop/:classId`):** chunk và khung giao diện riêng (`web/routes/teacher/TeacherRoute.tsx`), người học không tải. Chỉ người có dòng `teacher_profiles` dùng được (`is_teacher()`); người khác thấy thông báo không có quyền. Mục "Lớp học (giáo viên)" chỉ hiện trong thanh điều hướng của giáo viên (`TEACHER_NAV_ITEM` trong `web/components/layout/nav.ts`). Tạo, đổi tên và lưu trữ lớp ở `TeacherClassesPage.tsx`. Trang lớp (`TeacherClassPage.tsx`) có ba phần: mã mời (`InviteSection.tsx`: mã 8 ký tự có hạn và giới hạn lượt dùng tuỳ chọn, thu hồi được), bài giao (`AssignmentSection.tsx`: một bài học hoặc đề thi đã xuất bản của ngôn ngữ lớp, hoặc một số lượt ôn; hạn và ghi chú tuỳ chọn) và bảng tổng hợp (`RosterSection.tsx`).
- **Người học (`/app/lop-hoc`, `/app/lop-hoc/tham-gia?ma=CODE`):** `web/routes/app/classes/` (danh sách lớp và bài giao kèm trạng thái hoàn thành, nhập mã, rời lớp có xác nhận, ghi chú quyền riêng tư nói rõ giáo viên thấy gì); thẻ trên trang chủ `web/features/classes/ClassesHomeCard.tsx`. Liên kết mời chỉ điền sẵn mã, người học phải tự bấm tham gia. Bài giao dạng đề thi dẫn tới trang Luyện thi chung.
- **Quyền riêng tư:** giáo viên không đọc bảng của người học; `teacher_class_roster` chỉ trả số liệu tổng hợp cho thành viên hiện tại (chuỗi ngày, phút hoạt động, số bài xong, thẻ đến hạn, tỉ lệ đúng khi ôn, mức hoàn thành bài giao), không bao giờ có đáp án, hội thoại AI, từ vựng cá nhân hay email. Rời lớp xoá dòng thành viên nên giáo viên hết thấy ngay. Bài giao chỉ tính việc làm từ lúc giao.
- **Giới hạn (`TEACHER_LIMITS` trong `shared/teacher/limits.ts`, trùng với SQL):** 30 lớp đang hoạt động/giáo viên, 200 thành viên/lớp, 20 lớp/người học, 10 mã mời còn hiệu lực/lớp, 300 bài giao/lớp, 10 lần nhập mã/giờ (tính cả lần sai; mã sai trả `invalid_code` chứ không báo lỗi), mã mời sống 1–720 giờ (mặc định 7 ngày).
- **Cấp quyền giáo viên:** chưa có giao diện; dùng SQL hoặc `grant_teacher_role(p_user_id, p_grant)` bằng phiên của admin (DEPLOY.md, mục "Giáo viên").
- **Database:** `20261017000400_teacher_tools.sql`: bảng `teacher_profiles`, `classes`, `class_members`, `class_invites`, `class_join_attempts`, `assignments`; RPC `teacher_*` (lớp, mã mời, bài giao, `teacher_class_roster`), `learner_join_class`, `learner_leave_class`, `learner_list_classes`, `learner_list_assignments`, `grant_teacher_role`, `is_teacher`. Ba bảng của người dùng vào `account_optional_tables()`; lớp của giáo viên là phần `teacher_classes` của bản xuất.
- **Test:** `supabase/tests/teacher.test.sql`, `account_export_coverage.test.sql`; `shared/teacher/contract.test.ts`; `web/features/teacher/teacher.test.ts`, `web/features/classes/*.test.ts`, `web/routes/teacher/teacher.test.tsx`, `web/routes/app/classes/classes.test.tsx`; e2e `teacher.spec.ts`, `classes.spec.ts`.

## 21. Tiếng Nhật (ngôn ngữ thứ ba)

- **Bật cho người học:** `LANGUAGES.ja.available = true` (`shared/constants.ts`); onboarding, lộ trình, kiểm tra đầu vào, luyện thi, luyện nói, đóng vai, từ vựng cá nhân và lớp học đều nhận `ja`.
- **Cấp độ và mục tiêu:** `kana` (ordinal 0) rồi `n5`, `n4`, `n3`, `n2`, `n1`; mục tiêu `kana_basics`, `communication`, `jlpt`, `skill_focus`. Giờ tham chiếu cho ja ước lượng theo FSI (ngôn ngữ nhóm IV), chưa kiểm duyệt.
- **Trần nội dung:** `CONTENT_MAX_LEVEL` (`shared/learning/levels.ts`; en `c2`, ko `topik6`, ja `n3`) là cấp cao nhất có chương trình. Cấp trên trần (`n2`, `n1`) vẫn là mã hợp lệ trong DB, kho kiểm tra và đề thi, nhưng `availableLevels`/`allowedTargets` không đưa ra làm trình độ hiện tại hay mục tiêu (onboarding `StepCurrentLevel`/`StepGoal`, `settings/PathPlanEditor`), `createPathSchema`/`updatePlanSchema` từ chối, và người học đang ở N3 thấy "Linguo hiện có bài học tới JLPT N3…" (`web/features/learning-paths/content-ceiling.ts`). Báo cáo kiểm tra đầu vào hạ mọi cấp trên trần về N3 (`clampReportToContent`, `web/routes/app/diagnostic/labels.ts`) kèm một dòng giải thích; việc áp dụng xếp lớp trên server vẫn so cấp gốc với mục tiêu (luôn ≤ N3) nên kết quả như nhau. `pnpm content:check` báo lỗi khi một chương trình có `level_to` trên trần, và `scripts/content-import.test.mjs` kiểm tra trần bằng `level_to` cao nhất của chương trình đã xuất bản: thêm N2 = thêm `content/ja/programs/n2` rồi nâng `CONTENT_MAX_LEVEL.ja`. Chỉ chặn ở client: RPC `create_learning_path`/`update_learning_path_plan` vẫn nhận `n2`/`n1` nếu bị gọi trực tiếp (HANDOFF mục 3).
- **Nội dung:** `content/ja/programs/` gồm `kana-basics` (Kana → N5, 30 bài), `n4` (20 bài), `n3` (25 bài); `content/ja/items/` (loại `kana` cho Hiragana/Katakana; `front.reading` là furigana, `front.romanization` theo Hepburn chỉ để tham khảo); kho kiểm tra đầu vào `content/diagnostic/ja/` (90 câu, 6 cấp); đề `content/exams/ja/jlpt-n5-mock-1.yaml`, `jlpt-n4-mock-1.yaml`, `jlpt-n3-mock-1.yaml` (họ đề `jlpt`, chấm và xếp bậc như đề TOPIK đầy đủ, `verified: true`). Quy ước soạn: [content/README.md](../content/README.md) mục "Tiếng Nhật". Chưa có nội dung N2/N1.
- **Luyện nói, đóng vai, giọng máy:** câu mẫu, đề trả lời mở và kịch bản đóng vai soạn sẵn tiếng Nhật trong `web/features/speaking/content.ts`; bảy kịch bản đóng vai AI ja trong `shared/ai/roleplay-catalog.ts` (mục 16); prompt của `ai-tutor` xử lý tiếng Nhật; TTS trình duyệt dùng `ja-JP` (`web/features/exam/tts.ts`). Tên tiếng Việt của 14 dạng câu `jlpt_*` ở `web/routes/app/exam/components/labels.ts`.
- **Chấm đáp án:** dùng chung `shared/content/grading.ts` (SQL `grading_normalize`, `20261018140000_ja_grading_whitespace.sql`); với đáp án `ja`, chuẩn hoá bỏ `、` `。` cùng dấu câu khác rồi bỏ mọi khoảng trắng (kể cả U+3000), nên `はい、そうです。`, `はい そうです` và `はいそうです` đều đúng mà không cần khai biến thể (HANDOFF mục 3).
- **Database:** `20261018130000_japanese.sql` (CHECK `en|ko|ja`, giờ tham chiếu, mục tiêu, họ đề `jlpt`, bài kiểm tra `ja:assessment:diagnostic:v1`; tạo lại `learning_path_validate`, `create_personal_list`, `exam_structure_warning`, `exam_build_result`, `list_exam_forms`, `diagnostic_level_code`). Chú thích đầu file nói ja còn bị ẩn: đã cũ.
- **Test:** `supabase/tests/japanese.test.sql`; `shared/japanese.test.ts`; `scripts/content-import.test.mjs` (đề JLPT thật); `web/routes/app/exam/components/labels.test.ts`; unit test onboarding và `LanguagePill` đếm đủ ba ngôn ngữ; trần nội dung: `shared/learning/levels.test.ts`, `web/routes/app/onboarding/content-ceiling.test.tsx`, `web/routes/app/diagnostic/labels.test.ts`, `web/features/learning-paths/content-ceiling.test.ts`.
