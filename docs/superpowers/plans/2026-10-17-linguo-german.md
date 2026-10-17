# Linguo: thêm tiếng Đức (từ số 0 đến B2) — kế hoạch triển khai

Ngày lập: 2026-10-17. Mục tiêu: tiếng Đức là ngôn ngữ học thứ tư (`de`), có giáo trình đủ dài và chuẩn để người Việt bắt đầu từ số 0 học xong đạt **CEFR B2**, kèm kiểm tra đầu vào, đề luyện thi, đóng vai, luyện nói và gia sư AI.

Khuôn mẫu: cách thêm tiếng Nhật (`ja`, commit `2c9c1cc` "wip: japanese" + migration `20261018130000_japanese.sql`, khoảng 90 file chạm tới). Tiếng Đức đi theo đúng đường đó, cộng thêm những chỗ riêng của tiếng Đức (mục 2).

## 1. Phạm vi và quy mô

| Hạng mục | Quy mô |
|---|---|
| Thang trình độ | `pre_a1, a1, a2, b1, b2` (dùng lại mã CEFR của tiếng Anh; `CONTENT_MAX_LEVEL.de = 'b2'`) |
| Chương trình (program) | 5: Phát âm & chữ cái (pre-A1), A1, A2, B1, B2 |
| Unit / bài | 39 unit, **195 bài** (15 + 40 + 40 + 50 + 50), mỗi unit 5 bài, bài thứ 5 là bài ôn + kỹ năng |
| Học liệu (item) | khoảng 2.300 (≈ 12 / bài: từ có mạo từ + số nhiều, cụm, điểm ngữ pháp) |
| Bài tập | khoảng 1.600 (≈ 8 / bài, đủ recognition → recall → application) |
| Kho kiểm tra đầu vào | 3 kỹ năng × 5 cấp × 6 câu = 90 câu |
| Đề luyện thi mô phỏng (họ `goethe`) | 6 đề: A1, A2, B1 ×2, B2 ×2; đủ Lesen / Hören / Schreiben / Sprechen |
| Đóng vai AI + luyện nói | kịch bản theo cấp (giống `ja`), tài liệu luyện nói |
| Audio | giọng máy `de-DE` dự phòng ngay; audio thật bằng `scripts/generate-audio.mjs` (tuỳ chọn) |

Vốn từ chủ động mục tiêu: A1 ≈ 650, A2 ≈ +700, B1 ≈ +1.100, B2 ≈ +1.800 (cộng dồn xấp xỉ 4.250 từ/cụm, bám khung từ vựng công khai của Goethe-Institut nhưng **tự soạn**, không chép).

## 2. Chỗ riêng của tiếng Đức (rủi ro cần xử lý từ đầu)

1. **Chấm bài (`packages/shared/src/content/grading.ts` + bản SQL + `grading.fixtures.json`, đồng bộ bằng `scripts/sync-grading-fixtures.mjs`).** Bàn phím Việt khó gõ ä ö ü ß.
   - `answer_lang: de`; gấp `ä/ö/ü/ß` với `ae/oe/ue/ss` ở cả hai phía: gõ `fuer`, `Strasse` được **đúng**; gõ `fur` (rơi dấu chấm) là **gần đúng**.
   - Hoa/thường danh từ bị bỏ qua khi chấm (đã lowercase); quy tắc "Nomen groß" dạy bằng `mcq`/`word_bank` chứ không bằng gõ tự do.
   - Cả TS lẫn SQL phải cho cùng kết quả (fixture dùng chung + pgTAP).
2. **Giống và số nhiều.** Mỗi danh từ là một item có `der/die/das` + dạng số nhiều trong `front.text` (`der Tisch, -e`), nên học cả cụm, không học từ trơ trụi. Không đổi schema.
3. **Hệ thống chữ.** Chữ Latinh nên không cần bài "bảng chữ cái" kiểu kana; thay bằng chương trình pre-A1 (phát âm, chữ cái, âm đặc thù: ä ö ü, ch trong ich/ach, sch/sp/st, r, nguyên âm dài–ngắn, trọng âm).
4. **Điểm khó với người Việt, phải xuyên suốt giáo trình:** giống danh từ (tiếng Việt không có), bốn cách (Nominativ/Akkusativ/Dativ/Genitiv), vị trí động từ (V2, cuối câu phụ, khung câu *Satzklammer*), đuôi tính từ, động từ tách, thể Konjunktiv, `du/Sie`.
5. **Chuẩn ngôn ngữ:** Hochdeutsch (Đức), ghi chú khác biệt Áo/Thụy Sĩ khi hay gặp (`Jänner`, `Grüezi`); đề thi bám chuẩn Đức.
6. **Bản quyền:** giáo trình thương mại (Netzwerk neu, Menschen, Schritte plus, Begegnungen…) và đề Goethe/telc/TestDaF thật chỉ dùng làm **mốc đối chiếu cấu trúc và độ khó**, không chép câu chữ, không chép đề.

