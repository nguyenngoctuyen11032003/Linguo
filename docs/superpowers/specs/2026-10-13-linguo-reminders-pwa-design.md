# Linguo — Spec 10: Nhắc học, báo cáo tuần và PWA

**Ngày:** 2026-10-13 · **Trạng thái:** Đã duyệt (người dùng giao toàn quyền hoàn thiện) · **Nguồn:** PRD 11, 17.2, 19 P1 (nhắc ôn, báo cáo tuần, PWA, lưu bài dở, offline giới hạn) · **Chủ sở hữu:** phiên linguo-27

**Ngoài phạm vi:**
- Email marketing.
- SMS.
- Thông báo native qua app store.
- Offline toàn phần (chỉ offline giới hạn: vỏ ứng dụng, bài đã mở, hàng đợi nộp bài đã có từ Spec 2).

## 1. Mục tiêu

- Người học chọn giờ nhắc, ngày trong tuần, giờ yên lặng và số lần nhắc tối đa mỗi ngày.
- Mỗi nhắc nhở dẫn tới đúng một hành động rõ ràng: ôn 5 phút, tiếp tục bài dở, hoặc làm bài kiểm tra ngắn.
- Nếu người học bỏ qua nhiều lần, hệ thống tự giảm tần suất.
- Báo cáo tuần nêu điều đã đạt, một điểm yếu và một đề xuất điều chỉnh.
- Lời lẽ không gây cảm giác tội lỗi.
- Có thể cài app (PWA). Mở lại khi mất mạng vẫn thấy vỏ ứng dụng và trang ngoại tuyến thân thiện.

## 2. Dữ liệu (migration `20261015000300_reminders.sql`)

Mọi bảng có `user_id → auth.users on delete cascade` và RLS select-own.

### Bảng

**`notification_prefs`** (PK `user_id`)
- `reminders_enabled bool default false`
- `remind_at time default '19:30'`
- `remind_days smallint[] default '{1,2,3,4,5,6,7}'`
- `quiet_start time default '22:00'`, `quiet_end time default '07:00'`
- `max_per_day smallint 1..3 default 1`
- `weekly_summary bool default true`
- `push_enabled bool default false`
- `ignored_streak int default 0`, `backoff_level smallint 0..3 default 0`
- `updated_at`

Client ghi qua RPC `set_notification_prefs(p jsonb)`. RPC kiểm tra hợp lệ; nếu mọi ngày đều tắt thì coi như tắt nhắc.

**`push_subscriptions`**
- Cột: `id`, `user_id`, `endpoint text unique`, `p256dh`, `auth`, `user_agent ≤ 200`, `created_at`, `last_success_at`, `failure_count`.
- RPC: `save_push_subscription(p_endpoint, p_p256dh, p_auth, p_user_agent)` và `delete_push_subscription(p_endpoint)`.
- Tối đa 5 thiết bị mỗi người; vượt quá thì xoá thiết bị cũ nhất.

**`notifications`** (hộp thư trong app)
- Cột: `id`, `user_id`, `kind` (`review_due` | `resume_lesson` | `quick_check` | `weekly_summary`), `title_vi ≤ 80`, `body_vi ≤ 300`, `action_url` (đường dẫn nội bộ bắt đầu bằng `/app/`), `payload jsonb`, `local_day`, `created_at`, `delivered_push_at`, `read_at`, `clicked_at`.
- RPC: `mark_notification(p_id, p_action 'read'|'clicked')`, `list_notifications(p_limit, p_before)`, `unread_notification_count()`.
- Giữ 90 ngày.

### `generate_due_notifications(p_now timestamptz) → jsonb` (chỉ `service_role`)

