# Yêu cầu cho agent viết một unit tiếng Đức (author) và agent rà soát (reviewer)

Đọc theo thứ tự: `2026-10-17-linguo-german-agent-rules.md` (quy tắc chống xung đột, bắt buộc) → `docs/superpowers/specs/2026-10-17-linguo-german-syllabus.md` (chỉ các phần: §0, §1 dòng unit của bạn, §2 năm khối bài của unit, §3 các dòng ngữ pháp của unit, §5, §6; dùng `grep -n "A1U03"` để tìm) → `content/README.md` (nhất là mục "Tiếng Đức") → mẫu: `content/en/programs/elementary/units/01-past-stories/` (unit.yaml, lessons/01-was-were.yaml) và `content/en/items/*.yaml`, `content/ja/...` (để xem cấu trúc `exercises`, `listen`, `word_bank`, `known_wrong`, `deep_explain`). Schema: `packages/shared/src/content/authoring.ts`, `exercises.ts`.

## A. Author — viết một unit (5 bài)

Bạn sở hữu duy nhất các file sau (mã unit viết thường, ví dụ `a1u03`):
- `content/de/programs/<program>/units/<nn>-<slug>/unit.yaml` và 5 file `lessons/01-….yaml … 05-….yaml` (tên đúng như syllabus mục 2)
- `content/de/items/<mã-unit>-<slug>.yaml` (một file items cho cả unit)
- `content/de/wordlist/<mã-unit>.txt` (từ đúng chính tả mà từ điển lint chưa biết, mỗi dòng một từ; xem README mục Tiếng Đức)
Không sửa file nào khác (kể cả `program.yaml`, README, syllabus). Cần đổi syllabus (ví dụ phát hiện lỗi thứ tự ngữ pháp): ghi vào báo cáo cuối, không tự sửa.

**Header mọi file YAML của bạn** (đúng các giá trị này):
```yaml
schema_version: 1
demo: false
status: published
reviewed_by: "Claude (AI) — ủy quyền bởi Nguyễn Ngọc Tuyền; chưa qua giáo viên tiếng Đức bản ngữ"
reviewed_at: "2026-10-17T12:00:00+07:00"
source: src:linguo-demo      # CHỈ file items (và program.yaml); unit.yaml và bài không có dòng source (xem mẫu en/ja)
```
(Mẫu: `content/de/programs/a1/program.yaml` cho header; unit.yaml/bài/items làm y hệt mẫu en/ja về trường nào có hay không có.)

**Nội dung phải đúng syllabus:** mỗi bài dạy đúng "Ngữ pháp mới" và giới thiệu đúng các "Từ mới" ghi cho bài đó (item `introduce`), key item đúng như syllabus (`de:item:<mã-unit>-g-<slug>` cho ngữ pháp, `de:item:<mã-unit>-<slug-lemma>` cho từ). Mỗi item chỉ `introduce` một lần trong cả khóa; item được ôn dùng `role: reuse`. Không dạy hoặc đưa vào bài tập sản sinh ngữ pháp chưa được giới thiệu (xem syllabus §0.4). Bài 5 chỉ ôn (reuse) + đọc/viết/kỹ năng thi.

**Từ vựng bổ sung (Zusatzwortschatz)** — vì mục tiêu vốn từ cao hơn danh sách trong syllabus, mỗi bài dạy mới (L1–L4) được thêm lemma ngoài danh sách (quy tắc 4.1 của syllabus): tối đa **A1: 6, A2: 8, B1: 12, B2: 14** lemma/bài (P0: 2), thuộc đúng trường từ vựng của bài, không có ở bất kỳ dòng "Từ mới" nào trong syllabus (grep), không có trong `content/de/items/` (grep trước khi thêm), tổng item/bài ≤ A1 18, A2 20, B1 24, B2 26. Trùng lemma với agent khác sẽ bị `german-lint` báo lỗi "duplicate lemma": bên commit sau đổi sang `reuse` hoặc chọn lemma khác. Lemma có tên trong syllabus luôn thắng.