## 3. Cơ sở khoa học của giáo trình

- Khung: CEFR (Companion Volume 2020) + *Profile deutsch* + mô tả đề Goethe-Zertifikat A1–B2 (Start Deutsch 1, A2, B1, B2) làm đích đầu ra từng cấp.
- Tiến trình ngữ pháp **cố định trước** (ma trận ở mục 7): mỗi điểm ngữ pháp được *giới thiệu ở đúng một bài*, về sau chỉ `reuse` + ôn xoắn ốc; thứ tự theo tần suất và độ khó đối với người Việt.
- Mỗi bài theo khuôn của repo (`content/README.md`): `objective`, `explain` (≤ 3 câu/ý, xưng "bạn"), ≥ 2 `example`, `common_mistake`, `summary`, `deep_explain`; bài tập recognition → recall → application; luôn so sánh với tiếng Việt.
- Bốn kỹ năng cân bằng qua từng unit: bài 1–3 từ vựng + ngữ pháp, bài 4 nghe/nói, bài 5 đọc/viết + ôn.
- Ôn khoảng cách: học liệu `reuse` ở các unit sau, flashcard FSRS sẵn có lo phần nhớ lâu.

## 4. Các giai đoạn

### Giai đoạn 1 — Nền tảng kỹ thuật (làm trực tiếp trong phiên chính, không cần agent)

Theo đúng danh sách file của commit tiếng Nhật; `LANGUAGES.de.available = false` cho tới khi giai đoạn 6.

- `shared/constants.ts` (thêm `de`, `nameVi: 'Tiếng Đức'`, `nativeName: 'Deutsch'`), `shared/learning/levels.ts` (thang, `CONTENT_MAX_LEVEL`, mục tiêu học, `UNSURE_DEFAULT_LEVEL`, nhãn), `authoring.ts` (regex key `en|ko|ja|de|src`), `bundle.ts`, `rpc.ts`, `exercises.ts`, `diagnostic/*`, `exam/*` (họ `goethe`), `ai/contract.ts`, `ai/roleplay-catalog.ts` và bản sao ở `supabase/functions/_shared/` (đồng bộ bằng `sync-ai-contract`).
- **Mục tiêu học (goal) cho `de`:** `foundation` (nền tảng → A2), `daily_communication` (→ B1), `goethe` (đạt một bậc Goethe/CEFR, mới), `skill_focus`; ràng buộc `learning_paths_goal_matches_language` cập nhật tương ứng.
- Chấm bài: mục 2.1 (TS + SQL + fixture + pgTAP + vitest).
- Giọng đọc: `de-DE` ở `machine-speech.ts`, `features/exam/tts.ts`, `audio/content-audio.ts`, `speaking/useSpeechRecognition.ts`, `ForeignText.tsx`.
- Gia sư AI: tên ngôn ngữ và quy tắc riêng tiếng Đức trong `ai-tutor/lib/prompts/*` (giải thích theo giống/cách, sửa lỗi đuôi tính từ, vị trí động từ), `cache-key.ts`.
- Màn hình: onboarding chọn ngôn ngữ, đề thi, flashcard, admin, từ vựng cá nhân, luyện nói (`speaking/content.ts`), CSS font (`global.css`) nếu cần.
- **Migration mới** `20261018200000_german.sql` (số kế tiếp sau `20261018190000`; **kiểm lại số lớn nhất ngay trước khi đặt tên**, xem `migration-number-coordination`): mở các CHECK `language_code`, `level_reference_hours` cho `de`, `learning_paths` goal, `learning_path_validate`, `create_personal_list`, chẩn đoán (`assessments` + bản ghi diagnostic rỗng cho `de`), họ đề `goethe`, hàm `exam_*`, chấm bài SQL. Không sửa migration đã áp.
- Giờ tham khảo cộng dồn (đánh dấu chưa kiểm duyệt, theo khuyến nghị của Goethe-Institut quy ra giờ 60 phút): pre-A1 0, A1 80, A2 200, B1 400, B2 650.
- Kiểm thử: test `shared/german.test.ts` (mô phỏng `japanese.test.ts`), `supabase/tests/german.test.sql`, `content-import.test.mjs`, test trần nội dung (`content-ceiling`).

