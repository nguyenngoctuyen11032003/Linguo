# Linguo — Spec 8: Tiến độ, động lực và analytics nội bộ

**Ngày:** 2026-10-13 · **Trạng thái:** Đã duyệt (người dùng giao toàn quyền hoàn thiện) · **Nguồn:** PRD 10.1–10.3, 13.1 (analytics), 19 P0 mục 8 & 12, P1 "dashboard lỗi sai"
**Hợp đồng (Wave 0, đã commit):** `packages/shared/src/progress/contract.ts` · **Chủ sở hữu:** phiên linguo-27

**Ngoài phạm vi:** điểm thi thử (Spec 9 thêm khối `exams` vào dashboard), thông báo/nhắc ôn (Spec 10), bảng xếp hạng (không làm), session planner (Spec 6 của phiên khác).

## 1. Mục tiêu

Trang `/app/tien-do` tách rõ ba lớp theo PRD 10.2: **hoạt động** (đã học bao lâu), **học tập** (làm đúng/nhớ lại), **năng lực** (ước lượng có độ tin cậy). Động lực (XP, chuỗi ngày theo lịch, thử thách tuần, huy hiệu) nằm riêng, có thể tắt, và không bao giờ được trình bày như chỉ số năng lực. Analytics nội bộ tối thiểu ghi sự kiện không chứa PII, người học có thể từ chối.

## 2. Dữ liệu (migration `20261015000100_progress.sql`)

- Mọi bảng mới có `user_id → auth.users on delete cascade` và RLS select-own (test RLS chéo người dùng của Spec 7 duyệt mọi bảng public; `export_my_data`/`delete_my_account` bao trùm các bảng này).
- **`activity_days`** `(user_id, learning_path_id, local_day date)` PK; cột `active_ms bigint`, `answers int`, `correct_first int`, `lessons int`, `reviews int`, `xp int`, `updated_at`. RLS select-own; không grant ghi.
- **Trigger** (security definer, `search_path=''`) cập nhật `activity_days` bằng upsert:
  - `attempts` AFTER INSERT: `answers+1`, `active_ms += least(response_ms, 120000)`; nếu `attempt_no = 1` và không `after_reveal`: `correct` → xp +2 và `correct_first+1`, `almost` → xp +1. Ngày = ngày địa phương của `coalesce(client_at, created_at)` theo `profiles.timezone`, kẹp vào `[today-7, today]`.
  - `review_logs` AFTER INSERT với `kind = 'grade'`: dùng `local_day` có sẵn; `reviews+1`, `active_ms += least(response_ms, 120000)`, xp +1 nếu `rating_effective >= 2`.
  - `lesson_runs` AFTER UPDATE khi `status` chuyển sang `completed`: `lessons+1`, xp +10, thêm +5 nếu độ chính xác lần đầu của run ≥ 0.8.
  - Mọi lần cộng xp: `xp = least(300, xp + delta)` (trần ngày).
- **Backfill** trong cùng migration từ dữ liệu `attempts`/`review_logs`/`lesson_runs` hiện có (cùng quy tắc).
- **`user_badges`** `(user_id, learning_path_id, badge_key text, earned_at)` PK `(user_id, learning_path_id, badge_key)`; `badge_key` check thuộc `BADGE_KEYS`. RLS select-own.
- **`user_preferences`** thêm `show_motivation boolean not null default true`, `analytics_opt_out boolean not null default false`; mở rộng grant update cột cho hai cột này.
- **Hàm nội bộ** `progress_streak(p_user, p_path) → (current int, best int, grace_left int)`: duyệt ngược ≤ 400 ngày; ngày có `weekly_minutes[isodow] = 0` là ngày nghỉ (bỏ qua, không phá chuỗi); ngày theo lịch mà không active → dùng 1 lượt ân hạn của tuần ISO đó nếu còn, nếu không thì dừng. Hôm nay chưa active không phá chuỗi. Active = `lessons ≥ 1` hoặc `reviews ≥ 10` hoặc `active_ms ≥ 5 phút`.
- **RPC `get_progress_dashboard(p_path_id uuid, p_range_days int) → jsonb`** theo `progressDashboardSchema` (security definer, volatile vì trao huy hiệu):
  - `p_range_days ∉ {7,14,28}` → `invalid_range`; path không thuộc người gọi → `path_not_found`.
  - `days`: đúng `range_days` ngày kết thúc hôm nay (ngày trống = 0), `goal_minutes` từ `weekly_minutes`.
  - `skills`/`exercise_types`: độ chính xác lần đầu (`attempt_no = 1`, `score` trung bình) trong cửa sổ và cửa sổ liền trước; kỹ năng lấy từ `unnest(lessons.skills)`; `accuracy = null` khi < 10 câu. Luôn trả đủ 6 kỹ năng và 5 dạng bài.
  - `estimates`: dòng mới nhất mỗi kỹ năng từ `skill_estimates` (ưu tiên `assessment` > `diagnostic` > `self_report`).
  - `mistakes`: ≤ 10 bài tập sai nhiều nhất trong cửa sổ (verdict `incorrect`), kèm chữ prompt rút gọn 120 ký tự, tiêu đề bài.
  - `motivation`: `null` nếu `show_motivation = false`; ngược lại tính xp, streak, thử thách tuần (`target_days` = số ngày có lịch trong tuần ISO hiện tại, `done_days` = số ngày đó đã active, `completed_weeks` = số tuần đã qua đạt), trao huy hiệu còn thiếu (`insert … on conflict do nothing`), trả `new_badges` là những huy hiệu vừa chèn.
