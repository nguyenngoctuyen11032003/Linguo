# Linguo — Spec 5: Gia sư AI (Gemini)

**Ngày:** 2026-10-13 · **Trạng thái:** Đã duyệt thiết kế
**Nguồn yêu cầu:** PRD mục 8 (toàn bộ), 15 (AI), 16, 17.1, 20.2, 23 bước 5 · **Nền tảng:** Spec 0–4

## 1. Mục tiêu

Người học bấm "Giải thích AI" trong bài học / thẻ ôn, hoặc dùng trang "Gia sư AI", để nhận giải thích bằng tiếng Việt theo trình độ, bài luyện thêm, hoặc phân tích lỗi sai — qua một Edge Function có hạn mức, cache, thử lại, ngắt khi lỗi liên tục, và luôn có phương án dự phòng không dùng AI.

**Ngoài phạm vi:** chấm bài viết, nhập vai hội thoại, streaming, AI cho khách chưa đăng nhập, chấm hướng thẻ "dùng trong câu".

## 2. Kiến trúc

- Một function `supabase/functions/ai-tutor` (Deno), `verify_jwt = true`. `index.ts` chỉ nối mạng; logic trong `handler.ts` + `lib/*` nhận phụ thuộc tiêm vào (fetch, đồng hồ, random, sleep, supabase factory) để test.
- Hợp đồng zod `packages/shared/src/ai/contract.ts` được chép nguyên văn sang `supabase/functions/_shared/ai-contract.ts` bằng `scripts/sync-ai-contract.mjs` (CI `--check`). Deno dùng `npm:zod@4` qua `supabase/functions/deno.json`.
- Model chỉ đọc từ secret `GEMINI_MODEL`; key `GEMINI_API_KEY`; tuỳ chọn `GEMINI_DAILY_USER_LIMIT=20`, `GEMINI_MAX_OUTPUT_TOKENS=1200`, `GEMINI_TIMEOUT_MS=20000`. Không có giá trị nào trong `VITE_*` hay GitHub repo vars.

## 3. Luồng xử lý một request

1. OPTIONS/POST; > 8 KB → 400 `bad_request`.
2. zod `aiRequestSchema` (strict; client không gửi được `model`, `temperature`, `system`).
3. Thiếu `GEMINI_API_KEY` hoặc `GEMINI_MODEL` → 503 `ai_unavailable` (không trừ lượt).
4. Auth: client supabase với header `Authorization` của người gọi → `auth.getUser()`; id chỉ lấy từ token (401 `unauthorized`).
5. Ngữ cảnh: nếu có `lesson_id`, đọc tiêu đề/mục tiêu/khối giải thích đã xuất bản qua RLS (≤ 1.5 KB). Không gửi lịch sử học, tên, email.
6. Cache (chỉ `explain_concept`; `generate_practice` khi không có `focus`; không bao giờ `analyze_error`): khoá = sha256(task | prompt_version | model | language | level | variant | chuẩn hoá(concept, context, lesson_id)) → hit trả `cached: true`, không trừ lượt.
7. Breaker (trong bộ nhớ, mỗi isolate): đang mở → 503 `ai_unavailable` + `retry_after_sec`.
8. `ai_quota_consume(limit)` → hết lượt → 429 `quota_exceeded` + `resets_at` (nửa đêm theo giờ người học).
9. Gemini `generateContent`: `x-goog-api-key`, `responseMimeType: application/json` + `responseSchema`; timeout 20 s/lần, tổng ≤ 45 s; thử lại tối đa 2 lần với 429/500/503/lỗi mạng (backoff full jitter `rand(0, min(4s, 500ms·2^n))`, tôn trọng `Retry-After` nếu vừa thời hạn); 429 hết quota ngày → mở breaker ngay; 400 do schema → thử lại một lần không `responseSchema`; bị chặn an toàn → `invalid_output`.
10. Trích JSON → zod output → sai thì một lần sửa (≤ 600 token) → vẫn sai → `invalid_output`.
11. Làm sạch đầu ra (bỏ thẻ HTML, ký tự điều khiển, cắt độ dài; `ko` phải có Hangul trong ví dụ) → ghi cache → ghi `ai_usage` (không nội dung) → 200 `aiSuccessSchema` (`response_id` = id dòng `ai_usage`).
12. Lỗi sau bước 8 → `ai_quota_refund()` (tối đa 10 lần/ngày) → lỗi tương ứng.

