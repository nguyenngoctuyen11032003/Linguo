# Linguo — Spec 3: Flashcard và lịch ôn FSRS

**Ngày:** 2026-10-13
**Trạng thái:** Đã duyệt thiết kế
**Nguồn yêu cầu:** [Dac_ta_Linguo_English_Korean.md](./Dac_ta_Linguo_English_Korean.md) mục 3, 6.4, 7 (7.1–7.5), 10.2–10.3, 14 (review_state), 15, 17.2, 20.1
**Nền tảng:** Spec 0, 1, 2 (đã merge vào `main`)

---

## 1. Mục tiêu

Mỗi từ/học liệu (`learning_items`) mà người học đã học trong bài trở thành thẻ ôn. Server lên lịch bằng FSRS-6, đưa ra hàng ôn mỗi ngày có giới hạn, chấm thẻ không tin client, ghi nhận "đã thuộc" theo tiêu chí nhiều ngày/nhiều hướng, và cho ôn được khi mạng chập chờn.

**Ngoài phạm vi:** hướng thẻ "dùng trong câu" (cần AI chấm — spec 5), audio thật, tối ưu tham số FSRS theo người học, kế hoạch phiên học tổng hợp (spec 6).

## 2. Quyết định đã chốt

| Chủ đề | Quyết định |
|---|---|
| Nơi tính FSRS | plpgsql trên server (FSRS-6, không fuzz). `ts-fsrs` chỉ là devDependency để sinh fixtures; SQL phải khớp fixtures (S, D sai số ≤ 1e-6; state, số ngày, bước học khớp tuyệt đối) |
| Tham số | Bảng `public.srs_config` một dòng: `weights double precision[21]` (mặc định FSRS-6 của phiên bản `ts-fsrs` đã ghim), `desired_retention 0.9`, `maximum_interval 365`, `learning_steps_minutes {1,10}`, `relearning_steps_minutes {10}`, `daily_new_limit 10`, `cap_min 15`, `cap_max 150`, `cap_per_minute 3`, `recovery_factor 2`, `mastery_*` |
| Hướng thẻ | `recognize` (thấy từ → nhớ nghĩa), `recall` (thấy nghĩa → nhớ từ) |
| Tạo thẻ | `complete_lesson` tạo thẻ cho các học liệu `role = 'introduce'` của bài (cả 2 hướng, trạng thái `new`, đến hạn từ đầu ngày mai theo múi giờ người học); `reuse` không tạo. `next_review_at` của spec 2 giữ nguyên ý nghĩa "đầu ngày mai" và nay khớp với thời điểm các thẻ mới bắt đầu xuất hiện trong hàng ôn |
| Ngày | Ranh giới ngày = nửa đêm theo `profiles.timezone` (`learning_user_today`). Khoảng ≥ 1 ngày được làm tròn về đầu ngày địa phương; bước phút không làm tròn |
| Đánh giá | 1 Quên / 2 Khó / 3 Được / 4 Dễ. Hiệu chỉnh trên server: `hint_count > 0` → tối đa Khó; đúng (≥ 3) mà `confidence = 1` → Khó. `response_ms` chỉ lưu, không phạt |
| Đã thuộc | Mỗi học liệu: ≥ 3 lần nhớ thành công (rating hiệu chỉnh ≥ 3, không gợi ý) vào ≥ 3 ngày địa phương khác nhau, có ≥ 1 lần thành công ở hướng `recall`, stability thẻ `recall` ≥ 21 ngày, lần thành công gần nhất không có `confidence = 1`. Một lần Quên ở bất kỳ hướng nào → bỏ `mastered_at` |
| Ghi dữ liệu | Chỉ qua RPC `security definer`, `search_path = ''`, `auth.uid()`; lỗi `P0001` mã snake_case (`not_authenticated` = `42501`) |
| UI | Nút, không vuốt; phím Space/Enter lật, 1–4 chấm, P hoãn; không chuỗi ngày học, không bảng xếp hạng |

## 3. Dữ liệu (migration `supabase/migrations/20261014000300_reviews.sql`)

