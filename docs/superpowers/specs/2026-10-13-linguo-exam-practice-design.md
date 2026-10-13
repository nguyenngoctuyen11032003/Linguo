# Linguo — Spec 9: Luyện thi (TOPIK I/II, CEFR)

**Ngày:** 2026-10-13 · **Trạng thái:** Đã duyệt (người dùng giao toàn quyền hoàn thiện) · **Nguồn:** PRD 9.1–9.3, 10.1 (điểm thi thử), 12.3, 19 P1 · **Chủ sở hữu:** phiên linguo-27
**Hợp đồng (Wave 0):** `packages/shared/src/exam/contract.ts`

**Ngoài phạm vi:** đề thi chính thức hoặc sao chép đề/giao diện chính thức; AI sinh câu hỏi trong lúc thi (không bao giờ); IELTS/TOEIC; nói. Nhận xét AI cho bài viết là Spec 9 Wave 3 (task X6), phụ thuộc ai-tutor của phiên khác.

## 1. Mục tiêu

Trang `/app/luyen-thi` cho người học luyện theo ba chế độ (PRD 9.1):
- **Thi thử toàn bài:** có giờ theo từng phần.
- **Luyện theo phần:** nghe / đọc / viết, không giờ.
- **Luyện theo dạng câu:** tối đa 10 câu cùng `question_type`, lấy từ mọi đề của cùng họ đề.

Mọi đề là **"Bài luyện mô phỏng"**, không phải đề thi chính thức. Kết quả có:
- Điểm theo phần và theo dạng câu.
- Phân tích dạng câu sai.
- Xem lại đáp án kèm giải thích.
- Với TOPIK: bậc ước lượng "quy đổi tham khảo".
- Với CEFR: "đạt mức" theo phần, **không** quy đổi điểm.

Thang điểm là dữ liệu có phiên bản và cờ `verified`. Khi chưa xác thực, giao diện nói rõ điều đó.

## 2. Nội dung

- **Thư mục và kiểm tra:** `content/exams/<en|ko>/<form>.yaml` theo `examFileSchema`.
- **Quy tắc kiểm tra chéo** (`scripts/content/check.mjs`):
  - `answer` là id một phương án (mcq).
  - `answer` là mảng đáp án chấp nhận (short_text).
  - essay không có `answer` nhưng phải có `rubric`.
  - listening phải có `script` hoặc `audio_asset_id`.
  - Có thời lượng cho mọi phần có câu hỏi.
  - level hợp lệ theo ngôn ngữ.
  - File demo có header `# DEMO — chưa kiểm duyệt`.
  - Thang điểm của file demo phải `verified: false`.
- **Đề demo tự soạn** (nguồn `src:linguo-demo`), nội dung gốc, không chép đề thật:
  - `ko/topik-i-mock-1.yaml`: nghe 10 câu + đọc 14 câu, mcq, các dạng câu kiểu TOPIK I. Giờ: nghe 15 phút, đọc 25 phút.
  - `ko/topik-ii-mock-1.yaml`:
    - Nghe 8 câu + đọc 10 câu, mcq.
    - Viết: 2 câu short_text điền câu (kiểu 51–52) và 1 essay khoảng 200–300 ký tự (kiểu 53) có rubric.
    - Giờ: 20 / 25 / 20 phút.
  - `en/cefr-a2-mock-1.yaml`: nghe 8 câu + đọc 10 câu + viết 1 essay (email ngắn) có rubric. Có `pass_ratio 0.6`, `bands: []`.
- **Thang điểm** (giá trị tại thời điểm soạn, `verified: false`, `source_note_vi` ghi rõ cần đối chiếu quy chế hiện hành):
  - TOPIK I: section_max nghe 100, đọc 100; bands topik1 ≥ 80, topik2 ≥ 140.
  - TOPIK II: nghe 100, đọc 100, viết 100; bands topik3 ≥ 120, topik4 ≥ 150, topik5 ≥ 190, topik6 ≥ 230.
- **Pipeline:**
  - `scripts/content-import.mjs` build thêm `exams` vào bundle.
  - Ghi `seed.sql` sau diagnostic.
  - `content:push` gọi `public.import_exam_content_bundle`.

## 3. Dữ liệu (migration `20261015000200_exams.sql`)

Mọi bảng chứa dữ liệu người dùng có `user_id → auth.users on delete cascade` và RLS select-own.

- **`exam_forms`:**
  - Cột: `id` (UUIDv5 từ key), `key`, `language_code`, `family`, `title_vi`, `description_vi`, `level_from`, `level_to`, `source_id`, `time_limits jsonb`, `scoring jsonb`, `status`, `is_demo`, `version`, `content_hash`, `reviewed_by`, `reviewed_at`.
  - RLS: authenticated đọc được khi `status = 'published'`.