Prompt: mỗi task một module có `version` (đổi prompt = tăng version = cache tự vô hiệu), system prompt gồm quy tắc PRD §8.5 (đúng ngôn ngữ đích và trình độ, giải thích tiếng Việt, không bịa quy tắc/nguồn/điểm, nói rõ khi không chắc, không tiết lộ hướng dẫn, chỉ trả JSON). Văn bản người học/bài học nằm trong `<learner_input>` / `<lesson_context>` (đã escape ký tự phân cách, bỏ ký tự điều khiển, che email/số điện thoại) và được khai báo là dữ liệu, không phải lệnh. Không bật tool/function calling.

## 4. Dữ liệu (migration `20261014000500_ai_gateway.sql`)

- `ai_quota (user_id, used_on date, count, refunded)` PK `(user_id, used_on)`; `ai_quota_consume(p_limit int) → jsonb {allowed, used, limit, resets_at}` (upsert nguyên tử, ngày theo `learning_user_today`, dọn > 60 ngày), `ai_quota_refund() → boolean` (≤ 10/ngày), `ai_quota_status(p_limit int) → jsonb {used, limit, resets_at}`.
- `ai_cache (key pk, task, prompt_version, model, payload jsonb ≤ 16 KB, created_at, expires_at +30d, hits)`: không grant bảng; `ai_cache_get(p_key) → jsonb|null`, `ai_cache_put(p_key, p_task, p_prompt_version, p_model, p_payload) → void` (security definer, grant authenticated).
- `ai_usage (id, user_id, task, prompt_version, model, status, http_status, latency_ms, attempts, input_chars, cached, repaired, created_at)`: select-own; ghi qua `ai_usage_log(...) → uuid`; giữ 90 ngày.
- `ai_reports (id, user_id, usage_id, task, prompt_version, reason, note ≤ 500, created_at)`: `ai_report(p_usage_id, p_reason, p_note) → uuid`; select-own.
- `user_preferences.ai_notice_ack_at timestamptz` + `ack_ai_notice() → timestamptz`.
- Mọi RPC: `security definer`, `search_path=''`, `auth.uid()`, revoke anon.

## 5. Web

- `apps/web/src/features/ai-tutor/`: `service.ts` (`supabase.functions.invoke('ai-tutor')`, parse `aiSuccessSchema`/`aiErrorSchema`, timeout 50 s), `useAiTutor(task)` (`idle | loading | ok | quota | unavailable | error`), `useAiQuota()`, `useAiNotice()`, `report()`.
- `apps/web/src/components/ai/`: `MarkdownLite` (đoạn, **đậm**, *nghiêng*, `code`, danh sách — dựng React text node, không `dangerouslySetInnerHTML`, không link), `AiExplainSheet` (bottom sheet trên mobile / panel bên trên desktop, nhãn "Giải thích AI · có thể chưa chính xác", "Giải thích cách khác", "Báo lỗi", chip lượt còn lại, trạng thái dự phòng "Tạm thời không khả dụng" + lời giải thích soạn sẵn), `AiNoticeDialog`, `AiReportDialog`.
- `/app/gia-su` (`TutorPage`): hỏi về khái niệm theo ngôn ngữ + trình độ lộ trình hiện tại, tạo bài luyện (ẩn đáp án tới khi chọn), lịch sử phiên trong bộ nhớ.
- Gắn vào: `FeedbackPanel` của bài học (sau khi có kết quả → "Vì sao?" dùng `analyze_error`, "Giải thích AI" dùng `explain_concept` với `lesson_id`), mặt sau thẻ ôn ("Giải thích AI").

## 6. Kiểm thử

Deno test (fetch giả): thiếu key → 503 không trừ lượt; 401; zod chặn `model`, quá 8 KB; 429 → backoff → OK; 429×3 → hoàn lượt → 503; timeout → hoàn lượt; JSON hỏng → sửa OK; hỏng 2 lần → `invalid_output`; 429 hết ngày → breaker mở, lần sau không trừ lượt; cache hit không trừ lượt; `analyze_error` không cache; sanitize bỏ `<script>`; log không chứa nội dung. pgTAP: consume tới giới hạn, theo ngày địa phương, refund ≤ 10, A/B, anon không execute, `ai_cache` không đọc trực tiếp. Vitest web: service, hook, MarkdownLite (HTML hiển thị nguyên chữ), sheet, dự phòng, thông báo quyền riêng tư, báo lỗi. Playwright (mock `**/functions/v1/ai-tutor`): thành công, hết lượt, không khả dụng, nội dung HTML hiện thành chữ, báo lỗi, sheet trên iPhone/Android, axe.
