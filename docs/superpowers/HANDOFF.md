# Bàn giao Linguo

Tài liệu cho người (hoặc phiên làm việc) tiếp quản: trạng thái từng spec, các quyết định đã chốt (kèm nơi kiểm chứng trong code) và việc còn mở. Bản đồ tính năng chi tiết: [docs/FEATURES.md](../FEATURES.md). Cách deploy và vận hành: [DEPLOY.md](../DEPLOY.md), [RUNBOOK.md](../RUNBOOK.md), [SETUP.md](../SETUP.md).

Viết tắt đường dẫn: `web/` = `apps/web/src/`, `shared/` = `packages/shared/src/`; số migration rút gọn như `000200_...` nằm trong `supabase/migrations/` với tiền tố `20261014` đến `20261018` theo cùng dòng. Danh sách đầy đủ ở mục 5.

## 1. Trạng thái từng spec

Tất cả spec và đợt bổ sung dưới đây đã được triển khai trong code (đợt P2 cuối bảng: trên nhánh tích hợp `integrate/p2-batch`, chưa merge vào `main` và chưa deploy tại thời điểm viết). Tại thời điểm viết, 34 trên 41 migration trong `supabase/migrations/` đã được ghi vào `supabase/migrations-applied.json`; bảy file chưa được ghi (`20261016000700`, `20261016000800`, `20261017000200`, `20261017000400`, `20261017000500`, `20261018090000`, `20261018130000`, xem mục 5). Việc ghi vào file đó là bước tay sau khi job `migrate` của Deploy xanh, nên một migration mới thêm sau tài liệu này có thể chưa được ghi: kiểm tra lại bằng lệnh ở mục 5. Thiết kế gốc ở `docs/superpowers/specs/`, kế hoạch ở `docs/superpowers/plans/` (không phải spec nào cũng có kế hoạch riêng).

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

**Đợt bổ sung sau Spec 11** (PRD §6.9, §8.2, §19 P2 và gia cố sau rà soát; chi tiết từng mục ở [FEATURES.md](../FEATURES.md) mục 6, 8, 9, 12, 15–18):

| Hạng mục | Nằm ở đâu | Migration |
|---|---|---|
| Luyện thi tính vào chuỗi ngày và tiến độ (XP luôn 0), có backfill | `exam_close_attempt`, cột `exam_attempts.activity_counted_at` | `20261016000100_exam_activity.sql` |
| Tác vụ AI `analyze_sentence`, `summarize_session`, `plan_review` | `supabase/functions/ai-tutor/lib/prompts/`, `web/components/ai/AiMoreViews.tsx`, trang gia sư, phiên học, Tiến độ | `20261016000200_ai_more_tasks.sql` |
| Từ vựng cá nhân (nhập CSV, ôn FSRS) | `web/features/personal-vocab`, `web/routes/app/vocab`, `shared/personal-vocab` | `20261016000300_personal_vocab.sql` |
| Gia cố nhắc học và Web Push | `supabase/functions/notify-dispatch`, `web/features/notifications`, `web/features/pwa/sw-click.ts` | `20261016000400_notify_hardening.sql` |
| Gia cố quản trị nội dung, báo lỗi, quy tắc `client_at` (48 giờ, sau đó siết còn 12 giờ ở `000800`) | `supabase/migrations`, `supabase/tests/admin.test.sql` | `20261016000500_content_admin_hardening.sql` |
| Đóng vai hội thoại với AI (`roleplay_turn`, danh mục kịch bản) | `shared/ai/roleplay-catalog.ts`, `web/features/roleplay`, `web/routes/app/roleplay` | `20261016000600_ai_roleplay.sql` |
| Báo lỗi kỹ thuật ẩn danh (sự kiện analytics `client_error`, bảng "Lỗi phía người dùng" ở `/quan-tri/thong-ke`) | `web/lib/error-reporting.ts`, `web/routes/RouteError.tsx`, RUNBOOK mục 9 | `20261016000700_client_errors.sql` |
| Gia cố sau rà soát bảo mật: ngày hoạt động của luyện thi theo lúc lưu đáp án, chặn giả thời gian hoạt động, `client_at` 12 giờ, gia cố nhập từ vựng cá nhân | `supabase/tests/answer_integrity.test.sql`, `web/features/personal-vocab/service.ts` | `20261016000800_progress_vocab_hardening.sql` |
| Luyện nói (ghi âm trong bộ nhớ, chép lời tuỳ chọn, tự đánh giá) | `web/features/speaking`, `web/routes/app/speaking` | không có migration |
| Hiệu năng (route lazy, `LazyMotion`, chunk vendor, ngân sách kích thước) | `apps/web/vite.config.ts`, `scripts/check-bundle-size.mjs` | không có migration |
| UX và truy cập (tiêu đề route, thông báo chuyển trang, token viền, thông báo lỗi chung, trang Học tập, hoàn tác phiên học) | xem mục 2 | không có migration |
| Smoke production | `scripts/smoke.mjs`, `.github/workflows/smoke.yml` | không có migration |
| Gia cố database sau rà soát bảo mật: index `attempts.learning_path_id`, admin cuối cùng không xoá được tài khoản (`last_admin_required`), người học không đọc được `content_reports.resolved_by` | `supabase/tests/db_hardening.test.sql` | `20261018090000_db_hardening.sql` |

