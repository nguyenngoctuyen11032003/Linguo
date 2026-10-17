# Quy tắc chung cho mọi agent làm tiếng Đức (de)

Đọc trước: `docs/superpowers/plans/2026-10-17-linguo-german.md` (kế hoạch), `content/README.md` (quy ước nội dung), `docs/superpowers/HANDOFF.md` mục 2 (quyết định cần giữ). Mẫu tham chiếu: cách đã thêm tiếng Nhật (`git show 2c9c1cc --stat`, `supabase/migrations/20261018130000_japanese.sql`).

Trạng thái nền: commit `9921ac4` đã thêm `de` vào `shared` (constants, levels, goal `goethe`, họ đề `goethe`, ...) và web (giọng `de-DE`, luyện nói). `LANGUAGES.de.available = false`, `CONTENT_MAX_LEVEL.de = 'pre_a1'`. Thang trình độ `de`: `pre_a1, a1, a2, b1, b2` (dùng lại mã CEFR của `en`).

## Quy tắc chống xung đột (bắt buộc)

1. **Chỉ sửa file thuộc phần được giao** (ghi trong yêu cầu của bạn). Cần sửa file ngoài phần đó: **dừng và báo lại** trong báo cáo cuối, đừng tự sửa.
2. Mọi agent dùng **chung một cây làm việc** (`D:\Code\Tuyen\Linguo`, nhánh `main`). Không tạo nhánh, không worktree, **không `git stash`, không `git reset`/`checkout --` lên file của người khác**, không `git pull`/`push`.
3. Commit thẳng vào `main`, **chỉ file của bạn**: `git add <đường dẫn cụ thể>` rồi `git commit -m "..." -- <đường dẫn cụ thể>`. Không dùng `git add -A`/`git commit -a`. Gặp `index.lock`: đợi vài giây rồi thử lại. Không `--no-verify`. Kết thúc message bằng dòng `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
4. **Không bao giờ sửa migration đã tồn tại.** Migration mới: chỉ dùng đúng số được cấp cho bạn.
5. Người khác đang sửa file khác cùng lúc: nếu `typecheck`/test/`content:check` báo lỗi nằm ngoài file của bạn, bỏ qua và ghi vào báo cáo; chỉ cần phần của bạn sạch (lọc kết quả theo đường dẫn của bạn).
6. Không push. Không deploy. Không chạy workflow.
7. Không tạo file ngoài đường dẫn được giao; file nháp để trong thư mục scratchpad của phiên (không phải trong repo).
8. Báo cáo cuối (ngắn): đã làm gì, file nào, commit hash, kiểm thử đã chạy và kết quả, việc còn thiếu/vấn đề phát hiện ở file ngoài phần của bạn.

## Quy tắc nội dung tiếng Đức

- Chuẩn Hochdeutsch (Đức). Văn bản tiếng Việt đủ dấu, NFC. Người học đã biết tiếng Việt, chưa biết tiếng Đức.
- Danh từ luôn kèm mạo từ và số nhiều: `front.text: "der Tisch, -e"`, `"die Frau, -en"`, `"das Kind, -er"`, `"der Apfel, ¨-"`, `"die Mutter, ¨-"`, `"der Lehrer, -"`, `"das Auto, -s"`, không có số nhiều: `"die Milch (Sg.)"`. Câu ví dụ phải đúng giống và viết hoa danh từ.
- Động từ ghi nguyên thể; bất quy tắc kèm dạng: `"fahren, fährt, fuhr, ist gefahren"` ở cấp phù hợp (từ A2 trở đi; ở A1 ghi `fahren (du fährst)`).
- Trước B1 dùng `du`/`Sie` rõ ràng trong ví dụ, nêu ngữ vực. Ví dụ tự nhiên, không dịch từng chữ.
- Đáp án gõ: ghi cả dạng có `ä/ö/ü/ß` (chuẩn). Máy chấm sẽ chấp nhận `ae/oe/ue/ss` thay thế; **không** liệt kê dạng gõ tắt vào `accepted`, và không đưa dạng bỏ dấu chấm (`fur`) vào `known_wrong` trừ khi bài đó dạy riêng điều này.
- `known_wrong` điển hình: `article` (der/die/das sai), `case_dat_akk`, `verb_position`, `adj_ending`, `plural_form`, `capitalization`, `aux_verb` (haben/sein), `word_order`, `gender`.
- IPA: ghi `/…/` cho từ khó phát âm ở pre-A1/A1 (tuỳ chọn ở các cấp sau).
- Tuyệt đối không chép từ giáo trình/đề thi thật; tự soạn.

## Khoá (key) cho nội dung `de`

`de:program:<tên>`, `de:unit:<tên>`, `de:lesson:<tên>`, `de:item:<tên>`, `de:exercise:<tên>`, `de:diag:...`, `de:exam:...`, `de:examq:...` (chỉ chữ thường, số, gạch ngang; tối đa 64 ký tự sau tiền tố loại). Khoá của một unit dùng tiền tố mã unit (ví dụ `de:item:a1u03-kaffee`), để agent khác nhau không bao giờ trùng khoá.
