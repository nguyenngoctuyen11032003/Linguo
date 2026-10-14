# Linguo – Từ vựng cá nhân (import CSV) – thiết kế

Spec gốc: §6.4 (từ vựng/flashcard), §14 (dữ liệu), §16 (riêng tư), §19 P2 ("Import danh sách từ cá nhân/CSV; OCR để sau").
Migration: `20261016000300_personal_vocab.sql`. Test: `supabase/tests/personal_vocab.test.sql`.

## 1. Mục tiêu và nguyên tắc ít rủi ro nhất

Người học nhập danh sách từ riêng (en hoặc ko) từ CSV (phân tích hoàn toàn ở trình duyệt, không OCR) và ôn bằng lặp lại ngắt quãng, tách hẳn khỏi nội dung chuẩn đã xuất bản.

- **Không trộn vào bảng nội dung.** `learning_items`, `lessons`... do staff/import sở hữu (RLS: đọc nội dung published). Từ cá nhân sống trong bảng riêng, không bao giờ có FK hay UNION sang bảng nội dung; luồng "đã xuất bản" và báo lỗi nội dung không đụng tới chúng.
- **Chặt theo từng người.** Mọi bảng có `user_id` + RLS owner-only; client chỉ `select`, mọi ghi đi qua RPC `security definer` (`set search_path = ''`, kiểm `auth.uid()`, revoke public/anon, grant authenticated).
- **Dùng lại FSRS hiện có, không thuật toán mới.** Chấm điểm gọi đúng `public.srs_next` (migration 20261014000310, đọc `srs_config`) và `srs_previews` như `grade_review`. Quy tắc "đến hạn" copy từ `get_review_queue`/`grade_review`: learning/relearning khi `due_at <= now`; review/new khi `due_at` trước cuối ngày bản địa (`profiles.timezone`).
- **Tách khỏi tiến độ chuẩn.** Ôn từ cá nhân không ghi `review_cards`/`review_logs`/mastery/streak/huy hiệu/analytics, nên không thể bơm XP hay mastery từ nội dung tự nhập.

## 2. Dữ liệu

`personal_word_lists(id, user_id, name ≤60, language_code en|ko, created_at, updated_at)`; unique `(user_id, lower(name))`.

`personal_words(id, list_id → lists on delete cascade, user_id → auth.users on delete cascade, position, term ≤120, term_key, meaning ≤300, example ≤300, note ≤300, pronunciation ≤100, trạng thái FSRS: fsrs_state, step, stability, difficulty, reps, lapses, scheduled_days, due_at, last_review_at, last_grade_key/rating/result, created_at, updated_at)`; unique `(list_id, term_key)`.
`term_key = lower(NFC(trim, gộp khoảng trắng))` – bắt buộc bằng CHECK nên import lặp lại là idempotent. Mỗi từ có một thẻ (nhìn từ → nhớ nghĩa).

`personal_vocab_imports(id, user_id, list_id on delete set null, added, created_at)`: chỉ để giới hạn tần suất; `set null` để xoá danh sách không xoá dấu vết (chống vòng lặp tạo/nhập/xoá).

Giới hạn (hằng số dùng chung `packages/shared/src/personal-vocab/limits.ts` = SQL): 20 danh sách/người, 1000 từ/danh sách, 5000 từ/người, 1000 dòng/lần nhập, 10 lần nhập/giờ, file CSV ≤ 1 MB. Đếm dưới `pg_advisory_xact_lock` theo user nên hai request song song không vượt trần.

## 3. RPC

| RPC | Việc |
|---|---|
| `create_personal_list(name, language)` / `rename_personal_list` / `delete_personal_list` | CRUD danh sách; `name_taken`, `list_limit` |
| `list_personal_lists()` | danh sách + `word_count`, `due_count` |
| `import_personal_words(list_id, rows jsonb)` | kiểm tra từng dòng ở server (cắt ký tự điều khiển, độ dài), dedupe theo `term_key`; từ mới được thêm (đến hạn ngay), từ đã có chỉ cập nhật chữ (giữ nguyên lịch ôn); trả `added/updated/unchanged/duplicates/invalid[{index,reason}]`; vượt trần ⇒ cả lượt bị từ chối (`list_full`, `vocab_full`); `rate_limited` |
| `update_personal_word` / `delete_personal_word` | sửa/xoá một từ (`duplicate_term`) |
| `get_personal_review_queue(list_id, limit)` | thẻ đến hạn, dạng `reviewCardSchema` (item_type `vocab`) để dùng lại `Flashcard`/`RatingBar`; xếp learning → review (độ nhớ thấp trước) → mới (theo thứ tự nhập) |
| `grade_personal_word(word_id, rating, idempotency_key)` | `srs_next`; chặn chấm khi chưa đến hạn (`word_not_due`), 60 lượt/60 s (`rate_limited`); chấm lặp cùng key ⇒ trả lại kết quả cũ (`replayed`), cùng key khác điểm ⇒ `idempotency_conflict` |

Client đọc trực tiếp (RLS) `personal_word_lists` và `personal_words` để dựng trang chi tiết; không có quyền INSERT/UPDATE/DELETE trực tiếp.

## 4. Riêng tư: xuất và xoá dữ liệu

- Cả ba bảng có `user_id`, nên được thêm vào `public.account_optional_tables()` (định nghĩa lại trong migration, copy từ `20261015000610_export_exam_data.sql` + 3 tên mới). `export_my_data` đọc chúng qua catalog; `supabase/tests/account_export_coverage.test.sql` mở rộng để khẳng định điều này và vẫn phải xanh.
- Xoá tài khoản: mọi FK `user_id` đều `on delete cascade` từ `auth.users`; `delete_my_account` còn quét theo catalog. Test xác nhận mọi dòng biến mất; xoá danh sách cascade sang từ.
- CSV không bao giờ tải lên nguyên file: chỉ các dòng đã qua xem trước được gửi. Văn bản người dùng luôn render dạng text (React escape), công thức `= + - @` đầu ô được giữ là chữ thường, không bao giờ đánh giá hay render HTML.

## 5. Phân tích CSV phía client (`packages/shared/src/personal-vocab/csv.ts`)

Từ chối > 1 MB trước khi phân tích; bỏ BOM; tự nhận `,` `;` tab; ngoặc kép (`""`, xuống dòng trong ô); nhận tiêu đề song ngữ (word/term/từ, meaning/nghĩa, example/ví dụ, note/ghi chú, pronunciation/phát âm); không có tiêu đề thì cột 1 = từ, cột 2 = nghĩa. Trả `{rows, errors[{line,reason}], duplicates, truncated}`: cắt khoảng trắng, dedupe, lỗi theo từng dòng kèm số dòng, tối đa 1000 dòng.

## 6. Kiểm thử

- pgTAP: cô lập chủ sở hữu (A/B, kiểu `rls_cross_user`), trần số lượng, giới hạn tần suất, idempotent theo `(list, term_key)`, chấm điểm đẩy `due_at` như thẻ chuẩn, cascade xoá, độ phủ export, `anon` không chạy được RPC.
- Vitest: schema/limits/CSV (Hangul, đầu vào độc hại), service + hook + trang; Playwright: nhập CSV có lỗi, ôn danh sách, axe, không cuộn ngang ở 320 px.

## 7. Ngoài phạm vi

OCR; chia sẻ danh sách giữa người dùng; gộp từ cá nhân vào mastery/streak; hàng đợi chấm offline (lỗi mạng hiện thông báo và cho chấm lại, an toàn nhờ idempotency key).