**Đợt P2 (PRD §19 P2: công cụ giáo viên, audio, ngôn ngữ thứ ba, quản lý nhân sự; chi tiết ở [FEATURES.md](../FEATURES.md) mục 12, 19–21):**

| Hạng mục | Nằm ở đâu | Migration |
|---|---|---|
| Trang Nhân sự `/quan-tri/nhan-su` (admin): danh sách nhân sự kèm email, tìm tài khoản theo email hoặc id, cấp/đổi/thu hồi vai trò qua `admin_grant_role`; thanh menu quản trị cuộn ngang một hàng dưới `lg` | `web/routes/admin/staff/`, `web/features/admin/staff.ts`, `useAdminStaff.ts`, `shared/admin/contract.ts` | `20261017000500_admin_staff.sql` |
| Audio thật cho bài nghe: bucket `content-audio`, bảng `audio_assets`, script tạo audio offline bằng Gemini TTS, trình phát có cache offline và giọng máy dự phòng | `scripts/generate-audio.mjs`, `shared/content/audio.ts`, `web/features/audio/`, [docs/AUDIO.md](../AUDIO.md) | `20261017000200_content_audio.sql` |
| Công cụ giáo viên: khu `/giao-vien` (lớp, mã mời, bài giao, bảng tổng hợp lớp) và lớp học của người học `/app/lop-hoc` | `web/routes/teacher/`, `web/features/teacher/`, `web/routes/app/classes/`, `web/features/classes/`, `shared/teacher/` | `20261017000400_teacher_tools.sql` |
| Tiếng Nhật (ngôn ngữ thứ ba, `LANGUAGES.ja.available = true`): chương trình Kana → N5, N4, N3, kho kiểm tra đầu vào, đề JLPT N5/N4/N3, kịch bản đóng vai và tài liệu luyện nói | `content/ja/`, `content/diagnostic/ja/`, `content/exams/ja/`, `shared/constants.ts`, `shared/ai/roleplay-catalog.ts`, `web/features/speaking/content.ts` | `20261018130000_japanese.sql` |

Nội dung học: toàn bộ `content/` ghi `status: published`; người duyệt là AI do chủ dự án uỷ quyền, chưa qua giáo viên bản ngữ (`content/README.md`). Nội dung tiếng Nhật cũng vậy (cùng người duyệt AI); kịch bản đóng vai và tài liệu luyện nói tiếng Nhật nằm trong code và chưa được người bản ngữ xem. Khi có người duyệt thật, cập nhật `reviewed_by`/`reviewed_at` trong YAML và chạy lại **Publish content**.

## 2. Quyết định và quy tắc cần giữ

- **Không sửa migration đã deploy.** Supabase áp mỗi file một lần; sửa file làm project hosted và `db reset` lệch nhau. `supabase/migrations-applied.json` + `scripts/check-migrations-immutable.mjs` (chạy trong CI và `pnpm test`) chặn việc này. Sửa tiến bằng migration mới có số **lớn hơn** migration cuối đã áp, rồi `--record` sau khi Deploy xanh (DEPLOY.md, *Quy tắc an toàn database*).
- **Quy tắc `client_at` và phiên bản đáp án (`20261015000800_answer_integrity.sql`, test `supabase/tests/answer_integrity.test.sql`):**
  - `submit_exercise` bỏ qua `p_client_at` trước thời điểm bắt đầu lượt học (`lesson_runs.started_at`): câu trả lời tính vào ngày của server; `client_at` ở tương lai bị kẹp về `now`. Vì thế không thể trả lời hôm nay rồi gán ngày hôm qua để vá chuỗi ngày hoặc lấy lại trần XP. Câu trả lời offline thật vẫn giữ đúng ngày vì lượt học đã tồn tại lúc đó.
  - Chỉ khoá đáp án hiện hành được dùng để chấm. Khoá cũ chỉ được chấp nhận cho câu trả lời offline được trả lời **trước** khi khoá hiện hành được tạo (`client_at < created_at` của khoá hiện hành). Còn lại trả `exercise_version_mismatch`, mà trình học đã xử lý bằng cách tải lại bài.
  - `20261016000500_content_admin_hardening.sql` đã giới hạn `client_at` trong 48 giờ; `20261016000800_progress_vocab_hardening.sql` siết thêm và thay quy tắc đó (xem `supabase/tests/answer_integrity.test.sql`): `client_at` chỉ được giữ khi không trước lúc bắt đầu lượt học, nằm trong **12 giờ gần nhất**, không ở tương lai, và không sớm hơn quá 5 phút so với lần trả lời gần nhất đã lưu của lượt học (thời điểm hiệu lực = `coalesce(client_at, created_at)`). Thời gian hoạt động mỗi câu được tính tối đa `min(response_ms, 120 giây, max(2 giây, khoảng cách phía server), thời gian thực từ lúc bắt đầu lượt học)`. Hệ quả: học ngoại tuyến quá 12 giờ rồi đồng bộ sẽ được tính vào ngày đồng bộ.
  - Các tính toán theo ngày khác (`progress_*`) vẫn kẹp `client_at` vào khoảng [ngày server − 7, ngày server] (`20261015000100_progress.sql`); quy tắc trên chặt hơn cho `submit_exercise`.
