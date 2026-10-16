# Nội dung học Linguo

Toàn bộ nội dung học (chương trình, unit, bài, học liệu, bài tập kèm đáp án) được viết bằng YAML trong thư mục này. `scripts/content-import.mjs` kiểm tra bằng schema zod dùng chung (`packages/shared/src/content/authoring.ts`), rồi nhập vào Supabase. Đáp án được tách sang schema `content_private`, client không bao giờ đọc được trước khi trả lời.

> Nội dung hiện tại đã được duyệt ngày 14/10/2026 (`demo: false`, `status: published`). Người duyệt là AI (Claude) được chủ dự án ủy quyền, chưa qua giáo viên bản ngữ; khi có người duyệt thì cập nhật `reviewed_by`/`reviewed_at`.

## Cấu trúc thư mục

```
content/
  sources.yaml                                   # nguồn nội dung + giấy phép
  en/items/<chủ-đề>.yaml                         # học liệu (từ, cụm từ, điểm ngữ pháp)
  en/programs/<program>/program.yaml
  en/programs/<program>/units/<nn>-<unit>/unit.yaml
  en/programs/<program>/units/<nn>-<unit>/lessons/<nn>-<lesson>.yaml
  ko/...                                         # giống en
  ja/...                                         # giống en (tiếng Nhật: kana-basics, n4, n3)
  diagnostic/<en|ko|ja>/<kỹ-năng>.yaml            # kho câu hỏi kiểm tra đầu vào (spec 4)
  exams/<en|ko|ja>/<tên-đề>.yaml                  # đề luyện thi mô phỏng (spec 9)
```

- Unit thuộc chương trình chứa thư mục của nó; bài thuộc unit chứa thư mục của nó. Nguồn (`source`) của unit, bài và bài tập lấy từ `program.yaml`; của học liệu lấy từ file items.
- Tiền tố `<nn>-` chỉ để sắp xếp file; thứ tự thật là `order_index`.

## Quy ước chung

- Mọi file bắt đầu bằng dòng `# DEMO — chưa kiểm duyệt` khi là nội dung demo, có `schema_version: 1` và `demo: true|false`.
- File demo không đặt `reviewed_by`/`reviewed_at` (để `null`).
- Trạng thái duyệt (`status`, `reviewed_by`, `reviewed_at`): chương trình, unit, bài đặt ở đầu file; học liệu đặt ở đầu file items (áp dụng cho mọi item trong file); nguồn đặt trong từng mục của `sources.yaml`. Nội dung demo bỏ trống `status` thì được nhập là `published`; nội dung **không** demo phải ghi rõ `status`, và khi `approved`/`published` phải có cả `reviewed_by` lẫn `reviewed_at`.
- Bài `published` chỉ được liên kết (và dùng trong bài tập) học liệu `published`, nếu không học liệu sẽ không hiện ra.
- **Key** ổn định, không đổi sau khi xuất bản (id trong DB sinh từ key): `<lang>:<loại>:<tên>`, ví dụ `en:lesson:i-am`, `ko:item:vowel-eo`, `en:exercise:i-am-translate-student`; nguồn dùng `src:<tên>`. Chỉ chữ thường, số, gạch ngang.
- Cấp độ: EN `pre_a1 … c2`, KO `hangul, topik1 … topik6`, JA `kana, n5, n4, n3, n2, n1` (tăng dần: N5 thấp nhất); cấp của bài phải nằm trong khoảng `level_from…level_to` của chương trình.
- Mỗi học liệu chỉ được `introduce` ở một bài; các bài khác dùng `role: reuse`.
- Văn bản tiếng Việt đủ dấu, chuẩn hoá **NFC** (gõ bằng bộ gõ Unicode dựng sẵn). Công cụ kiểm tra từng chuỗi sau khi đọc YAML, nên cả chuỗi viết bằng escape (`"Tôi"`) cũng bị bắt; ký tự điều khiển (trừ xuống dòng và tab) và U+FFFE/U+FFFF bị cấm.
- Trong `content/` chỉ có file `.yaml`/`.yml` (nội dung) và `.md` (tài liệu); file khác bị báo lỗi.

## Một bài học gồm gì (PRD §6.2)

Khối `body` bắt buộc có: `objective`, `explain`, ít nhất hai `example`, `common_mistake`, `summary`; nên có `deep_explain` cho người muốn đọc kỹ hơn.

