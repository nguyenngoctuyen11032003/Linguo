# Bàn giao Linguo

Tài liệu cho người (hoặc phiên làm việc) tiếp quản: trạng thái từng spec, các quyết định đã chốt (kèm nơi kiểm chứng trong code) và việc còn mở. Bản đồ tính năng chi tiết: [docs/FEATURES.md](../FEATURES.md). Cách deploy và vận hành: [DEPLOY.md](../DEPLOY.md), [RUNBOOK.md](../RUNBOOK.md), [SETUP.md](../SETUP.md).

Viết tắt đường dẫn: `web/` = `apps/web/src/`, `shared/` = `packages/shared/src/`; số migration rút gọn như `000200_...` nằm trong `supabase/migrations/` với tiền tố `20261014` hoặc `20261015` theo cùng dòng.

## 1. Trạng thái từng spec

Tất cả spec dưới đây đã được triển khai trên `main` và deploy lên production (các migration đều có trong `supabase/migrations-applied.json`). Thiết kế gốc ở `docs/superpowers/specs/`, kế hoạch ở `docs/superpowers/plans/` (không phải spec nào cũng có kế hoạch riêng).

| Spec | Chủ đề | Nằm ở đâu | Migration chính |
|---|---|---|---|
| 0 | Nền móng: tài khoản, RLS, CI/CD, giao diện | `apps/web`, `.github/workflows/`, `supabase/migrations` | `20261013000100_foundation.sql` |
| 1 | Onboarding, lộ trình, ước lượng thời gian | `web/routes/app/onboarding`, `web/features/learning-paths`, `shared/learning` | `20261013000200_learning_paths.sql` |
| 2 | Nội dung và trình học bài, outbox offline | `content/`, `web/features/lesson-player`, `shared/content`, `scripts/content-import.mjs` | `20261014000100_content.sql`, `000200_lesson_runs.sql`, `000600_spec2_sync.sql` |
| 3 | Flashcard và FSRS | `web/features/reviews`, `shared/review` | `20261014000300` đến `000330` |
| 4 | Kiểm tra đầu vào thích ứng | `web/features/diagnostic`, `shared/diagnostic`, `content/diagnostic` | `20261014000400` đến `000430` |
| 5 | Gia sư AI (Gemini) | `supabase/functions/ai-tutor`, `web/features/ai-tutor`, `web/components/ai`, `shared/ai` | `20261014000500_ai_gateway.sql`, `20261015000700_ai_review_writing.sql` |
| 6 | Kế hoạch phiên học | `web/features/session`, `session-link`, `shared/planner` | `20261014000900_session_planner.sql` |
| 7 | Hoàn thiện trước ra mắt: xuất/xoá dữ liệu, quyền riêng tư, CSP, quét secret, runbook | `web/features/account`, `web/routes/legal`, `apps/web/build/csp.ts`, `.github/workflows/maintenance.yml` | `20261014000910_account_data.sql` |
| 8 | Tiến độ, động lực, analytics nội bộ | `web/features/progress`, `web/features/analytics`, `shared/progress` | `20261015000100_progress.sql`, `000110_analytics.sql` |
| 9 | Luyện thi TOPIK/CEFR (gồm nhận xét AI cho bài viết) | `web/features/exam`, `shared/exam`, `content/exams` | `20261015000200_exams.sql` |
| 10 | Nhắc học, báo cáo tuần, Web Push, PWA | `web/features/notifications`, `web/features/pwa`, `web/sw.ts`, `supabase/functions/notify-dispatch`, `.github/workflows/notify.yml` | `20261015000300_reminders.sql` |
| 11 | Báo lỗi nội dung và khu quản trị `/quan-tri` | `web/routes/admin`, `web/features/admin`, `web/features/content-reports`, `shared/admin` | `20261015000400_content_reports.sql`, `000410_admin.sql`, `000420_import_keep_published.sql` |

Các migration sửa lỗi sau khi ra mắt: `20261015000500_timezone_cooldown.sql`, `20261015000600_review_grade_guard.sql`, `20261015000610_export_exam_data.sql`, `20261015000800_answer_integrity.sql` (xem mục 2).

Nội dung học: toàn bộ `content/` ghi `status: published`; người duyệt là AI do chủ dự án uỷ quyền, chưa qua giáo viên bản ngữ (`content/README.md`). Khi có người duyệt thật, cập nhật `reviewed_by`/`reviewed_at` trong YAML và chạy lại **Publish content**.

## 2. Quyết định và quy tắc cần giữ