**Mỗi bài** (khuôn README §6.2 + syllabus §5): `objectives` (từ Can-do), `skills`, `prerequisites` (L1 ← L5 unit trước cùng chương trình, bài đầu chương trình `[]`), `estimated_minutes` theo syllabus §5.1, `items` (introduce/reuse), `body`: `objective`, ≥3 `explain` (≤3 câu/ý, xưng "bạn", so sánh với tiếng Việt), ≥2 `example` (4 cho bài ngữ pháp; câu tiếng Đức tự nhiên, đúng giống, danh từ viết hoa, `note` giải thích; ghi du/Sie), ≥2 `common_mistake` (lấy từ "Lỗi người Việt"), `summary`, `deep_explain`; `exercises` 8–10 (L5: 10–12) theo mix ở syllabus §5.4 (recognition → recall → application; word_bank cho trật tự từ; fill_blank cho mạo từ/đuôi/dạng động từ; listen có `fallback_text`; translate ≥3 biến thể; `known_wrong` đúng tag và có `feedback_vi` ngắn; `display_answer` khớp phương án đúng; mọi `orders` của word_bank). Giải thích mỗi bài tập phải nói được VÌ SAO đáp án đúng.
**Đáp án chuẩn có ä/ö/ü/ß**; không liệt kê dạng ae/oe/ue/ss hay bỏ dấu chấm (máy chấm tự xử lý; `typo_tolerance` không có tác dụng với `de`). Viết hoa danh từ chỉ dạy bằng mcq/word_bank. `fallback_text` không viết tắt.

**Khoá:** `de:lesson:…`, `de:exercise:<mã-unit>l<k>-<loại>-<slug>` (≤64 ký tự sau tiền tố loại).

**Nội dung phải đúng tiếng Đức 100%:** tự duyệt hai lần theo checklist syllabus §6: giống/số nhiều của từng danh từ, cách, đuôi tính từ, vị trí động từ, dạng Partizip/trợ động từ, chính tả (ä ö ü ß), viết hoa danh từ, câu tự nhiên (không dịch từng chữ), bản dịch Việt đúng nghĩa, đáp án nhiễu chắc chắn sai, `accepted` đủ biến thể đúng. Không chắc về một dạng: bỏ khỏi bài (thay bằng câu khác) hoặc ghi vào báo cáo; đừng đoán.

**Kiểm tra trước khi commit (bắt buộc, chạy lại cho tới khi sạch cho file của bạn):**
1. `node scripts/content/german-lint.mjs content/de/items/<file>.yaml content/de/programs/<program>/units/<nn>-<slug>` (lỗi = sửa; cảnh báo = xem và sửa nếu là lỗi thật).
2. `pnpm content:check` — chạy toàn cây; **chỉ quan tâm lỗi nằm trong file của bạn** (lọc đầu ra theo đường dẫn); lỗi ở file của agent khác đang làm dở thì bỏ qua và báo cáo. Lỗi bắt gặp phổ biến: `display_answer` khác phương án đúng, `word_bank` thiếu thứ tự đúng/tokens không xáo, `accepted` không tự chấm đúng, item introduce 2 lần, ngữ pháp/lemma thiếu so với `items` của bài.
3. Trước commit cuối: tìm trong `content/de/items/` những item của các unit đứng trước (theo thứ tự mã unit) đã được commit và nằm trong cột "Ôn lại ở" của bạn (syllabus §3) rồi thêm `role: reuse` + dùng trong ví dụ/bài tập; item của unit chưa tồn tại thì bỏ qua.
Commit: một commit cho unit (hoặc theo bài), `git add` + `git commit -- <các đường dẫn của bạn>`, message `content(de): <mã unit> <tên unit> (5 lessons)`, kết thúc bằng dòng Co-Authored-By trong rules.

Báo cáo cuối (ngắn): số item (introduce/reuse/zusatz), số bài tập mỗi bài, kết quả lint + content:check cho file của bạn, những chỗ không chắc về tiếng Đức, lỗi syllabus phát hiện, commit hash.

## B. Reviewer — rà soát độc lập một unit đã commit