- **Cooldown múi giờ (`20261015000500_timezone_cooldown.sql`, test `timezone_cooldown.test.sql`):** mọi giới hạn theo ngày (quota AI, giới hạn thẻ mới, trần XP, chuỗi ngày) dựa vào múi giờ trong `profiles.timezone`. Người học đổi múi giờ tối đa **một lần mỗi 24 giờ** (trigger `profiles_timezone_cooldown`, lỗi `timezone_change_cooldown`); lần đổi đầu luôn được; `service_role` và migration không bị giới hạn.
- **Quy tắc bao phủ bản xuất dữ liệu:** `export_my_data()` xuất các phần cố định cộng mọi bảng trong `account_optional_tables()` (bản hiện hành nằm trong `20261017000400_teacher_tools.sql`: `study_sessions`, `activity_days`, `user_badges`, `analytics_events`, `exam_attempts`, `exam_answers`, `content_reports`, `notification_prefs`, `notifications`, `personal_word_lists`, `personal_words`, `personal_vocab_imports`, `teacher_profiles`, `class_members`, `class_join_attempts`; lớp do giáo viên tạo nằm ở phần riêng `teacher_classes`, không kèm id thành viên). Test `supabase/tests/account_export_coverage.test.sql` fail khi có bảng public mới có cột `user_id` mà không được xuất và cũng không nằm trong danh sách loại trừ có lý do. Thêm bảng người dùng mới thì phải thêm vào `account_optional_tables()` bằng một migration mới (hàm này được `create or replace` lại mỗi lần).
- **`push_subscriptions` không nằm trong bản xuất** (loại trừ có chủ đích trong test trên, cùng `account_export_requests` và `staff_roles`): endpoint và khoá của thiết bị là thông tin xác thực, không có giá trị học tập; bị xoá cùng tài khoản.
- **Điểm thi TOPIK/JLPT/CEFR chỉ là luyện tập trừ khi `scoring.verified`:** thang điểm là dữ liệu có phiên bản trong từng đề (`scoring` trong `content/exams/**`, schema `examScoringSchema`). Mọi đề mang nhãn "Bài luyện mô phỏng — không phải đề thi chính thức"; khi `scoring_verified = false` kết quả hiện cảnh báo chưa đối chiếu (`UNVERIFIED_SCORING_LABEL`) và ghi "Nguồn thang điểm". Mini mock được quy đổi tuyến tính và gắn nhãn "quy đổi tham khảo". CEFR không quy đổi điểm. Hiện hai đề TOPIK và ba đề JLPT (N5, N4, N3) có `verified: true`, đề CEFR A2 có `verified: false`. Chỉ đổi `verified` sau khi người duyệt đối chiếu quy chế hiện hành.
- **Luyện thi tính vào chuỗi ngày nhưng không cho XP (`20261016000100_exam_activity.sql`, test `exam_activity.test.sql`):** mỗi lượt thi được cộng vào `activity_days` đúng một lần khi đóng, cờ `exam_attempts.activity_counted_at`; thời gian hoạt động tính từ khoảng cách giữa các lần lưu đáp án (mỗi khoảng tối đa 120 giây); XP, bài học và lượt ôn đều 0. Backfill chạy ngay trong migration.
- **Từ vựng cá nhân tách khỏi nội dung chuẩn và khỏi tiến độ:** bảng riêng, RLS chủ sở hữu, ghi qua RPC; ôn dùng lại `srs_next` nhưng không chạm `review_cards`/`review_logs`/mastery/chuỗi ngày/huy hiệu/analytics, nên không thể bơm XP hay mastery từ nội dung tự nhập (thiết kế: `docs/superpowers/specs/2026-10-14-linguo-personal-vocab-design.md`). Có đủ giới hạn ở `PERSONAL_VOCAB_LIMITS`.
- **Đóng vai AI không lưu hội thoại phía server:** `roleplay_turn` không cache, mỗi lượt trừ một lượt quota, vai và mục tiêu lấy từ `shared/ai/roleplay-catalog.ts` (không từ client), hội thoại chỉ ở state React và `localStorage` của trình duyệt theo từng người dùng (`linguo:roleplay:v2:<userId>`; giữ cả buổi đã kết thúc cho tới khi xem xong tổng kết; hết hạn 24 giờ sau tin nhắn cuối, xoá khi rời buổi, xong tổng kết, đăng xuất hoặc xoá tài khoản), tối đa 12 lượt (`ROLEPLAY_MAX_TURNS`).
- **Outbox offline giữ khi đăng xuất, xoá khi xoá tài khoản:** ba hàng đợi bài học (`linguo-outbox-v1:<userId>`), ôn tập (`linguo-review-outbox-v1:<userId>`) và từ vựng cá nhân (`linguo-personal-outbox-v1:<userId>`) đều theo quy tắc này (`SIGN_OUT_KEEP_PREFIXES` trong `web/features/account/service.ts`), để câu trả lời/lượt chấm chưa gửi còn được đồng bộ ở lần đăng nhập sau trên cùng thiết bị.
- **Luyện nói riêng tư:** âm thanh chỉ trong bộ nhớ trình duyệt, không tải lên; bản chép (Web Speech API) là tuỳ chọn và có thể sai; chỉ điểm tự đánh giá 1–3 được giữ trong `localStorage`; không suy ra trình độ từ một bản ghi. CSP `media-src` có `blob:` chỉ để phát lại bản ghi (`apps/web/build/csp.ts`).
- **Gia cố nhắc học và push (`20261016000400_notify_hardening.sql`):** danh sách cho phép host push (chống SSRF qua `notify-dispatch`), gửi thử lại trong 4 giờ, cửa sổ bù 60 phút, nội dung push chung chung (không tên bài, số thẻ), xoá subscription chỉ khi push service từ chối danh tính của ta nhiều lần (401/403, 10 lần) hoặc trả 404/410, `purge_notifications` chạy mỗi đêm trong `notify-dispatch`, đăng xuất giải phóng subscription của thiết bị, bấm thông báo không bao giờ điều hướng cửa sổ đang mở. Chi tiết: FEATURES mục 9, DEPLOY mục "Nhắc học & Web Push".
- **Gia cố quản trị nội dung (`20261016000500_content_admin_hardening.sql`):** báo lỗi trùng chỉ khi cùng lý do, cùng phiên bản và chưa xử lý; import không tự duyệt/xuất bản dòng còn báo lỗi chưa xử lý; không gỡ hay hạ admin cuối cùng; nhật ký quản trị chỉ thêm; đọc đáp án để lại nhật ký.
- **Hiệu năng là ràng buộc của CI:** route lazy, `LazyMotion` strict (`import { m as motion } from 'motion/react'`), chunk vendor và ngân sách `pnpm check:bundle-size` (chunk vào 33 KiB gzip, tải đầu 240 KiB gzip). `web/app/zod-config.ts` (zod `jitless`) phải nằm trong chunk `v-zod`: zod 4 thử `Function('')` và CSP không cho `'unsafe-eval'`, nên thiếu cờ này trình duyệt báo vi phạm CSP. Chi tiết và cách chạy: FEATURES mục 18.
- **Quy ước UX và truy cập:** tên trang ở `web/lib/route-titles.ts` + `RouteAnnouncer` (tiêu đề, thông báo, focus); token `--input-border` và `DISABLED_NEUTRAL*`; không bao giờ hiện mã lỗi thô cho người học (`GENERIC_ERROR_MESSAGE`); trang Học tập gợi ý bài tiếp theo; phiên học có hoàn tác khi bỏ qua; trang bài học có tên bài là `h1` và bộ đếm câu `aria-live`, thoát chỉ hỏi khi còn câu chưa gửi (FEATURES mục 2, 5, 18).
- **Tính năng AI luôn ghi là phản hồi luyện tập:** nhận xét bài viết hiện "Phản hồi luyện tập — không phải điểm chính thức" (`WRITING_FEEDBACK_LABEL`); AI không sinh câu hỏi trong lúc thi; log AI chỉ lưu siêu dữ liệu, không lưu nội dung câu hỏi hay bài viết.
- **Ước lượng thời gian học là tham khảo:** bảng `level_reference_hours` có `reviewed = false` và giao diện luôn nói rõ.
- **Nội dung không sửa trong database:** nguồn sự thật là `content/` trong repo; trang quản trị chỉ xem trước, đổi trạng thái duyệt và xử lý báo lỗi. Import lại không hạ trạng thái một dòng không đổi nội dung (`000420_import_keep_published.sql`).
- **Admin cấp vai trò:** admin đầu tiên bootstrap bằng SQL; sau đó cấp/đổi/thu hồi ở trang Nhân sự `/quan-tri/nhan-su` (gọi `admin_grant_role`, ghi nhật ký). `admin_list_staff` và `admin_find_user` để lộ email nên chỉ admin gọi được và để lại nhật ký (`20261017000500_admin_staff.sql`); không gỡ hay hạ admin cuối cùng, và admin cuối cùng không xoá được tài khoản của mình (`20261018090000_db_hardening.sql`). DEPLOY.md, *Quản trị nội dung*.
- **Giáo viên chỉ thấy số liệu tổng hợp (`20261017000400_teacher_tools.sql`, test `supabase/tests/teacher.test.sql`):** quyền giáo viên là một dòng `teacher_profiles`, cấp bằng SQL hoặc `grant_teacher_role` (admin, có nhật ký), chưa có giao diện. Người học chỉ vào lớp bằng mã mời và rời lớp lúc nào cũng được; rời lớp xoá dòng thành viên nên giáo viên hết thấy ngay. `teacher_class_roster` chỉ trả chuỗi ngày, phút hoạt động, số bài xong, thẻ đến hạn, tỉ lệ đúng khi ôn và mức hoàn thành bài giao; không bao giờ trả đáp án, hội thoại AI, từ vựng cá nhân hay email. Bài giao chỉ tính việc làm từ lúc giao trở đi. Giới hạn ở `TEACHER_LIMITS` (`shared/teacher/limits.ts`, trùng với SQL).
- **Audio nội dung tạo offline, không bao giờ theo yêu cầu người học (`20261017000200_content_audio.sql`, [AUDIO.md](../AUDIO.md)):** bucket `content-audio` đọc công khai, chỉ `service_role` ghi, không liệt kê được; id `<lang>-<32 hex>` tính từ ngôn ngữ, giọng và văn bản nên đổi câu thì đổi id. Không có audio (`audio_asset_id: null`) thì giữ giọng đọc của trình duyệt. Script không chạy trong CI.
- **Tiếng Nhật (`20261018130000_japanese.sql`):** cấp độ `kana` (ordinal 0) rồi `n5`…`n1`; mục tiêu `kana_basics`, `communication`, `jlpt`, `skill_focus`; họ đề `jlpt` chấm và xếp bậc như đề TOPIK đầy đủ. Mọi CHECK và RPC từng giới hạn `en|ko` nay nhận thêm `ja`. Chú thích đầu migration còn nói ja bị ẩn: đã cũ (giờ `LANGUAGES.ja.available = true`), nhưng không sửa được vì migration không được sửa.
- **Không đặt secret vào `VITE_*`:** `scripts/check-public-env.mjs`, `scripts/check-bundle-secrets.mjs`, gitleaks (CI) chặn.