- **Không sửa migration đã deploy.** Supabase áp mỗi file một lần; sửa file làm project hosted và `db reset` lệch nhau. `supabase/migrations-applied.json` + `scripts/check-migrations-immutable.mjs` (chạy trong CI và `pnpm test`) chặn việc này. Sửa tiến bằng migration mới có số **lớn hơn** migration cuối đã áp, rồi `--record` sau khi Deploy xanh (DEPLOY.md, *Quy tắc an toàn database*).
- **Quy tắc `client_at` và phiên bản đáp án (`20261015000800_answer_integrity.sql`, test `supabase/tests/answer_integrity.test.sql`):**
  - `submit_exercise` bỏ qua `p_client_at` trước thời điểm bắt đầu lượt học (`lesson_runs.started_at`): câu trả lời tính vào ngày của server; `client_at` ở tương lai bị kẹp về `now`. Vì thế không thể trả lời hôm nay rồi gán ngày hôm qua để vá chuỗi ngày hoặc lấy lại trần XP. Câu trả lời offline thật vẫn giữ đúng ngày vì lượt học đã tồn tại lúc đó.
  - Chỉ khoá đáp án hiện hành được dùng để chấm. Khoá cũ chỉ được chấp nhận cho câu trả lời offline được trả lời **trước** khi khoá hiện hành được tạo (`client_at < created_at` của khoá hiện hành). Còn lại trả `exercise_version_mismatch`, mà trình học đã xử lý bằng cách tải lại bài.
  - Các tính toán theo ngày khác (`progress_*`) vẫn kẹp `client_at` vào khoảng [ngày server − 7, ngày server] (`20261015000100_progress.sql`); quy tắc trên chặt hơn cho `submit_exercise`.
- **Cooldown múi giờ (`20261015000500_timezone_cooldown.sql`, test `timezone_cooldown.test.sql`):** mọi giới hạn theo ngày (quota AI, giới hạn thẻ mới, trần XP, chuỗi ngày) dựa vào múi giờ trong `profiles.timezone`. Người học đổi múi giờ tối đa **một lần mỗi 24 giờ** (trigger `profiles_timezone_cooldown`, lỗi `timezone_change_cooldown`); lần đổi đầu luôn được; `service_role` và migration không bị giới hạn.
- **Quy tắc bao phủ bản xuất dữ liệu:** `export_my_data()` xuất các phần cố định cộng mọi bảng trong `account_optional_tables()` (bản hiện hành nằm trong `20261015000610_export_exam_data.sql`: `study_sessions`, `activity_days`, `user_badges`, `analytics_events`, `exam_attempts`, `exam_answers`, `content_reports`, `notification_prefs`, `notifications`). Test `supabase/tests/account_export_coverage.test.sql` fail khi có bảng public mới có cột `user_id` mà không được xuất và cũng không nằm trong danh sách loại trừ có lý do. Thêm bảng người dùng mới thì phải thêm vào `account_optional_tables()` bằng một migration mới (hàm này được `create or replace` lại mỗi lần).
- **`push_subscriptions` không nằm trong bản xuất** (loại trừ có chủ đích trong test trên, cùng `account_export_requests` và `staff_roles`): endpoint và khoá của thiết bị là thông tin xác thực, không có giá trị học tập; bị xoá cùng tài khoản.
- **Điểm thi TOPIK/CEFR chỉ là luyện tập trừ khi `scoring.verified`:** thang điểm là dữ liệu có phiên bản trong từng đề (`scoring` trong `content/exams/**`, schema `examScoringSchema`). Mọi đề mang nhãn "Bài luyện mô phỏng — không phải đề thi chính thức"; khi `scoring_verified = false` kết quả hiện cảnh báo chưa đối chiếu (`UNVERIFIED_SCORING_LABEL`) và ghi "Nguồn thang điểm". Mini mock được quy đổi tuyến tính và gắn nhãn "quy đổi tham khảo". CEFR không quy đổi điểm. Hiện hai đề TOPIK có `verified: true`, đề CEFR A2 có `verified: false`. Chỉ đổi `verified` sau khi người duyệt đối chiếu quy chế hiện hành.
- **Tính năng AI luôn ghi là phản hồi luyện tập:** nhận xét bài viết hiện "Phản hồi luyện tập — không phải điểm chính thức" (`WRITING_FEEDBACK_LABEL`); AI không sinh câu hỏi trong lúc thi; log AI chỉ lưu siêu dữ liệu, không lưu nội dung câu hỏi hay bài viết.
- **Ước lượng thời gian học là tham khảo:** bảng `level_reference_hours` có `reviewed = false` và giao diện luôn nói rõ.
- **Nội dung không sửa trong database:** nguồn sự thật là `content/` trong repo; trang quản trị chỉ xem trước, đổi trạng thái duyệt và xử lý báo lỗi. Import lại không hạ trạng thái một dòng không đổi nội dung (`000420_import_keep_published.sql`).
- **Admin cấp vai trò:** bootstrap bằng SQL; `admin_grant_role` chưa có giao diện (DEPLOY.md, *Quản trị nội dung*).
- **Không đặt secret vào `VITE_*`:** `scripts/check-public-env.mjs`, `scripts/check-bundle-secrets.mjs`, gitleaks (CI) chặn.

