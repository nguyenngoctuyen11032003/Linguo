# Linguo — Spec 11: Báo lỗi nội dung và trang quản trị

**Ngày:** 2026-10-13 · **Trạng thái:** Đã duyệt (người dùng giao toàn quyền hoàn thiện) · **Nguồn:** PRD 12.3 (trang quản trị nội dung), 18, 19 P0 mục 11 (báo lỗi nội dung) và mục 12 (analytics nội bộ – phần xem), 20.1 · **Chủ sở hữu:** phiên linguo-27

## 1. Quyết định nguồn sự thật

- Nội dung học (bài, mục từ, câu kiểm tra, đề thi) vẫn được **soạn trong repo** (`content/**.yaml`). Pipeline đã có: kiểm tra, băm nội dung, tăng version, `content-publish.yml` có phê duyệt.
- Trang quản trị **không** sửa nội dung trực tiếp trong DB, vì như vậy repo và DB sẽ lệch nhau. Trang quản trị dùng để:
  - Xem trước đúng như người học thấy, kèm đáp án.
  - Theo dõi trạng thái và lịch sử version.
  - Duyệt: chuyển trạng thái, ghi người duyệt.
  - Xử lý báo lỗi.
  - Quản lý nguồn và giấy phép (chỉ xem).
  - Xem analytics và mức dùng AI.
- Khi cần sửa nội dung, trang quản trị sinh **gợi ý sửa YAML** (đường dẫn file, khoá, đoạn trích) để người soạn sửa trong repo.
- AI sinh nội dung hàng loạt chỉ được tạo bản nháp trong repo; không bao giờ tự publish.

## 2. Báo lỗi nội dung (người học)

**Migration `20261015000400_content_reports.sql`**

Bảng `content_reports`:
- `id`, `user_id → auth.users on delete cascade`
- `target_kind` (`exercise` | `learning_item` | `lesson` | `assessment_item` | `exam_question`), `target_id uuid`, `content_version int`
- `reason` (`wrong_answer` | `unclear` | `typo` | `audio` | `translation` | `offensive` | `other`), `note ≤ 500`
- `status` (`open` | `triaged` | `fixed` | `rejected` | `duplicate`), `resolution_note ≤ 500`, `resolved_by`, `resolved_at`, `created_at`
- RLS select-own: người học thấy báo lỗi của chính mình và trạng thái xử lý.

RPC `report_content(p_target_kind, p_target_id, p_reason, p_note)`:
- Kiểm tra target tồn tại và đã xuất bản.
- Rate limit 20 báo lỗi mỗi ngày.
- Cùng target bị báo trong 24 giờ thì trả `duplicate` nhưng vẫn ghi nhận.
- Trả `{report_id}`.

Web: nút "Báo lỗi nội dung" (dialog chọn lý do + ghi chú) đặt ở:
- `FeedbackPanel` của bài học.
- Mặt sau thẻ ôn.
- Mỗi câu trong phần xem lại kết quả thi.
- Báo cáo đầu vào: mỗi câu đã làm, nếu có màn xem lại.

Cài đặt có mục "Báo lỗi của tôi" liệt kê các báo lỗi và trạng thái.

## 3. Phân quyền quản trị (migration `20261015000410_admin.sql`)

**Bảng và hàm phân quyền**
- `staff_roles (user_id pk → auth.users cascade, role 'editor'|'reviewer'|'admin', granted_by, granted_at)`.
- RLS: chỉ được select dòng của chính mình.
- Chỉ cấp vai trò bằng SQL thủ công hoặc RPC `admin_grant_role` (chỉ `admin` gọi được). Ghi rõ cách bootstrap admin đầu tiên trong `docs/DEPLOY.md`.
- Helper `public.staff_role()` trả vai trò của người gọi, hoặc null.

**RPC**
- Tất cả: security definer, kiểm tra vai trò, `staff_forbidden` nếu không đủ quyền.
- Mỗi RPC thay đổi dữ liệu ghi một dòng vào `admin_audit_log (id, actor, action, target_kind, target_id, detail jsonb, created_at)`.
- RPC đọc (editor+):
  - `admin_content_overview()`: số lượng theo loại × trạng thái × ngôn ngữ; số `is_demo`; số báo lỗi mở.
  - `admin_list_content(p_kind, p_language, p_status, p_search, p_limit, p_offset)`: cho programs/units/lessons/learning_items/exercises/assessment_items/exam_forms/exam_questions.
  - `admin_get_content(p_kind, p_id)`: đầy đủ, **bao gồm đáp án/giải thích/script** từ `content_private`, kèm lịch sử version từ `content_private.revisions`.
  - `admin_list_sources()`.