- `public.srs_config` (id `boolean primary key default true check (id)`, các cột ở mục 2). RLS bật, không grant cho client.
- `public.review_cards`: `id uuid pk`, `user_id`, `learning_path_id` (FK cascade), `learning_item_id` (FK `learning_items`), `direction text check in ('recognize','recall')`, `fsrs_state text check in ('new','learning','review','relearning')`, `step smallint`, `stability double precision`, `difficulty double precision`, `reps int`, `lapses int`, `scheduled_days int`, `due_at timestamptz`, `last_review_at timestamptz`, `suspended_at timestamptz`, `postpone_count smallint`, `last_postponed_on date`, `created_at`, `updated_at`. Unique `(user_id, learning_path_id, learning_item_id, direction)`. Index `(user_id, learning_path_id, due_at) where suspended_at is null`.
- `public.review_item_mastery`: PK `(user_id, learning_path_id, learning_item_id)`, `mastered_at timestamptz null`, `updated_at`.
- `public.review_logs` (chỉ thêm): `id`, `user_id`, `learning_path_id`, `card_id`, `kind text check in ('grade','postpone')`, `rating_raw`, `rating_effective`, `confidence`, `response_ms`, `hint_count`, `state_before jsonb`, `state_after jsonb`, `local_day date`, `idempotency_key uuid`, `payload_hash text`, `result jsonb`, `client_at`, `created_at`. Unique `(user_id, idempotency_key)`. Index `(user_id, learning_path_id, created_at desc)`.
- RLS select-own trên `review_cards`, `review_item_mastery`, `review_logs`; không quyền ghi cho client.

## 4. Hàm và RPC

Nội bộ (revoke khỏi public/anon/authenticated): `srs_next(p_card jsonb, p_rating int, p_now timestamptz, p_config ...) returns jsonb` (immutable/stable, FSRS-6 thuần), `srs_retrievability(stability, elapsed_days)`, `srs_adjust_rating(rating, confidence, hint_count)`, `srs_enroll_lesson(p_user, p_path, p_lesson)` (được `complete_lesson` gọi), `srs_update_mastery(p_user, p_path, p_item)`.

Công khai (grant `authenticated`):

| RPC | Hợp đồng (JSON khớp `packages/shared/src/review/rpc.ts`) |
|---|---|
| `get_review_queue(p_path_id uuid, p_limit int default 20, p_extra boolean default false)` | Lộ trình của người gọi và `status = 'active'` (`path_not_found`, `path_not_active`). Giới hạn ngày = `clamp(weekly_minutes[thứ hôm nay] × cap_per_minute, cap_min, cap_max)` − số lần chấm hôm nay; `p_extra` cho thêm 10. Thẻ mới tối đa `daily_new_limit` − thẻ mới đã bắt đầu hôm nay; 0 khi tồn đọng > `recovery_factor` × giới hạn (`recovery_mode`). Thứ tự: learning/relearning đã đến hạn → review đến hạn trước hết ngày hôm nay theo retrievability tăng dần (rồi `card_id`) → new (theo thứ tự học liệu trong bài). Mỗi học liệu chỉ 1 hướng trong một lần lấy. Mỗi thẻ có `previews` 4 mức do server tính. Trả `{cards, totals}` |
| `grade_review(p_card_id uuid, p_rating smallint, p_confidence smallint, p_response_ms int, p_hint_count smallint, p_idempotency_key uuid, p_client_at timestamptz)` | Replay cùng key + cùng hash → kết quả đã lưu (`replayed = true`); khác hash → `idempotency_conflict`. Khoá thẻ `for update`; thẻ của người khác → `card_not_found`; bị tạm ẩn → `card_suspended`; rating ngoài 1–4 → `invalid_rating`; > 60 lần/60 s → `rate_limited`. Thời điểm chấm = `now()` (client_at chỉ lưu). Hiệu chỉnh rating, chạy `srs_next`, làm tròn ngày, ghi log, cập nhật mastery. Trả `reviewGradeResultSchema` |
| `postpone_reviews(p_path_id uuid, p_card_ids uuid[], p_idempotency_key uuid)` | `p_card_ids` null = mọi thẻ đến hạn hôm nay của lộ trình. Dời `due_at` sang đầu ngày mai địa phương; S, D giữ nguyên; mỗi thẻ tối đa 1 lần/ngày và tối đa 2 lần liên tiếp (lần 3 → bỏ qua, đếm `skipped`); ghi log `postpone`. Trả `{postponed, skipped, replayed}` |
| `review_summary(p_path_id uuid)` | `reviewSummarySchema`: đã ôn hôm nay, còn lại hôm nay, dự báo 7 ngày, tỷ lệ nhớ 30 ngày (null khi mẫu < 20), số đã thuộc, chế độ khôi phục |

`complete_lesson` (spec 2) được sửa để gọi `srs_enroll_lesson` trong cùng transaction.

## 5. Kiểm thử SQL ↔ ts-fsrs

`scripts/gen-fsrs-fixtures.mjs` chạy `ts-fsrs` (phiên bản ghim, `enable_fuzz: false`, cùng tham số `srs_config`) trên ~40 chuỗi chấm (mọi trạng thái, quên, Dễ từ mới, trễ hạn lâu, nhiều bước học) → `packages/shared/src/review/fsrs.fixtures.json`. `scripts/sync-fsrs-fixtures.mjs [--check]` sinh `supabase/tests/review_fsrs.test.sql` (giống mẫu `sync-grading-fixtures.mjs`); CI chạy `--check`.

