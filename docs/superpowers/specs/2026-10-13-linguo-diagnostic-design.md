# Linguo — Spec 4: Bài kiểm tra đầu vào thích ứng

**Ngày:** 2026-10-13
**Trạng thái:** Đã duyệt thiết kế
**Nguồn yêu cầu:** [Dac_ta_Linguo_English_Korean.md](./Dac_ta_Linguo_English_Korean.md) mục 4.1 (bước 6–7), 5.3, 10.2, 14 (assessments, assessment_attempts, skill_estimates), 15, 20.1
**Nền tảng:** Spec 0–3 (đã merge)

## 1. Mục tiêu

Người học (đặc biệt người chọn "chưa chắc") làm một bài kiểm tra trắc nghiệm thích ứng ~12 phút cho từ vựng, ngữ pháp, đọc. Hệ thống ước lượng trình độ từng kỹ năng kèm khoảng và độ tin cậy, ghi `skill_estimates` (`source = 'diagnostic'`), và chỉ đổi trình độ lộ trình khi người học xác nhận.

**Ngoài phạm vi:** nghe (tự bỏ qua `not_supported` cho tới khi có audio), viết/nói (không bao giờ suy ra), hiệu chỉnh độ khó câu hỏi từ dữ liệu thật, bài thi thử (spec sau).

## 2. Thuật toán (chuẩn, TS và SQL phải giống nhau)

- **Thang:** θ theo thứ tự bậc của `level_reference_hours.ordinal` (0–6). Lưới θ = −0.5, −0.25, …, 6.5 (29 điểm).
- **Câu hỏi:** độ khó `b` (mặc định ordinal bậc + 0.5), `c = 1 / số phương án`.
- **Xác suất đúng:** `P(θ) = c + (1 − c) · σ(1.7 · (θ − b))`; "Tôi không biết" = sai.
- **Prior:** Normal(μ0, 1.25) chuẩn hoá trên lưới. Kỹ năng đầu: μ0 = ordinal(`current_level` của lộ trình) + 0.5 (chế độ `foundation`: 0.5). Kỹ năng sau: μ0 = trung bình EAP của các kỹ năng đã xong.
- **Posterior:** prior × Π likelihood của các câu đã trả lời trong kỹ năng; tính lại từ `assessment_responses` mỗi lần (không lưu posterior). EAP = kỳ vọng, SD = độ lệch chuẩn.
- **Thứ tự kỹ năng:** vocabulary → grammar → reading (tuần tự).
- **Chọn câu:** trong kỹ năng hiện tại, các câu chưa làm ở lượt này; loại câu đã gặp ở lượt hoàn thành trước nếu còn ≥ 3 câu; chế độ `foundation` chỉ lấy `b ≤ 1.5`. Lấy 3 câu có |b − EAP| nhỏ nhất (hoà → theo `id`), chọn 1 bằng chỉ số `floor(r · k)` với `r ∈ [0,1)` từ RNG (TS: tham số; SQL: `('x' || substr(md5(attempt_id || ':' || seq), 1, 8))::bit(32)::bigint / 2^32`).
- **Dừng kỹ năng:** (n ≥ 4 và SD ≤ 0.45) hoặc n = 8 (reading: 5) hoặc hết câu. **Dừng cả bài:** tổng 30 câu (`foundation`: 8); hoặc ở kỹ năng đầu 3 câu sai liên tiếp có `b ≤ 1.0` → dừng sớm (`early_stop`, gợi ý bắt đầu từ nền tảng).
- **Bậc báo cáo:** bậc L lớn nhất (0–6) có `P(θ ≥ L) ≥ 0.7` (tổng posterior trên lưới θ ≥ L); không có → 0. **Khoảng:** floor(phân vị 10%) … floor(phân vị 90%), kẹp 0–6.
- **Độ tin cậy:** high nếu SD ≤ 0.45 và n ≥ 6; medium nếu SD ≤ 0.75; còn lại low. Nếu > 30% câu trả lời của bài < 800 ms → hạ một mức mọi kỹ năng.
- **Gợi ý trình độ lộ trình:** trung vị dưới của bậc các kỹ năng có độ tin cậy ≥ medium; cần ≥ 2 kỹ năng, nếu không → null.
- **Giới hạn nâng bậc:** so với `current_level`: tối đa +2 nếu chưa từng áp dụng kết quả kiểm tra nào cho lộ trình, +1 các lần sau; hạ bậc luôn được.

Fixtures chung `packages/shared/src/diagnostic/engine.fixtures.json` (posterior/EAP/SD, dừng, bậc, khoảng, độ tin cậy, gợi ý, giới hạn) — SQL kiểm tra bằng pgTAP sinh tự động.

## 3. Dữ liệu (migration `20261014000400_diagnostic.sql`)