## 3. Giới hạn đã biết

- Nghe: đã có đường ống audio thật (`pnpm audio:generate`, [AUDIO.md](../AUDIO.md)) nhưng **chưa tạo file nào**: toàn bộ `audio_asset_id` trong `content/` vẫn là `null` và chưa có `supabase/content-audio-manifest.json`. Cho tới khi chạy script, bài `listen` và phần nghe của đề dùng `fallback_text`/`script` đọc bằng giọng máy (TTS của trình duyệt, `web/features/exam/tts.ts`). Câu nghe của đề đã có audio thì không còn `tts_text` dự phòng nếu tải audio lỗi. Kiểm tra đầu vào tự bỏ qua kỹ năng nghe (`not_supported`).
- Tạo audio dùng Gemini TTS gói miễn phí: mặc định 3 request/phút và có quota ngày, nên phải chạy nhiều lần theo từng ngôn ngữ; chạy tay từ máy, không có workflow.
- Luyện nói đã có (`/app/luyen-noi`) nhưng không chấm tự động: chỉ tự đánh giá, và bản chép giọng nói phụ thuộc Web Speech API của trình duyệt (không có ở mọi trình duyệt, có thể gửi âm thanh tới dịch vụ của hãng trình duyệt). Viết/nói không có trong kiểm tra đầu vào và không bao giờ được suy ra trình độ từ chúng.
- Đóng vai AI: mỗi lượt tốn một lượt quota AI ngày (mặc định 20), nên một buổi 12 lượt có thể dùng gần hết quota; buổi dở dang và buổi đã kết thúc nhưng chưa xem tổng kết được giữ trên thiết bị (`localStorage` khoá `linguo:roleplay:v2:<userId>`, đóng tab vẫn còn) tối đa 24 giờ sau tin nhắn cuối, xoá khi rời buổi, xem xong tổng kết, đăng xuất hoặc xoá tài khoản; không đồng bộ sang thiết bị khác (FEATURES mục 16).
- Từ vựng cá nhân: chưa có OCR, chưa chia sẻ danh sách. Chấm offline đã có qua outbox `linguo-personal-outbox-v1:<userId>` (gửi lại theo thứ tự khi có mạng/tab hiện lại/mỗi 15 giây, giữ khi đăng xuất như outbox bài học và ôn tập, xoá khi xoá tài khoản; FEATURES mục 17); cảnh báo "chưa đồng bộ" khi đăng xuất ở Cài đặt (`web/routes/app/SettingsPage.tsx`) đếm cả lượt chấm từ cá nhân còn chờ.
- Tiếng Nhật: chỉ có nội dung tới N3 (Kana → N5, N4, N3; đề JLPT N5/N4/N3). Cấp `n2`, `n1` bị chặn ở client theo `CONTENT_MAX_LEVEL` (`shared/learning/levels.ts`, FEATURES mục 21): không chọn được làm trình độ hiện tại/mục tiêu, báo cáo kiểm tra đầu vào hạ về N3. Chưa có chặn ở DB: `create_learning_path`/`update_learning_path_plan` vẫn nhận `n2`/`n1` khi gọi RPC trực tiếp, và lộ trình tạo trước thay đổi này có thể còn mục tiêu `n2`/`n1` (Cài đặt mở trình sửa kế hoạch với mục tiêu hợp lệ thay thế, nhưng lộ trình cũ giữ nguyên tới khi người học lưu). Kiểm tra đầu vào vẫn đo được tới N1, nhưng xếp lớp trên server không bao giờ đặt trình độ bằng hay vượt mục tiêu, nên lộ trình có mục tiêu ≤ N3 không bị xếp vào cấp chưa có bài.
- Không có bài tiên quyết nối giữa các chương trình (en, ko, ja đều để `prerequisites: []` ở bài đầu mỗi chương trình), kể cả bài đầu N4 (`ja:lesson:n4-te-form`). Cố ý: `path_lessons` chỉ lấy chương trình giao với khoảng trình độ của lộ trình, và `prerequisites_met` đòi bài tiên quyết đã hoàn thành **trong lộ trình đó**; người bắt đầu từ N4 không có `kana-basics` trong lộ trình nên bài tiên quyết chéo chương trình sẽ khoá vĩnh viễn N4 khỏi kế hoạch phiên học (`get_session_inputs` chỉ đưa bài có `prerequisites_met` vào kế hoạch).
- Chấm tiếng Nhật: với `answer_lang = ja`, `normalizeAnswer` (`shared/content/grading.ts`) và `grading_normalize` (SQL, dùng bởi `grade_exercise`; bản mới ở `20261018140000_ja_grading_whitespace.sql`) bỏ mọi khoảng trắng (kể cả khoảng trắng toàn góc U+3000) sau bước xử lý dấu câu, nên `はい、そうです。`, `はい そうです` và `はいそうです` được chấm như nhau. Nội dung ja viết trước thay đổi này vẫn còn các biến thể đáp án thừa (không dấu câu, không khoảng trắng): vô hại, chưa dọn. Production chỉ chấm theo quy tắc mới sau khi Deploy áp migration này; trước đó server vẫn chấm theo quy tắc cũ (nội dung hiện có vẫn đúng nhờ các biến thể thừa). Máy chấm đề thi (`normalizeExamText`, câu `short_text`) không đổi: vẫn giữ khoảng trắng giữa từ.
- Công cụ giáo viên: chưa có giao diện cấp quyền giáo viên (chỉ SQL, hoặc gọi `grant_teacher_role` bằng phiên của admin; DEPLOY.md, *Giáo viên*). Bài giao dạng đề thi dẫn tới trang Luyện thi chung, không mở thẳng đề được giao.
- Gemini gói miễn phí: hết quota ngày làm AI tạm ngừng cho tới khi Google reset; circuit breaker nằm trong bộ nhớ từng instance (RUNBOOK mục 6).
- Dọn dữ liệu phụ thuộc cron: `purge_notifications()` (90 ngày) do `notify-dispatch` gọi mỗi đêm (giờ UTC 20); `purge_expired_data()` và `purge_analytics()` (180 ngày) do workflow Maintenance gọi hằng ngày (DEPLOY.md, *Bảo trì dữ liệu*). Trang quyền riêng tư (`web/features/account/retention.ts`) cam kết đúng các thời hạn này.
- Maintenance và Deploy chờ duyệt vì environment `production` bật Required reviewers; run Maintenance theo lịch không được duyệt sẽ hết hạn (dữ liệu chỉ dọn muộn hơn).
- Notify dựa vào cron của GitHub Actions, vốn hay chạy muộn hoặc bỏ lượt: nhắc vẫn đến hạn trong 60 phút kể từ đầu khung (cửa sổ bù), quá khung đó thì lỡ khung nhắc đó.
- CSP đặt bằng thẻ `<meta>` (GitHub Pages không cho đặt header): `frame-ancestors`, báo cáo vi phạm không có tác dụng (RUNBOOK mục 7).
- Nội dung chưa qua giáo viên bản ngữ (mục 1).
- Test pgTAP và e2e chạy trong CI; local cần Docker (SETUP.md). Chưa có test trên thiết bị thật tự động: dùng `docs/MOBILE-QA.md`. `route-error.test.tsx` có thể quá thời gian khi máy quá tải.

