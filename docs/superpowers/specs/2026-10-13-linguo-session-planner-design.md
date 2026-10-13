# Linguo — Spec 6: Trình lập kế hoạch phiên học

**Ngày:** 2026-10-13 · **Trạng thái:** Đã duyệt (người dùng giao toàn quyền hoàn thiện) · **Nguồn:** PRD 5.4, 5.5, 7.4, 7.5, 19 P0 mục 7
**Hợp đồng (Wave 0, đã commit):** `packages/shared/src/planner/contract.ts`

**Ngoài phạm vi (thuộc phiên linguo-27):** dashboard Tiến độ, analytics, luyện thi, thông báo/gamification, PWA, quản trị nội dung.

## 1. Mục tiêu

Trang chủ trả lời "Hôm nay nên học gì, vì sao". Người học chọn phiên 10–120 phút. Hệ thống tạo danh sách hoạt động (ôn đến hạn, học bài mới, luyện kỹ năng yếu, tổng kết), mỗi hoạt động kèm lý do. Người học đổi được thứ tự, rút gọn phiên, và tiếp tục sau khi tải lại trang.

## 2. Kiến trúc

- **Planner thuần TS** `packages/shared/src/planner/plan.ts`: `planSession(inputs: SessionInputs, minutes: number): SessionPlan` và `shortenPlan(plan, minutes): SessionPlan`. Kết quả tất định, không gọi I/O, không dùng `Date.now`.
- **Server chỉ cấp dữ liệu và kiểm tra:**
  - `get_session_inputs` trả số liệu đầu vào.
  - `save_session_plan` kiểm tra hình dạng plan, kiểm tra mọi `lesson_id` thuộc lộ trình và đã xuất bản, rồi lưu.
  - Không cần SQL tương đương thuật toán, vì plan chỉ quyết định thứ tự gợi ý, không ảnh hưởng điểm hay lịch ôn.
- **Phân bổ mặc định** theo PRD 5.5, tính theo tỷ lệ số phút:
  - Ôn tập: 20%, tối thiểu 5 phút nếu có thẻ đến hạn.
  - Bài mới: 30%.
  - Luyện kỹ năng yếu: 30%.
  - Tổng kết: 10%, tối thiểu 3 phút khi phiên ≥ 30 phút.
  - Phiên ≤ 15 phút chỉ gồm ôn tập và một bài, không có tổng kết.
- **Ước lượng thời gian ôn:** 12 giây/thẻ đến hạn, 30 giây/thẻ mới. `review_limit` = số thẻ vừa với số phút được cấp.
- **Chế độ tồn đọng** (`backlog_mode`) bật khi một trong hai điều kiện đúng:
  - Số phút cần cho thẻ đến hạn > 2 × số phút ôn mặc định.
  - `days_since_last_study ≥ 4`.
- **Khi chế độ tồn đọng bật** (PRD 7.4, 7.5 "không đổ toàn bộ backlog vào một ngày"):
  - Ôn tập tăng tới 50%.
  - Bài mới giảm còn một bài ngắn, hoặc 0 nếu phiên ≤ 15 phút.
  - Giới hạn ôn = phút × 60 / 12.
  - `focus_vi` dùng giọng khích lệ, ví dụ "Quay lại nhẹ nhàng: ôn 40 thẻ quan trọng nhất trước".
- **Ưu tiên của từng hoạt động:**
  - Ôn quá hạn: 90.
  - Bài đang dở: 80.
  - Ôn đến hạn: 75.
  - Bài mới: 60.
  - Kỹ năng yếu: 50 + (1 − độ chính xác) × 20.
  - Tổng kết: 10.
  - `shortenPlan` giữ các hoạt động ưu tiên cao nhất cho vừa số phút mới, và co hoạt động cuối nếu cần.
- **Chọn bài cho kỹ năng yếu:**
  - Kỹ năng yếu nhất là kỹ năng có `recent_accuracy` thấp nhất. Nếu không có `recent_accuracy`, chọn kỹ năng có confidence `self_reported` hoặc `low`.
  - Lấy bài đầu tiên trong `next_lessons` có `skills` chứa kỹ năng đó, chưa dùng cho hoạt động bài mới.
  - Không có bài phù hợp thì bỏ hoạt động này và dồn số phút vào bài mới.
- **Lý do:** mỗi hoạt động có `reason_vi` cụ thể, ví dụ:
  - "18 thẻ đến hạn, 6 thẻ quá hạn"
  - "Bài tiếp theo trong lộ trình A1"
  - "Ngữ pháp đang đúng 58% trong 2 tuần qua"
- **Không có dữ liệu thì không hiển thị số giả** (PRD 5.4).

## 3. Dữ liệu (migration `20261014000900_session_planner.sql`)

**Bảng `study_sessions`:**
- Cột: `id`, `user_id`, `path_id` (fk, cascade), `local_date`, `status`, `minutes_planned`, `plan jsonb` (≤ 32 KB), `created_at`, `started_at`, `completed_at`.
- Unique partial index: tối đa một phiên `planned`/`in_progress` trên mỗi `(path_id, local_date)`.
- RLS: chỉ chủ sở hữu được select; không grant ghi.