Duyệt người dùng có `reminders_enabled` (hoặc `weekly_summary` vào chủ nhật). Theo `profiles.timezone`, chọn người thoả tất cả điều kiện:
- Hôm nay là ngày trong `remind_days`.
- Giờ địa phương nằm trong cửa sổ `[remind_at, remind_at + 15 phút)`.
- Không rơi vào giờ yên lặng (xử lý khoảng qua nửa đêm).
- Số nhắc hôm nay còn dưới `max_per_day`.
- Backoff cho phép: level 1 bỏ ngày lẻ, level 2 chỉ T2/T4/T6, level 3 chỉ T2.
- Hôm nay chưa active (Spec 8 `activity_days`).

Chọn **một** nhắc theo ưu tiên:
1. `resume_lesson`: có `lesson_runs` đang dở trong 7 ngày.
2. `review_due`: có thẻ đến hạn. Body: "Có N thẻ đang chờ — ôn 5 phút là đủ".
3. `quick_check`: không có hai loại trên.

Báo cáo tuần: chủ nhật lúc `remind_at` (hoặc 19:30), lấy dữ liệu 7 ngày từ `activity_days` và `get_progress_dashboard`:
- Đạt: số phút và số buổi so với lịch.
- Điểm yếu: kỹ năng có độ chính xác thấp nhất, đủ mẫu.
- Một đề xuất, ví dụ "Thử giảm mục tiêu xuống X phút/ngày" khi chỉ đạt dưới 50% lịch, hoặc "Thêm 1 buổi luyện Nghe".

Chèn các dòng vào `notifications` và trả `[{notification_id, user_id, title, body, url}]` cho các user có push. Gọi lại cùng `p_now` thì không tạo trùng (unique `(user_id, kind, local_day)`).

### Bỏ qua và backoff

- Nhắc không được click trong 24 giờ → `ignored_streak + 1`.
- Khi `ignored_streak` đạt 3 → `backoff_level + 1` (tối đa 3) và reset `ignored_streak`.
- Click, hoặc active trong ngày → `backoff_level - 1` (tối thiểu 0) và reset `ignored_streak`.
- Cài đặt hiển thị trạng thái này: "Linguo đang nhắc thưa hơn vì bạn bận — bấm để nhắc như cũ".

### Dọn dẹp

`purge_notifications()` (service_role) xoá dòng quá 90 ngày.

## 3. Gửi push

**Edge Function `notify-dispatch`** (Deno, `verify_jwt = false`, chỉ chấp nhận header `Authorization: Bearer <NOTIFY_CRON_SECRET>`):
1. Gọi `generate_due_notifications(now())` bằng service role.
2. Gửi Web Push qua VAPID (`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`), dùng một thư viện Web Push chạy trên Deno, phiên bản cố định.
3. Kết quả gửi:
   - Endpoint trả 404/410 → xoá subscription.
   - Lỗi khác → `failure_count + 1`; xoá khi `failure_count ≥ 5`.
   - Thành công → cập nhật `delivered_push_at`.

Nội dung push chỉ gồm tiêu đề, nội dung và URL; không chứa dữ liệu học tập nhạy cảm.

Thiếu VAPID thì vẫn tạo hộp thư trong app và bỏ qua push (không lỗi).

**Lịch chạy:** workflow `.github/workflows/notify.yml`, cron mỗi 15 phút, gọi function bằng secret.

**Client:** `VITE_VAPID_PUBLIC_KEY` là khoá công khai, được phép đặt trong biến môi trường client.

## 4. PWA

- Dùng `vite-plugin-pwa` (phiên bản cố định, chiến lược `injectManifest`), service worker `apps/web/src/sw.ts`.
- **Precache:** vỏ ứng dụng (HTML, JS, CSS, font, icon).
- **Runtime cache:**
  - Ảnh và audio nội dung: `CacheFirst`, 7 ngày, tối đa 200 mục.
  - REST/RPC Supabase **không** cache (dữ liệu cá nhân).
  - Riêng `get_lesson`: dùng cache bài học của Spec 2 trong IndexedDB như hiện có.
