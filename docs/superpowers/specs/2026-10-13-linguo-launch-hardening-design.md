# Linguo — Spec 7: Hoàn thiện trước ra mắt (bảo mật, quyền riêng tư, độ tin cậy)

**Ngày:** 2026-10-13 · **Trạng thái:** Đã duyệt (người dùng giao toàn quyền hoàn thiện) · **Nguồn:** PRD 16, 17, 19 (điều kiện ra mắt), 20.3, 20.4, 22

**Ngoài phạm vi (thuộc phiên linguo-27):** PWA/service worker, analytics, thông báo, quản trị nội dung, dashboard Tiến độ.

## 1. Tài khoản và dữ liệu (migration `20261014000910_account_data.sql`)

- **`export_my_data() → jsonb`** (security definer, `auth.uid()`). Trả về dữ liệu của chính người gọi:
  - `profiles`, `user_preferences`.
  - `learning_paths`, `skill_estimates`.
  - `lesson_runs` (kèm `attempts`).
  - Thẻ ôn và `review_logs`.
  - Phiên chẩn đoán và phản hồi.
  - `ai_usage` (chỉ metadata), `ai_reports`.
  - `study_sessions`, nếu bảng tồn tại.

  Không có nội dung bài học hay khoá đáp án. Giới hạn 5 lần/giờ, vượt thì báo `rate_limited`.
- **`delete_my_account(p_confirm text) → void`**:
  - `p_confirm` phải đúng bằng `'XOA TAI KHOAN'`, nếu không trả `invalid_confirmation`.
  - Xoá `auth.users` của người gọi (security definer, owner postgres). Mọi bảng người dùng cascade theo; bảng nào chưa cascade thì xoá tường minh trước.
  - Ghi `account_deletions (id, deleted_at, reason_code)`, không lưu `user_id` hay email.
- **`purge_expired_data() → jsonb`** (chỉ `service_role`). Xoá:
  - `ai_cache` đã hết hạn.
  - `ai_usage` > 90 ngày.
  - `ai_quota` > 60 ngày.
  - `study_sessions` bị bỏ dở > 180 ngày, nếu có.
  - Trả về số dòng đã xoá.
- **Workflow `.github/workflows/maintenance.yml`:**
  - Chạy hằng ngày bằng `schedule`, ngoài ra `workflow_dispatch`, environment `production`.
  - Gọi `purge_expired_data` qua REST bằng `SUPABASE_SERVICE_ROLE_KEY`; key không được in ra log.
- **pgTAP `account_data.test.sql`:**
  - Export chỉ chứa dữ liệu của mình.
  - Sai chuỗi xác nhận thì bị từ chối.
  - Xoá tài khoản kéo theo xoá dữ liệu, tài khoản B vẫn nguyên.
  - anon không gọi được; authenticated không gọi được `purge`.
- **pgTAP `rls_cross_user.test.sql`:**
  - Với mọi bảng `public` có cột `user_id` hoặc liên kết lộ trình: user A không select/insert/update/delete được dữ liệu của B qua bảng.
  - Mọi RPC nhận id (path/run/card/session/usage) đều trả lỗi khi nhận id của B.
  - Liệt kê bảng tự động từ `information_schema`, để bảng mới thêm sau này cũng được kiểm tra.

## 2. Web

- **Cài đặt, mục "Tài khoản và dữ liệu"** (`settings/AccountDataSection.tsx`):
  - "Tải dữ liệu của tôi" tải file JSON `linguo-du-lieu-YYYY-MM-DD.json`.
  - "Xoá tài khoản" mở dialog: giải thích dữ liệu nào bị xoá, người dùng gõ `XOA TAI KHOAN`, xoá xong thì đăng xuất và về trang chủ.
  - Có dòng mô tả dữ liệu đang lưu và thời hạn lưu.
- **Trang công khai:**
  - `/quyen-rieng-tu`: dữ liệu thu thập, mục đích, Gemini nhận gì, thời hạn lưu, cách xuất/xoá, liên hệ.
  - `/dieu-khoan`: AI là gợi ý học tập, không phải đáp án chính thức; giới hạn trách nhiệm.
  - Footer landing và Cài đặt có link tới cả hai trang.
- **Tin cậy:**
  - Error boundary cho từng route: "Có lỗi xảy ra" + "Thử lại" + "Về trang chủ". Không lộ stack ở production.
  - Trang 404 tiếng Việt.
  - `OfflineBanner` toàn app dùng `navigator.onLine` và sự kiện online/offline: "Bạn đang ngoại tuyến — tiến độ sẽ được lưu khi có mạng".
  - Rà lại lesson player và ôn tập: câu trả lời chưa được server xác nhận phải hiện "Đang chờ đồng bộ", không được hiện là đã lưu. Gửi lại dùng idempotency key sẵn có. Nếu đã có thì chỉ thêm test.

## 3. Bảo mật và vận hành

- **CSP qua `<meta http-equiv>` trong `apps/web/index.html`.** GitHub Pages không cho đặt header nên dùng meta.
  - Chỉ cho phép `self`, domain Supabase (lấy từ `VITE_SUPABASE_URL` lúc build qua plugin Vite), Google Fonts nếu dùng.
  - Đặt `frame-ancestors` qua meta không có hiệu lực, nên ghi rõ giới hạn này trong tài liệu.
  - Thêm `referrer` = `strict-origin-when-cross-origin`.
- **`scripts/check-bundle-secrets.mjs`** (+ test), chạy trong CI sau build. Fail nếu trong `apps/web/dist` có:
  - Chuỗi dạng `AIza[0-9A-Za-z_-]{35}`.
  - `service_role`, hoặc JWT có role service_role.
  - `sb_secret_`.
  - File `.map`.
- **CI quét lịch sử Git:** job `secrets` dùng gitleaks (action pin theo SHA), với config allowlist cho file mẫu `.env.example`.
- **Edge Function `ai-tutor`:**
  - Thêm giới hạn theo IP trong bộ nhớ: 30 request/phút/IP, đọc từ `x-forwarded-for`.
  - Vượt giới hạn trả 429 `quota_exceeded` với `retry_after_sec`, không trừ lượt.
  - Có Deno test.
- **`docs/RUNBOOK.md`:**
  - Backup: Supabase daily backup và cách khôi phục.
  - RPO 24h / RTO 4h cho MVP.
  - Rollback web: chạy lại Deploy trên commit trước.
  - Rollback DB: chỉ bằng forward migration.
  - Xoay vòng key Gemini/service role.
  - Xử lý hết quota Gemini.
  - Checklist ra mắt: PRD 19, 20.3, 22.
- **README:** cập nhật trạng thái và link tài liệu.

## 4. Kiểm thử UX và a11y (wave 2)

- Playwright quét axe mọi route chính trên iPhone/Android/desktop:
  - `/`, đăng nhập, `/app`, học, bài học, ôn, chẩn đoán, gia sư, cài đặt, phiên học, quyền riêng tư, điều khoản, 404.
- Kiểm tra điều hướng bàn phím và focus, trạng thái offline (`context.setOffline`), và `prefers-reduced-motion`.
- Sửa test flake `layout.spec.ts` "no horizontal scroll on /": thay việc chờ cố định bằng chờ animation kết thúc (`document.getAnimations()`), hoặc chạy với reduced motion.