Bài tập (khoảng 8 bài) đi theo thứ tự **recognition → recall → application** và đủ cả ba giai đoạn:

| Giai đoạn | Dạng thường dùng | Gợi ý |
|---|---|---|
| `recognition` | `mcq`, `listen`, `word_bank`, `fill_blank` có gợi ý | được dùng `hint_levels` (dịch đầy đủ → từ khoá) |
| `recall` | `fill_blank`, `translate` `vi_to_target` | **không** gợi ý |
| `application` | `translate` hai chiều, `word_bank`, `mcq` tình huống | **không** gợi ý |

- `mcq`/`listen`: `display_answer` phải trùng **chính xác** văn bản phương án đúng (giao diện dùng nó để đánh dấu "Đáp án đúng"). Id phương án là chuỗi ngắn ngẫu nhiên, không lộ thứ tự. Thứ tự phương án trong YAML không quan trọng: `pnpm content:build` xáo trộn cố định (theo key bài tập) khi tạo bundle, nên phương án đúng không bao giờ cố định một vị trí.
- `listen` khi chưa có audio: `audio_asset_id: null`, `fallback_text` là câu được đọc.
- `word_bank`: liệt kê trong `orders` **mọi** thứ tự đúng. Nếu có hai token giống nhau (ví dụ hai chữ ㅇ trong 오이), phải liệt kê cả hai hoán vị. Danh sách `tokens` phải được xáo trộn: thứ tự viết các token (chỉ xét các token có trong đáp án) không được trùng bất kỳ thứ tự đúng nào.
- `translate`: `vi_to_target` có `source_lang: vi` và `answer_lang` là ngôn ngữ của bài (`en`/`ko`); `target_to_vi` ngược lại (`source_lang` là ngôn ngữ của bài, `answer_lang: vi`).
- Ghép chữ Hangul luôn dùng `word_bank` với token là chữ cái rời; không bắt người học gõ jamo.

## Hướng dẫn viết

- Mỗi ý giải thích **tối đa 3 câu**, xưng "bạn", dùng từ ngữ đơn giản cho người mới, hạn chế thuật ngữ ngôn ngữ học.
- Luôn **so sánh với tiếng Việt**: điều gì giống, điều gì người Việt hay làm sai (bỏ `be`, quên `a/an`, nhầm 어/오, 으/우…).
- Lời giải thích của mỗi bài tập phải nói được **vì sao** đáp án đúng, không chỉ nhắc lại đáp án.
- Tiếng Anh: ghi IPA cả **UK và US** khi hai cách đọc khác nhau (`UK /ˈtiːtʃə/ · US /ˈtiːtʃɚ/`).
- Tiếng Hàn: chuẩn Seoul, câu dùng đuôi lịch sự **해요체**. Phiên âm Latinh (Romanization chuẩn) chỉ để tham khảo trong học liệu, **không bao giờ là đáp án** - nên thêm phiên âm vào `known_wrong` với `error_tag: romanization`.
- Bản dịch tiếng Việt tự nhiên, không dịch từng chữ.

## Đáp án và biến thể

Câu trả lời được chấm trên server theo thuật toán trong `packages/shared/src/content/grading.ts` (chữ thường, bỏ dấu câu, mở rộng `I'm`→`I am`… nhưng **không** mở rộng `'s`).

- Bài dịch tự do: **ít nhất 3 biến thể** trong `accepted`. Viết riêng các dạng có `'s` (`She's an engineer.` bên cạnh `She is an engineer.`), vì `'s` không được mở rộng tự động.
- Đáp án tiếng Việt: liệt kê các cách nói phổ biến (đại từ, "những/các", "nhé"…); thường đặt `rubric.diacritics: lenient` để câu gõ thiếu dấu được tính "gần đúng".
- Đáp án tiếng Anh dài: `rubric.typo_tolerance: 1` (một lỗi gõ ở từ ≥ 5 chữ cái được tính "gần đúng"; mạo từ sai luôn là sai).
- Đáp án tiếng Hàn: `ko_spacing: lenient` (mặc định) - sai khoảng cách là "gần đúng"; sai biến thể trợ từ (은/는, 이/가…) là sai.
- Đáp án tiếng Nhật: máy chấm bỏ dấu câu (`、` `。` `「」`…) rồi bỏ mọi khoảng trắng, nên không cần khai biến thể chỉ khác dấu câu hay khoảng trắng; vẫn phải khai biến thể kana/kanji (`がっこう` / `学校`).
- `known_wrong`: thêm các lỗi dự đoán được của người Việt kèm `feedback_vi` ngắn và `error_tag` dạng snake_case (`missing_be`, `article`, `be_form`, `possessive`, `vowel_eo_o`, `consonant_tense`, `romanization`…).
- `known_wrong` của `fill_blank` áp dụng cho mọi ô trống, nhưng mỗi ô so với `accepted` của nó trước. Quy tắc kiểm tra: một đáp án `known_wrong` không được trùng (sau chuẩn hoá) với đáp án đúng của **bất kỳ** ô nào trong bài tập.
- Công cụ kiểm tra bắt buộc: mọi `accepted`/`blanks`/`orders` chấm **đúng**; mọi phương án nhiễu và `known_wrong` của `translate` chấm **sai**; `known_wrong` của `fill_blank` theo quy tắc ở trên.