Bạn KHÔNG phải tác giả; đọc như biên tập viên tiếng Đức bản ngữ kiêm giáo viên DaF khó tính. Sở hữu đúng các file của unit đó (như danh sách author). Quy trình:
1. Đọc syllabus phần unit + toàn bộ file của unit. Kiểm đủ mục: (a) đúng syllabus (ngữ pháp/từ mới/key/prerequisite, không dạy trước ngữ pháp chưa giới thiệu), (b) tiếng Đức: giống + số nhiều từng danh từ, cách, đuôi tính từ, vị trí động từ, Partizip II, haben/sein, trật tự từ, chính tả và viết hoa, du/Sie nhất quán, độ tự nhiên, không sai thực tế (ngày lễ, thủ tục, số điện thoại…: nếu có thể thay đổi thì bỏ hoặc ghi "cần kiểm tra"), (c) giải thích tiếng Việt: đúng, không quá 3 câu/ý, so sánh tiếng Việt đúng chỗ, (d) bài tập: đáp án đúng chắc chắn, phương án nhiễu sai thật, `accepted` đủ biến thể câu đúng (kể cả vị trí 1 khác nhau, du/Sie khi đề không chỉ rõ), `word_bank.orders` đủ, `known_wrong` thật sự sai và không là câu chuẩn khác, giải thích nói đúng lý do, độ khó hợp lý, (e) item: dạng `der Tisch, -e`, IPA ở P0/A1, ví dụ đúng.
2. Sửa trực tiếp mọi lỗi tìm thấy trong file của unit (đừng chỉ báo cáo). Lỗi cấu trúc syllabus (cần đổi nơi giới thiệu ngữ pháp) thì chỉ ghi vào báo cáo.
3. Chạy lại `node scripts/content/german-lint.mjs <file của unit>` và `pnpm content:check` (chỉ quan tâm file của bạn) cho tới khi sạch; commit `review(de): <mã unit> …` (explicit paths).
Báo cáo cuối: số lỗi sửa theo loại (với 3–5 ví dụ điển hình trước/sau), phần còn nghi ngờ, các điểm syllabus cần orchestrator xem.

## C. Lỗi reviewer đã bắt được ở các unit trước (tránh ngay từ đầu)

1. Phát âm/vùng miền sai (nguyên âm dài–ngắn, Balkon, geben…); gợi ý âm tiếng Việt sai hoặc gây hiểu nhầm (kết thúc bằng t/x/ng...). Chỉ ghi điều chắc chắn đúng ở tiếng Đức chuẩn.
2. Quy tắc tuyệt đối sai ("luôn", "mọi", "không bao giờ", "đều"): luôn kèm ngoại lệ (ví dụ -chen trung tính nhưng der Kuchen; Wann? không luôn có um; tên nước có/không mạo từ).
3. Cấu trúc chưa dạy mà bài tập sản sinh (fill_blank, word_bank, translate vi→de) đòi hỏi: kiểm tra cột "Giới thiệu ở" trong syllabus §3 cho từng cấu trúc; chỉ cho phép ở ví dụ đọc/nghe có chú thích hoặc cụm cố định.
4. Phương án nhiễu/known_wrong thực ra là tiếng Đức đúng (Plusquamperfekt cạnh ô Perfekt, kann thay darf, "eine Ärztin", "Ich habe nach Hause gemusst"): làm đáp án duy nhất bằng gợi ý trong đề (ví dụ "(dürfen)") hoặc bỏ.
5. Ô trống nhiều đáp án hợp lệ hoặc cùng một từ đúng ở hai ô (known_wrong của fill_blank không được đúng ở ô khác): thêm gợi ý hoặc đổi câu.
6. Thứ tự từ biên/afterthought hoặc không tự nhiên được chấp nhận là đúng ("Ich fahre nach Berlin mit dem Zug"): chỉ chấp nhận trật tự trung tính; nhưng không loại các trật tự đảo vị trí 1 bình thường.
7. Sự kiện dễ đổi hoặc chưa kiểm chứng (giờ mở cửa, lệ phí, thủ tục, quy định, số điện thoại thật, định dạng đề Goethe): làm mềm "có thể thay đổi", hoặc bỏ. Số điện thoại/dữ liệu cá nhân bịa phải rõ là giả (ngắn).
8. Dịch Việt lỏng ("khoá học" thay vì "buổi học"), gợi ý cách sai ("với cái gì?" cho Akkusativ).
9. Tag lỗi ngoài danh sách: dùng article, gender, case_dat_akk, verb_position, word_order, adj_ending, plural_form, aux_verb, capitalization, separable_prefix, reflexive_missing, konjunktiv_form, preposition, register_du_sie, participle_form, zu_infinitive; chỉ thêm tag mới khi không tag nào hợp.
10. Linter chính tả kiểm cả phương án nhiễu: không dùng dạng sai bịa (fahrte, habst) làm ô mcq; dùng dạng thật nhưng sai ngữ cảnh. Fill_blank template phải toàn tiếng Đức (không chèn từ Việt vào template).
11. Danh từ có số nhiều bất quy tắc ghi nguyên dạng: `das Museum, Museen`. Item đã `introduce` ở unit khác không được tạo lại; item đã có thì `reuse`. Item dùng đúng key trong syllabus. Item ôn (reuse) không tính vào trần số item mỗi bài.
12. Liên kết `reuse` sang unit khác chỉ khi key tồn tại VÀ đã được commit (`git ls-files`); kiểm lại ngay trước commit cuối.