- **`exam_questions`:**
  - Cột: `id`, `key`, `form_id`, `seq`, `section`, `kind`, `question_type`, `level_code`, `points`, `prompt jsonb` (công khai, **không** chứa `script`).
  - **Không** grant cho client. Câu hỏi chỉ được phục vụ qua RPC.
- **`content_private.exam_keys`** `(question_id, answer jsonb, explanation jsonb, script text, rubric jsonb, sample_answer text)`: không grant.
- **`exam_attempts`:**
  - Cột: `id`, `user_id`, `learning_path_id`, `form_id`, `content_version`, `mode`, `section`, `question_type`, `question_ids uuid[]` (thứ tự cố định khi bắt đầu), `status`, `started_at`, `deadline_at`, `submitted_at`, `result jsonb`.
  - Unique một phần: một `in_progress` mỗi `(user, path)`. Bắt đầu đề mới thì đóng lượt cũ thành `expired`.
- **`exam_answers`:**
  - Cột: `attempt_id`, `question_id`, `answer text`, `flagged bool`, `idempotency_key`, `payload_hash`, `updated_at`.
  - PK `(attempt_id, question_id)`. Có cột `user_id` cho RLS select-own.
- **`content_private.import_exam_bundle(jsonb)`** (+ wrapper public cho service_role):
  - Upsert theo key.
  - Đổi hash thì tăng version.
  - Câu bị gỡ khỏi file thì archive.
- **RPC** (security definer, `search_path=''`, `auth.uid()`, P0001 với mã trong `EXAM_ERROR_CODES`, revoke anon):
  - **`list_exam_forms(p_language)`:** trả `examFormSummarySchema[]`.
  - **`start_exam(p_path_id, p_form_id, p_mode, p_section, p_question_type)`:**
    - Kiểm tra ngôn ngữ path = ngôn ngữ đề (`language_mismatch`).
    - Kiểm tra mode hợp lệ (`invalid_mode`).
    - `full`: mọi câu theo seq, `deadline_at = now + tổng phút`.
    - `section`: câu của phần đó, không giờ.
    - `question_type`: ≤ 10 câu cùng loại trong mọi đề cùng family, ưu tiên câu chưa làm hoặc làm sai gần đây, không giờ.
    - `structure_warning_vi` khi goal_type của path là `topik_ii` mà đề là TOPIK I (và ngược lại), hoặc goal `cefr` mà đề không phải `cefr`.
    - Rate limit 10 lượt bắt đầu mỗi giờ.
  - **`get_exam_attempt(p_attempt_id)`:**
    - Đang làm: trả `examAttemptSchema` kèm câu đã lưu. Quá `deadline + 30 s` thì tự chấm và trả kết quả với `status = 'expired'`.
    - Đã đóng: trả `examResultSchema`.
  - **`save_exam_answer(p_attempt_id, p_question_id, p_answer, p_flagged, p_idempotency_key)`:**
    - Upsert, có idempotency.
    - Giới hạn độ dài: short_text 200, essay 5000.
    - Quá hạn thì trả `saved: false, status: 'expired'`.
  - **`submit_exam(p_attempt_id)`:**
    - Chấm server-side:
      - mcq so id.
      - short_text: NFC + trim + bỏ dấu câu cuối + không phân biệt hoa thường, so với từng đáp án chấp nhận.
      - essay không chấm.
    - Tính `by_section`, `by_question_type`.
    - TOPIK full mock: `scaled = points / max × section_max` cho từng phần, cộng thành tổng, gán band. Phần viết TOPIK II chỉ cộng short_text, có ghi chú "phần viết luận chưa tính điểm".
    - CEFR: `reached = points/max ≥ pass_ratio` theo phần.
    - Lưu `result`. Gọi lại thì idempotent.
  - **`exam_history(p_path_id, p_limit)`:** trả `examHistoryEntrySchema[]`.
- **Spec 8:** `activity_days` cộng `answers` và `active_ms` (≤ 120 s/câu, theo khoảng giữa hai lần lưu) khi nộp bài. Không cộng XP cho thi thử, để tránh thưởng làm nhanh.

## 4. Web

- **`features/exam/`:**
  - `service.ts` gọi các RPC trên và parse bằng zod.
  - Hooks: `useExamForms(language)`, `useExamAttempt(attemptId)` (đồng hồ theo `server_now`, lưu tự động debounce 800 ms, hàng đợi thử lại khi mất mạng, lưu khi `pagehide`), `useExamHistory(pathId)`.
  - `error-map.ts`.
  - `tts.ts`: Web Speech API với `lang` `ko-KR` / `en-US`, nghe tối đa 2 lần trong thi thử toàn bài. Không có giọng thì hiện nút "Hiện lời thoại" và ghi chú phương thức "đọc thay nghe".