## Kho câu hỏi kiểm tra đầu vào (spec 4)

`content/diagnostic/<en|ko|ja>/<kỹ-năng>.yaml`, một file cho mỗi kỹ năng `vocabulary`, `grammar`, `reading` (schema: `packages/shared/src/diagnostic/authoring.ts`).

```yaml
# DEMO — chưa kiểm duyệt
schema_version: 1
demo: true
language: en
skill: vocabulary
items:
  - key: en:diag:voc-pre-a1-dog
    level: pre_a1
    item_type: mcq                 # vocabulary/grammar: mcq | cloze_choice; reading: reading_mcq
    prompt:
      stem: Từ nào có nghĩa là “con chó”?
      stem_lang: vi
      # passage: "..."             # chỉ reading_mcq, bắt buộc
      options:
        - { id: a, text: cat, lang: en }
        - { id: b, text: dog, lang: en }
        - { id: c, text: duck, lang: en }
        - { id: d, text: pig, lang: en }
    answer: b                      # id phương án đúng
    explanation:
      vi: "“Dog” là con chó; “cat” là con mèo, “duck” là con vịt, “pig” là con lợn."
```

- Mỗi ngôn ngữ có kho phải đủ **≥ 5 câu cho mỗi kỹ năng × cấp độ** (105 câu cho en/ko với 7 cấp, 90 câu cho ja với 6 cấp); `stem` không trùng trong cùng ngôn ngữ; đúng một phương án đúng, phương án nhiễu hợp lý nhưng chắc chắn sai.
- `difficulty` (tuỳ chọn) mặc định là thứ tự cấp độ + 0,5 (pre_a1/hangul = 0,5 … c2/topik6 = 6,5); nếu ghi thì phải nằm trong dải của cấp.
- Thứ tự và id phương án trong YAML không lộ ra ngoài: `pnpm content:build` xáo trộn cố định theo key và đổi id thành chuỗi ngẫu nhiên ổn định.
- File demo giữ `key_confidence: unreviewed` (mặc định), không ghi `reviewed_by`/`reviewed_at`; file không demo phải có cả hai.
- Dùng `vi: "..."` trong ngoặc kép khi câu có dấu phẩy hoặc dấu hai chấm (cú pháp `{ vi: ... }` cắt chuỗi ở dấu phẩy).
- Kho được nhập bằng `content_private.import_diagnostic_bundle` (câu lệnh thứ hai trong `supabase/seed.sql`; `pnpm content:push` gọi `public.import_diagnostic_content_bundle`). Câu bị xoá khỏi YAML được lưu trữ (`archived`), không xoá khỏi DB.

## Đề luyện thi (spec 9)

`content/exams/<en|ko>/<tên-đề>.yaml`, mỗi file một đề (schema: `examFileSchema` trong `packages/shared/src/exam/contract.ts`). Mọi đề là **bài luyện mô phỏng** tự soạn, không bao giờ chép đề thi thật (TOPIK, Cambridge…).