## 4. Việc còn mở

- **Đưa đợt P2 lên production**, theo thứ tự: merge `integrate/p2-batch` vào `main`; duyệt Deploy cho các migration chưa áp (mục 5; `20261018130000_japanese.sql` đã được đánh số lại từ `20261017000900` để đứng sau `db_hardening`); sau khi Deploy xanh, ghi mọi migration mới vào `migrations-applied.json` (`--record`); chạy **Publish content** (hoặc `pnpm content:push`) để production có chương trình ja, kho kiểm tra đầu vào và đề JLPT; cấp quyền giáo viên đầu tiên (DEPLOY.md, *Giáo viên*).
- **Tạo audio thật:** chạy `pnpm audio:generate` với `GEMINI_API_KEY` và service key ([AUDIO.md](../AUDIO.md)), commit YAML và manifest, rồi chạy Publish content.
- **Kiểm tra Edge Functions bằng Deno:** đợt P2 sửa `supabase/functions` (kịch bản đóng vai và prompt tiếng Nhật) nhưng `deno check .`/`deno lint` chưa chạy trên máy tích hợp (không có Deno); CI job `functions` chạy chúng.
- **Chấm tiếng Nhật bỏ khoảng trắng:** đã làm (`20261018140000_ja_grading_whitespace.sql`, fixture ja trong `grading.fixtures.json`); còn chờ Deploy áp migration. Tuỳ chọn: dọn các biến thể đáp án ja nay đã thừa trong `content/ja` (chỉ sau khi migration đã lên production).
- **Nội dung tiếng Nhật:** thêm N2/N1 (thêm `content/ja/programs/n2`, nâng `CONTENT_MAX_LEVEL.ja`; `pnpm content:check` và test sẽ nhắc); người bản ngữ duyệt nội dung, kịch bản đóng vai và tài liệu luyện nói. Tuỳ chọn: chặn `n2`/`n1` cả trong `learning_path_validate` (migration mới) nếu cần chặn cả lời gọi RPC trực tiếp. Muốn nối bài tiên quyết giữa các chương trình thì trước hết phải sửa `path_lessons` (migration mới) để coi bài tiên quyết nằm ngoài lộ trình là đã đạt (mục 3).
- **Bài giao dạng đề thi** mở thẳng đề được giao thay vì trang Luyện thi chung.
- **Giao diện cấp quyền giáo viên** (ví dụ trong trang Nhân sự) nếu số giáo viên tăng.
- **OCR từ tài liệu:** không nằm trong kế hoạch; PRD chỉ nói "sau import danh sách từ cá nhân/CSV mới xem xét OCR" (mục P2). Import CSV đã có (FEATURES mục 17).
- Duyệt nội dung và thang điểm đề thi bởi người có chuyên môn; đối chiếu `scoring` của đề CEFR và các đề JLPT.
- Thử khôi phục backup và rollback web theo RUNBOOK mục 1–3 và ghi vào "Nhật ký diễn tập".