## 6. Web

- `apps/web/src/features/reviews/`: `service.ts`, `error-map.ts`, outbox ôn tập (dùng lại `createOutbox` của lesson-player được tổng quát hoá: tiền tố khoá `linguo-review-outbox-v1:`, schema `reviewGradeArgsSchema`, RPC `grade_review`), `useReviewSession.ts` (trả `ReviewSessionApi` ở `apps/web/src/features/reviews/types.ts`), `useReviewSummary.ts`. Đồng bộ outbox ôn tập được gắn vào `OutboxSyncProvider` sẵn có.
- `apps/web/src/components/flashcard/`: `Flashcard` (mặt trước/sau theo hướng, chạm hoặc Space để lật, xoay 3D 250 ms; giảm chuyển động → đổi ngay), `RatingBar` (4 nút ≥ 48 px với khoảng thời gian từ `previews`, phím 1–4 chỉ sau khi lật), `ConfidenceChips` cho thẻ `recall` trước khi lật (bỏ qua được), nút audio "Chưa có audio", `aria-live` đọc đáp án.
- `apps/web/src/routes/app/review/`: `ReviewPage` (`/app/on-tap`, thay "Sắp có"): trạng thái rỗng "Hôm nay không có thẻ cần ôn", phiên ôn, "Hoãn sang mai", tóm tắt (đã ôn N thẻ, tỷ lệ nhớ, từ mới vững, dự báo ngày mai, "Hôm nay đủ rồi" + "+10 thẻ nữa"), lời nhắn chế độ khôi phục ("Mình chia đều N thẻ cho mấy ngày tới"). `apps/web/src/routes/app/home/ReviewDueCard.tsx`: "Ôn tập hôm nay: N thẻ".
- Mất mạng: chấm vào outbox với cùng `idempotency_key`, hiện "Đang chờ đồng bộ", sang thẻ tiếp; không tự tính lịch ở client.

## 7. Kiểm thử

- Vitest (scripts): sinh fixtures tất định; `--check`.
- pgTAP: parity FSRS; RLS A/B; không quyền ghi trực tiếp; chống trùng; hiệu chỉnh rating; giới hạn ngày + thẻ mới + chế độ khôi phục; một hướng mỗi học liệu; ranh giới ngày Asia/Seoul vs America/Los_Angeles; hoãn (1 lần/ngày, tối đa 2 lần liên tiếp); đã thuộc (đạt / thiếu ngày / thiếu recall / tự tin thấp / quên → bỏ); `complete_lesson` tạo thẻ.
- Vitest (web): service, error map, outbox ôn tập, `useReviewSession`, `Flashcard`/`RatingBar` (bàn phím, giảm chuyển động, aria-live), `ReviewPage`, `ReviewDueCard`.
- Playwright: phiên ôn chỉ bằng bàn phím trên 6 thiết bị, mất mạng → chờ → đồng bộ, hoãn, "Hôm nay đủ rồi", axe sáng/tối, không cuộn ngang.

## 8. Chia việc

| # | Việc | Phụ thuộc |
|---|---|---|
| B1 | `ts-fsrs` (ghim), `gen-fsrs-fixtures.mjs`, `fsrs.fixtures.json`, `sync-fsrs-fixtures.mjs` + test, script `fixtures:fsrs`, bước CI `--check` | — |
| B2 | Migration bảng + `srs_config` + RLS/grants + pgTAP RLS | — |
| B3 | `srs_next`, `srs_retrievability`, `srs_adjust_rating` (SQL) + pgTAP parity sinh từ fixtures | B1 (fixtures), B2 |
| B4 | `get_review_queue`, `postpone_reviews`, `review_summary` + pgTAP | B2, B3 (hợp đồng hàm) |
| B5 | `grade_review`, `srs_enroll_lesson`, `srs_update_mastery`, sửa `complete_lesson` + pgTAP | B2, B3 |
| B6 | Web data layer: service, error map, outbox tổng quát, `useReviewSession`, `useReviewSummary`, gắn vào `OutboxSyncProvider` | hợp đồng |
| B7 | Component flashcard | hợp đồng |
| B8 | `ReviewPage`, `ReviewDueCard`, router; sau đó E2E (mock trong `tests/e2e/fixtures.ts`) | B6, B7 (mock) |

B3–B5 cùng sửa file migration `20261014000300_reviews.sql`: B2 viết phần bảng; B3 ghi các hàm FSRS vào `20261014000310_reviews_fsrs.sql`; B4 vào `20261014000320_reviews_queue.sql`; B5 vào `20261014000330_reviews_grade.sql` (thứ tự tên file = thứ tự áp dụng).