- `assessments`: `id`, `language_code`, `assessment_type ('diagnostic')`, `version`, `is_published`, `config jsonb` (các hằng số ở mục 2: cooldown_days 14, abandon_days 7, …).
- `assessment_items`: `id` (UUIDv5 từ key), `key unique`, `assessment_id`, `skill`, `level_code`, `difficulty numeric`, `item_type`, `prompt jsonb` (công khai), `answer_key text` (id phương án đúng), `explanation jsonb`, `key_confidence ('unreviewed'|'reviewed')`, `status`, `is_demo`, `content_hash`, `version`. **Không grant cho client.**
- `assessment_attempts`: `id`, `user_id`, `learning_path_id`, `assessment_id`, `mode`, `status ('in_progress'|'completed'|'abandoned')`, `current_item_id`, `current_served_at`, `skipped jsonb` (kỹ năng → lý do), `report jsonb`, `started_at`, `completed_at`, `applied_at`, `last_activity_at`. Unique một phần: một `in_progress` mỗi lộ trình. RLS select-own.
- `assessment_responses`: `attempt_id`, `seq`, `item_id`, `skill`, `choice` (null = không biết), `is_correct`, `served_at`, `answered_at`; unique `(attempt_id, item_id)`, `(attempt_id, seq)`. Không grant cho client.
- Nội dung câu hỏi: `content/diagnostic/<en|ko>/*.yaml` → `content_private.import_diagnostic_bundle(jsonb)` (service_role), được `content-import` ghi vào `seed.sql` sau lệnh nhập nội dung bài học; `public.import_diagnostic_content_bundle` cho `content:push`.

## 4. RPC (JSON khớp `packages/shared/src/diagnostic/rpc.ts`)

| RPC | Hành vi |
|---|---|
| `diagnostic_status(p_path_id)` | Lượt gần nhất + `can_start` + `retake_after` (của bài `full`; lượt `foundation` không chặn bài `full`) |
| `start_diagnostic(p_path_id, p_mode default 'full')` | Lượt dở → tiếp tục, trả lại đúng câu đang chờ (`resumed`). Lượt dở > 7 ngày → `abandoned`. Cooldown 14 ngày sau lượt `completed` cùng chế độ (full sau full, foundation sau foundation) → `diagnostic_cooldown`; `p_mode` lạ → `invalid_mode`. Không có kho câu → `bank_unavailable` |
| `answer_diagnostic(p_attempt_id, p_item_id, p_choice)` | `p_item_id` phải là câu đang chờ (`item_mismatch` / `already_answered`); `p_choice` null hoặc id phương án hợp lệ (`invalid_choice`). Không trả đúng/sai, không trả đáp án, không trả θ |
| `skip_diagnostic_skill(p_attempt_id, p_skill, p_reason)` | Bỏ kỹ năng → "chưa đủ dữ liệu" |
| `finish_diagnostic(p_attempt_id)` | Idempotent; kết thúc sớm được. Ghi `report`, upsert `skill_estimates (source 'diagnostic')` chỉ cho kỹ năng đã ước lượng; không đổi lộ trình |
| `accept_diagnostic_placement(p_attempt_id)` | Áp dụng `capped_level`: không có gợi ý → `no_suggestion`; bằng hiện tại → `unchanged`; ≥ `target_level` → `needs_target_update` (không đổi); còn lại cập nhật `current_level` + tính lại `estimate` (dùng `estimate_learning_path`), đặt `applied_at` (`already_applied` nếu gọi lại) |

## 5. Web

- `apps/web/src/features/diagnostic/`: service, error map, `useDiagnosticRun(pathId)`, `useDiagnosticStatus(pathId)`.
- `/app/kiem-tra/:pathId` (ngoài AppLayout): giới thiệu ("Câu hỏi sẽ dễ hoặc khó hơn tùy câu trả lời — sai là bình thường", không đồng hồ), câu hỏi (một câu/màn hình, phương án ≥ 44px, "Tôi không biết", đoạn đọc cho reading), thanh tiến độ theo kỹ năng (không "câu 7/30"), "Tạm dừng", "Bỏ qua kỹ năng này" (chọn lý do), tải lại → tiếp tục.
- `/app/kiem-tra/:pathId/ket-qua`: ma trận 6 kỹ năng (khoảng, độ tin cậy, số câu, "chưa đủ dữ liệu"), "Ước lượng sơ bộ, không phải chứng chỉ. Bộ câu hỏi đang thử nghiệm.", "Cập nhật trình độ lộ trình thành X" (giải thích giới hạn nếu bị kẹp) / "Giữ trình độ hiện tại".
- Onboarding "chưa chắc": tạo lộ trình tạm (a1/topik1), màn chúc mừng có "Làm bài kiểm tra (~12 phút)" / "Để sau". "Mới bắt đầu": gợi ý "Kiểm tra nền tảng (2–3 phút)" không bắt buộc. Trang chủ: thẻ "Kiểm tra trình độ" (hoặc "Tiếp tục bài kiểm tra"). Cài đặt lộ trình: "Làm lại bài kiểm tra" (hiện ngày được làm lại).

## 6. Kiểm thử

Mô phỏng TS (500 lượt × 7 bậc, RNG cố định): trung vị |sai số| ≤ 0.5, xếp cao ≥ 2 bậc < 2%, độ dài trung bình ≤ 30, người đoán mò ≤ a1, `foundation` không bao giờ phục vụ `b > 1.5`. pgTAP: không lộ đáp án (kiểm tra đệ quy JSON), không grant client trên items/responses, A/B, `item_mismatch`/`already_answered`, cooldown, một lượt dở, kết thúc ghi đúng kỹ năng, chấp nhận + giới hạn + `needs_target_update`, parity fixtures. Vitest web + Playwright (luồng "chưa chắc" → kiểm tra → tạm dừng/tải lại → báo cáo → cập nhật; axe; mạng bị chặn không có đáp án).