### Giai đoạn 2 — Công cụ chất lượng nội dung tiếng Đức (trước khi viết bài nào)

Mục đích: bắt lỗi chính tả, giống, hoa/thường **bằng máy**, vì rà soát bằng AI đơn thuần không đủ.

- `scripts/content/german-lint.mjs` (chạy trong `pnpm content:check`):
  - kiểm chính tả mọi chuỗi `lang: de` bằng `nspell` + `dictionary-de` (offline, thêm danh sách từ cho phép của dự án);
  - danh từ viết hoa trong ví dụ (heuristic có danh sách ngoại lệ);
  - **từ điển giống/số nhiều** `content/de/lexicon.json` sinh từ các item danh từ; ví dụ dùng sai mạo từ của danh từ đã biết bị báo;
  - mỗi item danh từ phải có mạo từ + số nhiều; số nhiều khai báo kiểu `-e/-en/-¨e/-er/-¨er/-s/-` hợp lệ.
- Mở rộng kiểm tra của importer: mọi `accepted`/`orders` chấm đúng, `known_wrong` chấm sai (đã có), cộng quy tắc gấp umlaut.
- Nếu máy có Java, thêm LanguageTool cục bộ làm lớp kiểm ngữ pháp thứ hai (hiện **chưa có Java**; cần bạn đồng ý cài, mục 8).
- `content/README.md`: thêm mục "Tiếng Đức" (cấp độ, bố cục thư mục `content/de/…`, quy ước `der Tisch, -e`, du/Sie, IPA hay không, cách ghi phát âm cho người Việt, quy tắc chấm umlaut, ví dụ `known_wrong` như `article`, `case_dat_akk`, `verb_position`, `adj_ending`).
- **Ma trận giáo trình từng bài** (`docs/superpowers/specs/2026-10-17-linguo-german-syllabus.md`): 195 dòng — unit, tiêu đề bài, mục tiêu giao tiếp, điểm ngữ pháp *giới thiệu*, chủ đề từ vựng, kỹ năng. **Bạn duyệt ma trận này trước khi viết nội dung.**

### Giai đoạn 3 — Viết nội dung, theo từng cấp (mỗi cấp là một mốc phát hành được)

Thứ tự: pre-A1 → A1 → A2 → B1 → B2. Mỗi **unit (5 bài)** là một gói việc:

1. Tác giả (agent) viết `unit.yaml`, file items, 5 bài, theo ma trận và khuôn README.
2. Tự động: `pnpm content:check` (schema, tự chấm, German lint, spellcheck).
3. **Rà soát độc lập** bởi agent khác theo checklist (giống/cách, đuôi tính từ, vị trí động từ, chính tả, tự nhiên của câu, bản dịch Việt, phương án nhiễu thật sự sai, đáp án chấp nhận đủ biến thể). Lỗi phát hiện được sửa rồi chạy lại bước 2.
4. Commit thẳng vào `main` theo từng unit (`content(de): A1 unit 3 …`), như quy ước repo.

Quy mô thực thi: 39 gói unit; chạy **tối đa 2 agent song song** (quy tắc `minimize-agents`), mỗi cặp một cấp để ma trận ngữ pháp không đụng nhau; khoảng 20 vòng. Phát hành từng phần được nhờ `CONTENT_MAX_LEVEL` (nâng dần `pre_a1 → a1 → … → b2`).

### Giai đoạn 4 — Kiểm tra đầu vào, đề thi, đóng vai, luyện nói

- `content/diagnostic/de/{vocabulary,grammar,reading}.yaml` (≥ 5 câu / kỹ năng / cấp; viết 6).
- `content/exams/de/goethe-{a1,a2,b1,b2}-mock-*.yaml` (6 đề, tự soạn theo cấu trúc Lesen/Hören/Schreiben/Sprechen, thang điểm và dải kết quả như đề TOPIK/JLPT hiện có).
- Kịch bản đóng vai AI (gọi món, thuê nhà, đi khám, phỏng vấn, tranh luận B2…) ở `roleplay-catalog.ts` (+ bản sao edge function) và tài liệu luyện nói ở `speaking/content.ts`.