**RPC** (đều `security definer`, `search_path=''`, `auth.uid()`, P0001 với mã snake_case trong `SESSION_ERROR_CODES`, revoke anon):
- `get_session_inputs(p_path_id) → jsonb`, theo `sessionInputsSchema`:
  - `local_date` lấy từ `learning_user_today`.
  - Số thẻ đến hạn và quá hạn lấy từ bảng thẻ của spec 3.
  - `next_lessons` lấy từ `path_lessons`.
  - `recent_accuracy` tính từ `attempts` 14 ngày gần nhất, nối với `lessons.skills`.
  - `days_since_last_study` lấy max của: `lesson_runs` hoàn thành, `review_logs`, và `study_sessions` có hoạt động.
- `save_session_plan(p_path_id, p_plan jsonb, p_replace boolean) → jsonb`:
  - Kiểm tra số hoạt động 1–12, `id` dạng `a\d+` không trùng, `kind`/`status` hợp lệ, tổng phút ≤ 130, và lesson thuộc lộ trình.
  - Nếu `p_replace = false` và đã có phiên mở thì trả về phiên đó.
  - Kết quả là một `studySessionSchema`.
- `get_today_session(p_path_id) → jsonb`, theo `todaySessionResultSchema`.
- `update_session_item(p_session_id, p_item_id, p_status, p_seconds) → jsonb` (session):
  - Lần cập nhật đầu tiên chuyển phiên sang `in_progress`.
  - Khi mọi hoạt động đã `done`/`skipped`, phiên tự chuyển `completed`.
  - Trả `session_closed` nếu phiên đã đóng.
- `reorder_session(p_session_id, p_order text[]) → jsonb`: chỉ nhận hoán vị của các `id` hiện có.
- `finish_session(p_session_id, p_status) → jsonb`.

## 4. Web

**`apps/web/src/features/session/`:**
- `service.ts` (gọi RPC, parse bằng zod).
- `error-map.ts`.
- `useTodaySession(pathId)`.
- `usePlanner()`: lấy inputs, chạy `planSession`, rồi lưu.
- `sessionLink(sessionId, itemId)` dựng URL bài học hoặc ôn tập kèm `?phien=&muc=`.

**`/app/phien-hoc` (`SessionPage`):**
- Chọn độ dài bằng chip, mặc định là số phút mục tiêu của hôm nay làm tròn về giá trị gần nhất.
- Xem trước kế hoạch: mỗi hoạt động có phút, lý do, nút lên/xuống (bàn phím được) và nút bỏ qua.
- Nút "Bắt đầu phiên học" mở hoạt động đầu tiên còn `pending`.
- Nút "Rút gọn còn 10 phút" chạy `shortenPlan` rồi lưu với `p_replace = true`.
- Phiên đang chạy hiện tiến độ x/y. Tải lại trang thì khôi phục từ server.
- Hoàn thành thì hiện màn tổng kết: thời gian, số hoạt động, lời khích lệ không gây áp lực.

**Tích hợp với bài học và ôn tập:**
- Nếu URL có `?phien=&muc=`, khi hoàn thành bài học hoặc khi hết số thẻ `review_limit`, gọi `update_session_item(done, seconds)` rồi quay về `/app/phien-hoc`.
- Nếu không có các tham số này, hành vi giữ nguyên như hiện tại.
- Hoạt động `recap` là một màn trong `SessionPage`, liệt kê các lỗi sai hôm nay từ `attempts` (RPC `session_recap(p_session_id)` trả tối đa 10 lỗi: prompt, đáp án đúng, câu trả lời của người học), kèm nút "Giải thích AI" dùng `AiExplainSheet`.

**Trang chủ: thêm `TodayCard` ở đầu.** Thẻ gồm:
- Thời lượng mục tiêu và số phút đã học hôm nay.
- Nút "Bắt đầu phiên học", hoặc "Tiếp tục phiên" khi đang dở.
- `focus_vi` và kỹ năng ưu tiên kèm lý do.
- Gợi ý "Chỉ có 10 phút?" để tạo phiên ngắn.

Các thẻ hiện có vẫn giữ nguyên.

## 5. Kiểm thử

- **Vitest planner (bảng ca):**
  - Mỗi độ dài phiên.
  - Không có thẻ đến hạn.
  - Chế độ tồn đọng.
  - Nghỉ lâu.
  - Không có bài tiếp theo.
  - Không có dữ liệu kỹ năng.
  - Tổng phút ≤ phút yêu cầu.
  - `shortenPlan` giữ ưu tiên cao nhất.
  - Kết quả luôn qua được `sessionPlanSchema`.
- **pgTAP:**
  - Mỗi RPC và từng mã lỗi.
  - Chỉ một phiên mở mỗi ngày.
  - Từ chối hoán vị sai.
  - Từ chối lesson của lộ trình hoặc ngôn ngữ khác.
  - Hai tài khoản không thấy hoặc sửa được phiên của nhau.
  - anon không execute được.
- **Vitest web:** service, các hook, `SessionPage` (chọn độ dài, đổi thứ tự, rút gọn, khôi phục), `TodayCard`.
- **Playwright (mock RPC theo `fixtures.ts`):**
  - Tạo phiên → làm bài → quay về phiên → hoàn thành.
  - Tải lại trang giữa phiên.
  - Đổi thứ tự bằng bàn phím.
  - axe trên iPhone/Android.