```yaml
# DEMO — chưa kiểm duyệt
schema_version: 1
demo: true
language: ko
form:
  key: ko:exam:topik-i-mock-1
  family: topik_i                 # topik_i | topik_ii (ko), cefr (en)
  title_vi: TOPIK I — Bài luyện mô phỏng số 1
  description_vi: ...
  level_from: topik1
  level_to: topik2
  source_key: src:linguo-demo
  time_limits: { listening: 15, reading: 25 }   # phút, bắt buộc cho mọi phần có câu hỏi
  scoring:
    verified: false               # file demo luôn false
    source_note_vi: Thang điểm theo cấu trúc tại thời điểm soạn, chưa đối chiếu quy chế hiện hành.
    section_max: { listening: 100, reading: 100 }
    bands: [{ level_code: topik1, min_total: 80 }, { level_code: topik2, min_total: 140 }]
    pass_ratio: null              # CEFR: bands: [] và pass_ratio (ví dụ 0.6)
questions:
  - key: ko:examq:topik-i-m1-l01
    section: listening            # listening → reading → writing, mỗi phần liền một khối
    kind: mcq                     # mcq | short_text | essay
    question_type: topik_i_listen_response   # tiền tố là họ đề; một dạng chỉ thuộc một phần và một kind
    level_code: topik1            # nằm trong level_from…level_to
    points: 3
    prompt:
      instruction_vi: Nghe câu hỏi và chọn câu trả lời phù hợp.
      stem: 다음을 듣고 물음에 맞는 대답을 고르십시오.
      stem_lang: ko
      audio_asset_id: null
      script: |-                  # nghe: bắt buộc script hoặc audio_asset_id; script chỉ hiện sau khi nộp
        여자: 우산이 있어요?
      options:
        - { id: a, text: "네, 우산이 있어요.", lang: ko }
        - { id: b, text: "네, 우산이 아니에요.", lang: ko }
    answer: a
    explanation:
      vi: "Vì sao đáp án đúng, và vì sao phương án dễ nhầm lại sai."
```

- `mcq`: có `options`, `answer` là id một phương án. Như kho kiểm tra đầu vào, `pnpm content:build` xáo trộn phương án cố định theo key câu hỏi và đổi id thành chuỗi `o` + 8 ký tự hex ổn định, nên thứ tự và id trong YAML không lộ đáp án.
- `short_text` (chỉ phần viết, kiểu câu 51–52): `answer` là danh sách mọi đáp án chấp nhận. Máy chấm (`normalizeExamText` trong `packages/shared/src/exam/grading.ts`, SQL dùng cùng quy tắc) chỉ chuẩn hoá NFC, bỏ khoảng trắng đầu cuối, gộp khoảng trắng liên tiếp, bỏ dấu câu ở cuối (`.?!,;:。、…`) và không phân biệt hoa thường; **không** sửa cách chữ hay biến thể ngữ pháp, nên phải liệt kê từng biến thể hợp lệ. Hai đáp án giống nhau sau chuẩn hoá bị báo lỗi.
- `essay` (chỉ phần viết): không có `answer`, bắt buộc `rubric` (ví dụ `content`/`organization`/`language`), nên có `sample_answer` và `min_chars`/`max_chars`. Bài luận không được chấm tự động.
- Phần nghe chưa có audio: `audio_asset_id: null` và `script` bằng ngôn ngữ đích (ứng dụng đọc bằng giọng máy). Viết số bằng chữ số (`1층`, `30%`) như văn bản thông thường.
- Thang điểm: TOPIK cần `section_max` cho mọi phần có câu hỏi, `bands` tăng dần, `pass_ratio: null`; CEFR cần `bands: []` và `pass_ratio`. File demo: header `# DEMO — chưa kiểm duyệt`, `scoring.verified: false`, không ghi `reviewed_by`/`reviewed_at`; file không demo phải có cả hai.
- Đề được nhập bằng `public.import_exam_content_bundle` (câu lệnh thứ ba trong `supabase/seed.sql`, sau kho kiểm tra đầu vào; `pnpm content:push` gọi cùng RPC sau diagnostic). Bundle theo `examBundleSchema` (`packages/shared/src/exam/bundle.ts`): `prompt` công khai không chứa `script`; `answer`, `explanation`, `script`, `rubric`, `sample_answer` được tách sang `content_private.exam_keys`.

## Tiếng Nhật (ja)

`LANGUAGES.ja.available` là `true` (`packages/shared/src/constants.ts`): đã có chương trình Kana → N5 (`kana-basics`), N4, N3, kho kiểm tra đầu vào và đề JLPT N5/N4/N3. Các file ja ghi `demo: false`, `status: published` với người duyệt là AI do chủ dự án ủy quyền (như en/ko, xem đầu file này); chưa qua giáo viên bản ngữ, và chưa có nội dung N2/N1.