## 3. Giới hạn đã biết

- Nghe: chưa có file audio thật. Toàn bộ `audio_asset_id` trong `content/` là `null`; bài `listen` và phần nghe của đề dùng `fallback_text`/`script` đọc bằng giọng máy (TTS của trình duyệt, `web/features/exam/tts.ts`). Kiểm tra đầu vào tự bỏ qua kỹ năng nghe (`not_supported`).
- Luyện nói, nhận dạng giọng nói, viết/nói trong kiểm tra đầu vào: chưa làm, và không bao giờ được suy ra trình độ từ chúng.
- Gemini gói miễn phí: hết quota ngày làm AI tạm ngừng cho tới khi Google reset; circuit breaker nằm trong bộ nhớ từng instance (RUNBOOK mục 6).
- Hai RPC dọn dữ liệu `purge_analytics()` (180 ngày) và `purge_notifications()` (90 ngày) **chưa được lên lịch**: workflow Maintenance chỉ gọi `purge_expired_data` (không gồm hai hàm này). Trang quyền riêng tư (`web/features/account/retention.ts`) hiện chỉ cam kết thời hạn của dữ liệu AI. Cần nối vào `purge_expired_data` bằng migration mới hoặc chạy tay định kỳ (DEPLOY.md, *Bảo trì dữ liệu*).
- Maintenance và Deploy chờ duyệt vì environment `production` bật Required reviewers; run Maintenance theo lịch không được duyệt sẽ hết hạn (dữ liệu chỉ dọn muộn hơn).
- Notify dựa vào cron của GitHub Actions: lượt đến muộn quá cửa sổ 15 phút làm lỡ khung nhắc đó.
- CSP đặt bằng thẻ `<meta>` (GitHub Pages không cho đặt header): `frame-ancestors`, báo cáo vi phạm không có tác dụng (RUNBOOK mục 7).
- Nội dung chưa qua giáo viên bản ngữ (mục 1).
- Test pgTAP và e2e chạy trong CI; local cần Docker (SETUP.md). Chưa có test trên thiết bị thật tự động: dùng `docs/MOBILE-QA.md`.
- Một số ghi chú mặc định lỗi thời ngoài tài liệu này: `.env.example` và `supabase/functions/.env.example` vẫn ghi `GEMINI_MAX_OUTPUT_TOKENS=1200` trong khi mặc định thật là `2048` (`supabase/functions/ai-tutor/handler.ts`); các spec cũ trong `docs/superpowers/specs` cũng nhắc 1200.

## 4. Việc còn mở

- **Đóng vai hội thoại bằng AI (roleplay):** có trong PRD (`roleplay`, `POST /api/ai/roleplay/turn`) nhưng spec 5 loại khỏi phạm vi; chưa có tác vụ nào trong `AI_TASKS`.
- **Bài nghe có audio thật** (thu âm hoặc TTS phía server, lưu `audio_asset_id`): schema và player đã có chỗ cho `audio_asset_id`, nội dung chưa dùng.
- **OCR từ tài liệu:** không nằm trong kế hoạch; PRD chỉ nói "sau import danh sách từ cá nhân/CSV mới xem xét OCR" (mục P2).
- Các mục P2 khác của PRD (nhận dạng giọng nói, công cụ giáo viên): chưa có spec.
- Lên lịch cho `purge_analytics`/`purge_notifications` (mục 3).
- Giao diện cho `admin_grant_role` nếu cần quản lý nhiều nhân sự.
- Duyệt nội dung và thang điểm đề thi bởi người có chuyên môn; đối chiếu `scoring` của đề CEFR.
- Thử khôi phục backup và rollback web theo RUNBOOK mục 1–3 và ghi vào "Nhật ký diễn tập".