- **Trang** (route, thay `ComingSoonPage`):
  - **`/app/luyen-thi`** (`ExamHubPage`, trong AppLayout):
    - Lọc theo họ đề, mặc định theo ngôn ngữ và goal của lộ trình hiện tại.
    - Thẻ đề có nhãn "Bài luyện mô phỏng", dải cấp độ, số câu và thời lượng theo phần, lần làm gần nhất.
    - Ba nút chế độ. Chế độ dạng câu mở danh sách dạng câu kèm số câu.
    - Lịch sử thi gần đây.
    - Cảnh báo cấu trúc ngay trên thẻ khi đề lệch goal.
  - **`/app/luyen-thi/lam-bai/:attemptId`** (`ExamRunnerPage`, toàn màn hình như LessonPage):
    - Header gồm tên đề, phần hiện tại, đồng hồ đếm ngược (đọc cho screen reader ở mốc 5 phút và 1 phút, không đọc mỗi giây).
    - Câu hỏi:
      - Đoạn văn và câu hỏi.
      - Phương án dạng radio.
      - Ô nhập short_text.
      - Textarea essay có đếm ký tự và khoảng gợi ý.
      - Nút nghe.
    - Bảng điều hướng câu (đã trả lời / đánh dấu / chưa làm, phân biệt bằng icon + chữ, không chỉ bằng màu).
    - "Nộp bài" có hộp xác nhận liệt kê số câu chưa làm.
    - Hết giờ thì tự nộp.
    - Rời trang thì có hộp xác nhận. Làm tiếp được sau khi tải lại.
  - **`/app/luyen-thi/ket-qua/:attemptId`** (`ExamResultPage`):
    - Tổng điểm và điểm theo phần.
    - Bậc ước lượng hoặc "đạt mức", có nhãn "Quy đổi tham khảo, không phải kết quả chính thức".
    - Khi `scoring_verified = false`: "Thang điểm chưa được đối chiếu với quy chế hiện hành".
    - Bảng dạng câu sai nhiều nhất kèm nút "Luyện dạng này" (`start_exam` mode `question_type`).
    - Xem lại từng câu: đáp án của mình, đáp án đúng, giải thích, lời thoại nghe.
    - Essay: bài làm, rubric dạng checklist tự đánh giá (lưu cục bộ), bài mẫu.
- **Spec 8 (Tiến độ):** thêm `ExamHistoryCard` vào `ProgressPage` (điểm thi thử kèm ngày và chế độ, PRD 10.1).
- **Analytics:** `exam_started`, `exam_completed` (props: family, mode, section).

## 5. Kiểm thử

- **Vitest (shared):** schema authoring (essay cần rubric, mcq cần answer…), chuẩn hoá short_text dùng chung TS và SQL (fixtures `packages/shared/src/exam/grading.fixtures.json`, pgTAP sinh tự động như diagnostic).
- **Content check:** cả 3 đề demo hợp lệ.
- **pgTAP `exams.test.sql`:**
  - Client không đọc được `exam_questions` hay `exam_keys`. Prompt được phục vụ không chứa script hay đáp án.
  - Kiểm tra `language_mismatch` và `invalid_mode`.
  - Một lượt `in_progress` duy nhất.
  - Quá hạn: save trả `expired`, submit vẫn ra kết quả.
  - Chấm mcq và short_text đúng.
  - Quy đổi TOPIK và band. CEFR `reached`. Essay không tính điểm.
  - Idempotency của save và submit.
  - Drill ≤ 10 câu cùng loại.
  - Người dùng A không xem được lượt của B.
  - Rate limit.
  - Import đổi hash thì tăng version.
- **Vitest web:**
  - service, hook (đồng hồ dùng fake timers, autosave debounce, hàng đợi offline), tts fallback.
  - Runner: điều hướng, đánh dấu, xác nhận nộp, tự nộp khi hết giờ.
  - Result: nhãn tham khảo, chưa xác thực, essay.
  - Hub: cảnh báo cấu trúc.
- **Playwright `exam.spec.ts`** (mock RPC trong `fixtures.ts`):
  - Làm và nộp đề TOPIK I mini, xem kết quả.
  - Luyện dạng câu.
  - Tải lại giữa chừng thì giữ câu trả lời.
  - Hết giờ thì tự nộp.
  - Chạy axe; không cuộn ngang trên 6 thiết bị.