### Giai đoạn 5 — Audio (tuỳ chọn, không chặn phát hành)

`scripts/generate-audio.mjs` với giọng Gemini TTS tiếng Đức cho bài nghe, cần khoá API của bạn (theo `docs/AUDIO.md`). Trong lúc chưa có, trình phát dùng giọng máy `de-DE`.

### Giai đoạn 6 — Nghiệm thu và phát hành

- `pnpm content:check`, `pnpm test`, build web, test pgTAP; regenerate `supabase/seed.sql`.
- Ghi thẳng thắn trong `content/README.md`/`HANDOFF.md`: nội dung do AI duyệt, **chưa qua giáo viên tiếng Đức bản ngữ** (cùng cách ghi như en/ko/ja); `reviewed_by` ghi trung thực.
- Bật `LANGUAGES.de.available = true`, push, chạy workflow **Publish content** (một transaction, đã có timeout service_role; không chia nhỏ).
- Cập nhật `docs/FEATURES.md`, `HANDOFF.md`.

## 5. Cột mốc

| Mốc | Nội dung | Phát hành được? |
|---|---|---|
| M1 | Giai đoạn 1 + 2 xong, ma trận được duyệt | không (de còn ẩn) |
| M2 | pre-A1 + A1 (55 bài) + kho đầu vào A1 + đề A1 | có, ceiling `a1` |
| M3 | A2 (40 bài) + đề A2 | có, ceiling `a2` |
| M4 | B1 (50 bài) + đề B1 ×2 | có, ceiling `b1` |
| M5 | B2 (50 bài) + đề B2 ×2 + toàn bộ đóng vai/luyện nói | có, ceiling `b2` = mục tiêu |

## 6. Cách đảm bảo "chuẩn và chính xác" (và giới hạn trung thực)

Các lớp kiểm: schema + tự chấm của importer → spellcheck `dictionary-de` → lint giống/hoa-thường theo từ điển dự án → rà soát độc lập bằng agent thứ hai (khác người viết) theo checklist → (tuỳ chọn) LanguageTool. Các lớp này bắt được phần lớn lỗi chính tả, giống, hình thái; **không thay được người bản ngữ** ở độ tự nhiên, ngữ vực và sắc thái. Khuyến nghị: nhờ một giáo viên DaF/người Đức đọc mẫu (≈ 10% bài, tập trung B1–B2 và các đề thi) trước khi bật `available`; khi có, cập nhật `reviewed_by`/`reviewed_at`.

## 7. Phụ lục — ma trận ngữ pháp và chủ đề theo unit (mức unit; mức bài nằm ở file syllabus)

**pre-A1 · Phát âm & chữ cái (3 unit / 15 bài)**
1. Chữ cái & âm: ABC, đánh vần, nguyên âm dài–ngắn, ä ö ü, ei/eu/au, ch, sch/sp/st, ß, r, trọng âm.
2. Những từ đầu tiên: chào hỏi, số 0–20, từ gốc quốc tế, der/die/das lần đầu, `ich bin / ich heiße`.
3. Lớp học & đọc câu ngắn: tiếng Đức trong lớp, ngữ điệu, Nomen viết hoa, đọc đoạn 3–4 câu.

**A1 (8 unit / 40 bài)**
1. Sich vorstellen: `sein`, `heißen`, đại từ nhân xưng, chia động từ thường, W-Fragen, Ja/Nein-Frage, du/Sie, quốc gia–ngôn ngữ, số đến 100.
2. Familie & Beruf: `haben`, giống + số nhiều, ein/kein, phủ định `nicht/kein`, Possessivartikel (mein/dein), nghề nghiệp.
3. Essen & Einkaufen: Akkusativ, `möchten/mögen`, động từ đổi nguyên âm (essen/nehmen), giá cả, đơn vị, số lớn.
4. Tagesablauf: giờ giấc, thứ/ngày/tháng, động từ tách, Modalverben (können/müssen/wollen), khung câu, `am/um/von…bis`.
5. Wohnen & Orte: nhà, đồ đạc, `es gibt`, giới từ chỉ nơi (in/auf/an…), hỏi đường, Imperativ.
6. Freizeit & Verabredung: mời/hẹn, `dürfen/sollen`, Perfekt nhập môn (haben/sein, Partizip II), thời tiết.
7. Reisen, Verkehr & Kleidung: phương tiện, mua vé, Dativ nhập môn (mit/bei/von/zu), quần áo/màu, tính từ vị ngữ, so sánh nhập môn.
8. Gesundheit, Ämter & Ôn A1: cơ thể, đi khám, hẹn lịch, viết thiệp/e-mail ngắn, ôn A1 + luyện kiểu Start Deutsch 1.