- Học liệu: `ja/items/<chủ-đề>.yaml`, key `ja:item:<tên>`. `type`: `vocab`, `phrase`, `grammar_point`, `kana` (chữ Hiragana/Katakana, như `hangul` của KO).
- `front.text` viết bằng chữ Nhật (kana/kanji); `front.reading` là cách đọc bằng kana khi từ có kanji (学校 → がっこう, dùng làm furigana); `front.romanization` là Hepburn, chỉ để tham khảo.
- Chương trình: `ja/programs/<slug>/program.yaml` (key `ja:program:<slug>`, ví dụ slug `kana`, `n5`, `n4`), unit `units/<nn>-<unit>/unit.yaml`, bài `units/<nn>-<unit>/lessons/<nn>-<bài>.yaml`. `goal_types` của chương trình `kind: goal`: `kana_basics`, `communication`, `jlpt`, `skill_focus`.
- Kho kiểm tra đầu vào: `diagnostic/ja/<vocabulary|grammar|reading>.yaml`, `language: ja`, key `ja:diag:<tên>`; mỗi ô kỹ năng × cấp cần ≥ 5 câu. Bài kiểm tra `ja:assessment:diagnostic:v1` đã có sẵn trong DB (migration `20261018130000_japanese.sql`).
- Đề luyện thi: `exams/ja/<tên-đề>.yaml`, `family: jlpt`, key `ja:exam:<tên>`, câu `ja:examq:<tên>`; chấm như TOPIK: `section_max` cho mọi phần có câu hỏi, `bands` tăng dần theo `n5…n1`, `pass_ratio: null`.

## Lệnh

```bash
pnpm content:check          # kiểm tra schema, key, tiền quyết, cấp độ, đáp án (không cần DB)
pnpm content:build          # sinh supabase/seed.sql từ content/
pnpm content:build --check  # CI: báo lỗi nếu seed.sql lệch với content/
pnpm content:push           # nhập lên Supabase hosted (cần SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY)
```

Xem thêm `docs/DEPLOY.md`, mục "Xuất bản nội dung".

## Checklist người duyệt

Chung (PRD §18):
- [ ] Nguồn và giấy phép rõ ràng (`sources.yaml`), không sao chép nội dung có bản quyền.
- [ ] Đúng bậc: từ vựng, cấu trúc phù hợp cấp độ của bài; chỉ tăng một vài yếu tố mới mỗi bài.
- [ ] Đáp án duy nhất, hoặc đã liệt kê đủ biến thể hợp lý; phương án nhiễu chắc chắn sai.
- [ ] Lời giải thích nói được "vì sao"; ví dụ có ngữ cảnh và bản dịch tự nhiên.
- [ ] Tiếng Việt đủ dấu, tự nhiên, xưng "bạn"; không quá 3 câu mỗi ý.
- [ ] Bài tập đủ ba giai đoạn; gợi ý chỉ ở giai đoạn nhận diện.

Tiếng Anh:
- [ ] IPA đúng, có UK và US khi khác nhau; trọng âm đánh đúng.
- [ ] Mọi câu dùng `be` đúng chủ ngữ (am/is/are), không thiếu `be`.
- [ ] `a/an` chọn theo âm đọc (an engineer, a university, an hour); danh từ số nhiều không có `a/an`.
- [ ] Dạng viết tắt (`I'm`, `He's`) được chấp nhận ngang dạng đầy đủ.
- [ ] Từ dùng đúng ngữ cảnh (meet/see, Hello/Hi), không có lỗi chính tả Anh–Mỹ lẫn lộn trong cùng một câu.

Tiếng Hàn:
- [ ] Hangul đúng chính tả, chuẩn Seoul; câu ở đuôi 해요체 khi là câu hoàn chỉnh.
- [ ] Mô tả phát âm cho người Việt chính xác (ㅓ/ㅗ, ㅡ/ㅜ, thường/bật hơi/căng; ㅐ/ㅔ gần như trùng nhau trong tiếng Seoul hiện nay).
- [ ] Trợ từ đúng theo patchim (은/는, 이/가, 을/를, 이에요/예요).
- [ ] Phiên âm Latinh chỉ là tham khảo, không phải đáp án.
- [ ] Bài ghép chữ liệt kê đủ các thứ tự token đúng (kể cả token trùng nhau).