- **Điều hướng khi offline:** trả `index.html` đã precache. App hiện `OfflineBanner` sẵn có, và trang nào cần mạng thì hiện trạng thái "Cần kết nối" thân thiện.
- **Cập nhật:** khi có SW mới, hiện toast "Đã có phiên bản mới — Tải lại". Không tự reload giữa lúc đang làm bài.
- **Push trong SW:**
  - `push` → `showNotification` (icon, badge, `data.url`).
  - `notificationclick` → mở hoặc focus tab tại `data.url`, rồi gọi `mark_notification` qua `postMessage` cho app.
- **Manifest** (`public/manifest.webmanifest` đã có): rà lại `start_url` và `scope` theo `BASE_URL`; thêm `shortcuts` (Ôn tập, Học tiếp) và `screenshots` nếu có ảnh.
- **CSP:** phiên kia thêm CSP meta vào `index.html`. Cần đảm bảo có `worker-src 'self'` và `manifest-src 'self'`; phối hợp khi merge.
- **Gợi ý cài đặt:** nút "Cài Linguo lên máy" trong Cài đặt (`beforeinstallprompt`). Trên iOS hiện hướng dẫn "Chia sẻ → Thêm vào MH chính". Không popup tự động.

## 5. Web

- **`features/notifications/`:** service, `useNotificationPrefs`, `useNotifications` (danh sách, số chưa đọc, polling 60 s khi tab hiển thị), `push.ts` (xin quyền chỉ khi người dùng bấm, subscribe qua `registration.pushManager`, lưu, huỷ).
- **`NotificationBell`** ở header/sidebar: badge số chưa đọc có `aria-label`. Trang `/app/thong-bao` liệt kê thông báo; bấm một thông báo thì đánh dấu clicked và điều hướng tới hành động.
- **Cài đặt → mục "Nhắc học":**
  - Bật/tắt nhắc, giờ nhắc, chọn ngày (nút bấm theo thứ), giờ yên lặng, số lần tối đa, báo cáo tuần, bật thông báo trên thiết bị (trạng thái quyền: chưa hỏi / đã chặn kèm hướng dẫn mở lại).
  - Ghi chú: "Bạn vẫn thấy nhắc nhở trong app kể cả khi không bật thông báo thiết bị".
- **Thẻ "Báo cáo tuần"** trên Trang chủ khi có `weekly_summary` chưa đọc trong 7 ngày.
- **Copy:** không dùng "bạn lười", "bạn đã bỏ lỡ", "đừng phá chuỗi". Test có danh sách từ cấm và quét toàn bộ chuỗi trong `features/notifications` và SQL.

## 6. Kiểm thử

- **pgTAP:**
  - Cửa sổ giờ theo múi giờ, kể cả giờ yên lặng qua nửa đêm.
  - `remind_days`, `max_per_day`, các mức backoff, không trùng khi gọi lại.
  - Đã active trong ngày thì không nhắc.
  - Thứ tự ưu tiên `resume` > `review` > `quick_check`.
  - Nội dung báo cáo tuần.
  - Ignore và click điều chỉnh backoff.
  - Giới hạn 5 subscription; RLS A/B; chỉ service_role gọi được generate.
- **Deno test `notify-dispatch`:** sai secret → 401; thiếu VAPID → bỏ qua push; 410 → xoá subscription; lỗi tạm thời → tăng `failure_count`.
- **Vitest:** prefs form (validation, ngày, giờ yên lặng), luồng xin quyền push (granted/denied/unsupported), bell và trang thông báo, toast cập nhật SW, nút cài app, từ cấm.
- **Playwright:** lưu cài đặt nhắc, hộp thư thông báo (mock), nhấn thông báo thì điều hướng đúng, chạy axe; build e2e có SW đăng ký (kiểm tra `navigator.serviceWorker.controller` sau reload). Offline: `context.setOffline(true)` → reload `/app` thì vỏ ứng dụng và banner ngoại tuyến vẫn hiện.