## 5. Danh sách migration

Nguồn sự thật: `ls supabase/migrations` và `supabase/migrations-applied.json` (sha256 của từng file đã deploy; `scripts/check-migrations-immutable.mjs` chặn sửa hoặc xoá). Tại thời điểm viết có 42 file; 34 file đã được ghi trong `migrations-applied.json` (đã được Deploy áp lên production và ghi nhận), tám file từ `20261016000700` trở đi chưa được ghi. "Chưa" chỉ nghĩa là chưa ghi vào file: một số có thể đã được Deploy áp lên production mà chưa `--record`, cần đối chiếu log job `migrate` hoặc `supabase migration list` trước khi ghi. Kiểm tra lại (chỉ in file chưa được ghi, trống nghĩa là tất cả đã ghi):

```bash
for f in supabase/migrations/*.sql; do n=$(basename "$f"); grep -q "\"$n\"" supabase/migrations-applied.json || echo "$n"; done
```

| Số | Tên | Nội dung | Đã ghi trong `migrations-applied.json` |
|---|---|---|---|
| `20261013000100` | `foundation` | profiles, user_preferences, RLS nền | Có |
| `20261013000200` | `learning_paths` | lộ trình, ước lượng thời gian | Có |
| `20261014000100` | `content` | chương trình, bài, bài tập, import nội dung | Có |
| `20261014000200` | `lesson_runs` | lượt học, chấm bài tập | Có |
| `20261014000300` đến `000330` | `reviews`, `reviews_fsrs`, `reviews_queue`, `reviews_grade` | ôn tập FSRS (4 file) | Có |
| `20261014000400` đến `000430` | `diagnostic`, `diagnostic_engine`, `diagnostic_rpc`, `diagnostic_import` | kiểm tra đầu vào (4 file) | Có |
| `20261014000500` | `ai_gateway` | cache, quota, log, báo cáo AI | Có |
| `20261014000600` | `spec2_sync` | vá `import_content_bundle` (migration `000100` đã bị sửa sau deploy) | Có |
| `20261014000900` | `session_planner` | kế hoạch phiên học | Có |
| `20261014000910` | `account_data` | xuất/xoá dữ liệu, `purge_expired_data` | Có |
| `20261015000100` | `progress` | `activity_days`, huy hiệu, dashboard tiến độ | Có |
| `20261015000110` | `analytics` | analytics nội bộ | Có |
| `20261015000200` | `exams` | luyện thi TOPIK/CEFR | Có |
| `20261015000300` | `reminders` | nhắc học, thông báo, push | Có |
| `20261015000400` | `content_reports` | báo lỗi nội dung | Có |
| `20261015000410` | `admin` | khu quản trị, vai trò, nhật ký | Có |
| `20261015000420` | `import_keep_published` | import không hạ trạng thái | Có |
| `20261015000500` | `timezone_cooldown` | đổi múi giờ tối đa một lần mỗi 24 giờ | Có |
| `20261015000600` | `review_grade_guard` | `grade_review` áp bộ lọc hàng đợi | Có |
| `20261015000610` | `export_exam_data` | bản xuất gồm dữ liệu thi | Có |
| `20261015000700` | `ai_review_writing` | tác vụ `review_writing` | Có |
| `20261015000800` | `answer_integrity` | `client_at` và phiên bản đáp án | Có |
| `20261016000100` | `exam_activity` | luyện thi tính vào chuỗi ngày, backfill | Có |
| `20261016000200` | `ai_more_tasks` | `analyze_sentence`, `summarize_session`, `plan_review` | Có |
| `20261016000300` | `personal_vocab` | từ vựng cá nhân | Có |
| `20261016000400` | `notify_hardening` | gia cố nhắc học và push | Có |
| `20261016000500` | `content_admin_hardening` | gia cố quản trị nội dung, `client_at` 48 giờ | Có |
| `20261016000600` | `ai_roleplay` | tác vụ `roleplay_turn` | Có |
| `20261016000700` | `client_errors` | sự kiện analytics `client_error` (báo lỗi kỹ thuật ẩn danh), `admin_analytics.client_errors` | Chưa |
| `20261016000800` | `progress_vocab_hardening` | luyện thi tính theo ngày làm bài, thời gian hoạt động bị chặn bởi thời gian thật ở server, `client_at` 12 giờ, gia cố từ vựng cá nhân | Chưa |
| `20261017000200` | `content_audio` | bucket `content-audio`, bảng `audio_assets` (audio bài nghe) | Chưa |
| `20261017000400` | `teacher_tools` | lớp học, mã mời, bài giao, bảng tổng hợp cho giáo viên, `grant_teacher_role` | Chưa |
| `20261017000500` | `admin_staff` | `admin_list_staff`, `admin_find_user` cho trang Nhân sự | Chưa |
| `20261018090000` | `db_hardening` | index `attempts.learning_path_id`, chặn xoá tài khoản admin cuối cùng, ẩn `resolved_by` với người học | Chưa |
| `20261018130000` | `japanese` | tiếng Nhật: cấp độ, mục tiêu, họ đề `jlpt`, mở rộng CHECK/RPC sang `ja` (đánh số lại từ `20261017000900`) | Chưa |
| `20261018140000` | `ja_grading_whitespace` | `grading_normalize` bỏ mọi khoảng trắng khi chấm đáp án `ja` (khớp `normalizeAnswer`) | Chưa |