- Grants như các spec trước: revoke public/anon, grant authenticated cho RPC; hàm nội bộ revoke hết.

## 3. Analytics (migration `20261015000110_analytics.sql`)

- **`analytics_events`** `(id bigint identity, user_id uuid not null → auth.users on delete cascade, name text check ∈ ANALYTICS_EVENTS, props jsonb ≤ 1 KB, route text ≤ 80, client_at timestamptz, created_at)`. RLS bật, policy select-own; client không insert trực tiếp.
- **`track_events(p_events jsonb) → integer`**: mảng ≤ 20; mỗi phần tử kiểm tra tên, props (≤ 8 khoá `^[a-z_]{1,32}$`, giá trị string ≤ 64 / number / boolean), route không chứa `?`/`#`; quá 120 sự kiện/phút → `rate_limited`; `analytics_opt_out` → trả 0 không ghi. Sai định dạng → `invalid_event`.
- **`purge_analytics() → integer`** (chỉ `service_role`): xoá sự kiện > 180 ngày.

## 4. Web

- `features/progress/`: `service.ts` (`getProgressDashboard`), `useProgressDashboard(pathId, range)` (mẫu hook như `useReviewSummary`: `{status, data, error, reload}`, giữ dữ liệu cũ khi đổi range), `useMotivationPrefs()` (đọc/ghi `user_preferences`), `error-map.ts`, `progress-fixtures.ts`.
- `features/analytics/`: `track(name, props?)` xếp hàng trong bộ nhớ, gửi lô mỗi 10 s / khi đủ 20 / khi `pagehide` (`track_events`), nuốt mọi lỗi, no-op khi chưa đăng nhập hoặc opt-out; `RouteTracker` (trong `AppLayout`) phát `page_view` với route pattern lấy từ `useMatches()`.
- `routes/app/progress/`: `ProgressPage` (thay `ComingSoonPage`), gồm:
  - Bộ chọn 7/14/28 ngày (giữ trong `?khoang=`).
  - **Hoạt động:** biểu đồ cột SVG tự vẽ (phút/ngày so với mục tiêu, ngày nghỉ hiển thị khác), có bảng ẩn cho trình đọc màn hình; tổng hôm nay/tuần/mục tiêu tuần, bài đã xong, lượt ôn, bài vận dụng.
  - **Học tập:** giữ lại sau trì hoãn (`retention_30d` từ `review_summary` có sẵn, nhãn "Chưa đủ dữ liệu" khi null), số mục thành thạo; độ chính xác theo kỹ năng và dạng bài với chênh lệch so với kỳ trước bằng chữ + icon (không chỉ màu).
  - **Năng lực:** ước lượng từng kỹ năng, nhãn "Ước lượng", độ tin cậy, nguồn, ngày; liên kết làm lại kiểm tra đầu vào.
  - **Lỗi thường gặp:** danh sách, liên kết về bài học.
  - **Động lực** (ẩn nếu tắt): chuỗi ngày (giải thích ngày nghỉ + ân hạn), XP tuần/tổng, thử thách tuần, lưới huy hiệu (đã đạt / chưa đạt có mô tả). Huy hiệu mới → toast một lần.
  - Hộp "Cách tính" giải thích dữ liệu nào được tính (PRD 10.2).
  - Trạng thái loading (skeleton), lỗi, offline, chưa có lộ trình, chưa có dữ liệu.
- `HomePage`: `MotivationStrip` gọn ở cuối trang (chuỗi + thử thách tuần + link Tiến độ), ẩn khi tắt.
- `SettingsPage`: mục "Động lực và dữ liệu" với hai công tắc `show_motivation`, `analytics_opt_out`.
- Gắn `track()` tại: hoàn thành onboarding, bắt đầu/hoàn thành kiểm tra đầu vào, bắt đầu/hoàn thành bài, kết thúc phiên ôn, mở sheet AI, xem trang tiến độ, nhận huy hiệu.

## 5. Kiểm thử

- pgTAP `supabase/tests/progress.test.sql`: xp từng trigger, trần 300, `after_reveal` không cộng, active_ms bị kẹp; streak với ngày nghỉ, ân hạn 1/tuần, hôm nay chưa học; range sai; path người khác; skills đủ 6 + null khi < 10; huy hiệu không trao trùng và `new_badges` chỉ lần đầu; `show_motivation=false` → null; A không đọc `activity_days`/`user_badges` của B.
- pgTAP `supabase/tests/analytics.test.sql`: tên lạ, props quá khoá/quá dài, > 20 sự kiện, rate limit, opt-out trả 0, client không select được bảng, purge chỉ service_role.
- Vitest: service/hook/error map; `track` (gom lô, pagehide, opt-out, nuốt lỗi); từng component Tiến độ (null accuracy → "Chưa đủ dữ liệu", delta bằng chữ, bảng ẩn cho biểu đồ, động lực ẩn); settings toggles.
- Playwright `progress.spec.ts`: mock `get_progress_dashboard` + `track_events` (mặc định toàn cục trả 0); trang hiển thị đủ khu vực, đổi khoảng, tắt động lực trong cài đặt, axe, không cuộn ngang trên 6 thiết bị.