**A2 (8 unit / 40 bài)**
1. Erzählen: Perfekt đầy đủ, Präteritum của sein/haben/Modalverben, trạng từ thời gian, kể cuối tuần.
2. Wohnen & Umziehen: Dativ/Akkusativ + đại từ, Wechselpräpositionen đầy đủ, đuôi tính từ sau mạo từ không xác định.
3. Arbeit & Bewerbung: nghề, điện thoại, `weil/denn/dass`, câu phụ (động từ cuối câu), động từ đi với Dativ.
4. Gesundheit: Reflexivverben, lời khuyên, `sollte/könnte` (Konjunktiv II nhập môn), cơ thể/bệnh/thuốc.
5. Reisen & Urlaub: Präteritum thường, `wenn/als`, so sánh/ cấp cao nhất, đặt phòng, khiếu nại nhẹ.
6. Stadt & Dienstleistungen: gián tiếp câu hỏi `ob`, `um…zu` nhập môn, ngân hàng/bưu điện/cơ quan.
7. Feste, Medien & Konsum: đuôi tính từ (xác định/không mạo từ), `zu`-Infinitiv, tin tức, mua sắm online.
8. Ôn A2 + luyện kiểu Goethe A2 (viết e-mail, nghe thông báo).

**B1 (10 unit / 50 bài)**
Präteritum kể chuyện · Konjunktiv II (ước, khuyên, giả định) · Relativsätze (Nom/Akk/Dat/giới từ) · Passiv (Präsens/Präteritum/Perfekt/với Modalverb) · Genitiv + n-Deklination · Nebensätze (obwohl, damit, um…zu, falls, während, bevor, nachdem, seitdem) · Verb + giới từ & Pronominaladverbien (darauf/worauf) · Futur I & suy đoán · Partizip như tính từ · đuôi tính từ hoàn chỉnh.
Chủ đề: quan hệ & cảm xúc, môi trường, thế giới việc làm, giáo dục, truyền thông, xã hội, sức khoẻ, du lịch–văn hoá; viết: thư/e-mail trang trọng, khiếu nại, nêu ý kiến; nói: thảo luận, trình bày.

**B2 (10 unit / 50 bài)**
Konjunktiv I & lời nói gián tiếp · Partizipialattribute · Nominalisierung/Verbalstil · thay thế bị động (`sich lassen`, `sein + zu`) · Konnektoren (deshalb, dennoch, zumal, indem, sodass, je…desto, entweder…oder) · Konjunktiv II quá khứ · Funktionsverbgefüge · tiểu từ tình thái · cách diễn đạt trang trọng–thân mật · thành ngữ.
Chủ đề: kinh tế, khoa học–công nghệ, chính trị–xã hội, nhập cư–hội nhập, truyền thông, văn hoá–nghệ thuật, môi trường, pháp luật, giáo dục–sự nghiệp; thể loại: Erörterung, Leserbrief, Bericht, Zusammenfassung, nghe radio/bài giảng; luyện đề B2.

## 8. Quyết định cần bạn chốt (mặc định của tôi để trong ngoặc)

1. Thang trình độ dùng lại mã CEFR `pre_a1…b2` (có) và họ đề mới `goethe`.
2. Quy mô 195 bài (có) — hay muốn nhiều hơn/ít hơn?
3. Tối đa 2 agent song song (có), hay cho phép tới 5 để nhanh hơn?
4. Cài Java + LanguageTool cục bộ làm lớp kiểm ngữ pháp thứ hai (có, nếu bạn đồng ý cài).
5. Chấm `fuer/Strasse` là đúng, `fur/Strase` là gần đúng (có).
6. Có người bản ngữ/giáo viên DaF đọc mẫu trước khi bật `available`? (nên có)