Migration mới phải có số lớn hơn `20261018140000`, file cuối hiện có (DEPLOY.md, *Quy tắc đánh số migration mới*) và chỉ được ghi vào `migrations-applied.json` sau khi Deploy xanh.

## 6. Vận hành local và nhiều phiên làm việc song song

- **Chỉ một stack Supabase local tại một thời điểm** (SETUP.md, *Docker và Supabase local*); dùng stack gọn khi chỉ cần test database.
- **Cổng bị Windows giữ trước:** `supabase/config.toml` đã dùng dải 553xx vì Windows (Hyper-V/WSL) giữ các dải cổng TCP và `supabase start` không bind được. Trên máy phát triển hiện tại, dải 584xx cũng bị chặn (theo ghi nhận của người vận hành máy này, không kiểm chứng được từ repo): khi cần cổng riêng cho một stack hoặc server phụ, chọn trong dải 574xx hoặc 575xx. Xem các dải đang bị giữ bằng `netsh interface ipv4 show excludedportrange protocol=tcp`.
- **Khoá database cho các phiên song song:** các phiên agent dùng chung một Docker nên quy ước tạm khoá bằng thư mục: `mkdir /c/Users/TUYEN/linguo-db.lock` (thành công = giữ khoá; lỗi vì đã tồn tại = có phiên khác đang dùng, chờ), chạy test database, rồi `rmdir /c/Users/TUYEN/linguo-db.lock` khi xong. Đây là quy ước của máy phát triển này, không phải cơ chế của repo.
- **Smoke production:** workflow `.github/workflows/smoke.yml` chạy `scripts/smoke.mjs` sau mỗi Deploy xanh, hằng ngày 02:30 UTC và khi chạy tay; cần repository variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (tuỳ chọn `VITE_SITE_URL`). Hướng dẫn và cách đọc kết quả: [RUNBOOK.md](../RUNBOOK.md#kiểm-tra-sau-deploy-smoke).
- **Environment của workflow Notify:** environment `notify` cần secret `NOTIFY_CRON_SECRET` và repository variable `VITE_SUPABASE_URL` (thiếu một trong hai thì run cảnh báo và thoát 0); environment `production` cần secrets `NOTIFY_CRON_SECRET`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` và repository variable `VITE_VAPID_PUBLIC_KEY` (DEPLOY.md, *Tổng hợp secrets và biến*).