- RPC duyệt (reviewer+):
  - `admin_set_status(p_kind, p_id, p_status, p_note)`: chỉ đi theo luồng hợp lệ `draft→in_review→approved→published→archived` (cho phép quay về `in_review` từ `approved`/`published`), ghi `reviewed_by`/`reviewed_at`.
  - Không cho publish nội dung có báo lỗi `wrong_answer` đang mở trừ khi truyền `p_force` (chỉ admin).
- RPC báo lỗi (editor+):
  - `admin_list_reports(p_status, p_kind, p_limit, p_offset)`: nhóm theo target, đếm số báo lỗi.
  - `admin_resolve_report(p_report_ids uuid[], p_status, p_resolution_note)`.
- RPC thống kê (admin):
  - `admin_analytics(p_days 7|28|90)`: DAU/WAU theo ngày, số người hoàn thành onboarding, phễu onboarding → bài đầu → bài thứ 3 → quay lại ngày 7, số bài hoàn thành, phiên ôn, lượt thi.
  - `admin_ai_usage(p_days)`: số request theo task/trạng thái, tỉ lệ cache, latency p50/p95, số báo lỗi AI theo lý do (từ `ai_usage`, `ai_reports`).
  - Thống kê chỉ trả số tổng hợp, không trả `user_id` hay email.

**Lưu ý trạng thái nội dung:** import pipeline có thể ghi đè `status` khi push lại nội dung. Cần quy định ưu tiên rõ ràng: pipeline không hạ `published` xuống trạng thái khác nếu hash không đổi. Kiểm tra `import_*` hiện có và thêm migration mới nếu cần; **không sửa migration cũ**.

## 4. Web quản trị

- Route `/quan-tri/*`, lazy-loaded thành chunk riêng.
  - Guard: phải đăng nhập và `staff_role()` không null; nếu không thì hiện trang 404, không tiết lộ là trang tồn tại.
  - Layout riêng, gọn, ưu tiên desktop nhưng vẫn dùng được trên mobile.
  - Header ghi rõ "Quản trị".
- **Tổng quan:** thẻ số liệu, cảnh báo nội dung demo/chưa kiểm duyệt, báo lỗi mở.
- **Nội dung:**
  - Bảng có lọc (loại, ngôn ngữ, trạng thái, tìm kiếm) và phân trang.
  - Trang chi tiết:
    - Xem trước dùng lại component của người học (ExerciseFrame, Flashcard, QuestionView).
    - Đáp án, giải thích, nguồn và giấy phép.
    - Lịch sử version.
    - Báo lỗi liên quan.
    - Nút chuyển trạng thái theo vai trò.
    - Khối "Gợi ý sửa trong repo": đường dẫn file theo key và đoạn YAML hiện tại, có nút sao chép.
- **Báo lỗi:** hàng đợi nhóm theo target; chọn nhiều để đánh dấu fixed/rejected/duplicate; có ghi chú.
- **Nguồn:** danh sách nguồn, giấy phép, yêu cầu ghi công.
- **Analytics:** biểu đồ SVG tự vẽ, dùng lại `ActivityChart` nếu phù hợp; phễu; mức dùng AI.
- **Nhật ký:** `admin_audit_log` gần đây (admin).
- Chặn index: thêm `noindex` cho route quản trị.

## 5. Kiểm thử

- **pgTAP:**
  - `report_content`: target chưa publish bị từ chối, rate limit, duplicate, RLS A/B.
  - Phân quyền: người thường gọi mọi `admin_*` → `staff_forbidden`.
  - Editor không đổi được status; reviewer đổi được; luồng trạng thái sai bị từ chối; chặn publish khi còn báo lỗi `wrong_answer`.
  - `admin_get_content` trả đáp án cho staff, nhưng người học vẫn không đọc được `content_private`.
  - Mọi thay đổi đều có audit log.
  - Analytics không trả `user_id`.
  - Import không hạ trạng thái `published`.
- **Vitest:** dialog báo lỗi (lý do, ghi chú, giới hạn ký tự, lỗi rate limit); guard quản trị; bảng lọc; chi tiết; chuyển trạng thái; xử lý báo lỗi hàng loạt.
- **Playwright:** người học báo lỗi từ bài học; staff xem hàng đợi và đánh dấu fixed; người thường mở `/quan-tri` thì nhận 404; chạy axe.
