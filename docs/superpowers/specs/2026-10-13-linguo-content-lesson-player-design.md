# Linguo — Spec 2: Nội dung và trình học bài

**Ngày:** 2026-10-13
**Trạng thái:** Đã duyệt thiết kế, chờ review văn bản
**Nguồn yêu cầu:** [Dac_ta_Linguo_English_Korean.md](./Dac_ta_Linguo_English_Korean.md) mục 3, 6.1–6.5, 7.5, 13.3, 14, 14.1–14.2, 15, 17.2, 18, 20.1, 20.4
**Nền tảng:** [Spec 0 — Nền móng](./2026-10-13-linguo-foundation-design.md), [Spec 1 — Onboarding và lộ trình](./2026-10-13-linguo-onboarding-learning-paths-design.md) (đã merge vào `main`)

---

## 1. Mục tiêu

Người học mở một bài trong lộ trình của mình, đi qua đủ các thành phần bắt buộc của PRD §6.2 (mục tiêu → giải thích → ví dụ → lỗi thường gặp → nhận diện → nhớ lại → vận dụng → tóm tắt → lịch ôn), làm bài tập được **chấm trên server mà không bao giờ lộ đáp án trước khi trả lời**, tiếp tục được sau khi tải lại trang, và vẫn làm bài được khi mạng chập chờn.

Nội dung được soạn bằng file trong repo, kiểm tra tự động, nhập vào DB bằng script; nội dung hiện tại là **demo, chưa kiểm duyệt** và luôn được gắn nhãn như vậy.

**Ngoài phạm vi:** flashcard/FSRS (spec 3 — ở đây lịch ôn tạm là +1 ngày), kiểm tra đầu vào (spec 4), AI (spec 5), kế hoạch phiên học/dashboard (spec 6), giao diện quản trị nội dung (sau), audio thật (chỉ placeholder).

## 2. Quyết định đã chốt

| Chủ đề | Quyết định |
|---|---|
| Lưu nội dung | YAML trong `content/` của repo (repo đang public → chỉ chứa nội dung demo). Nội dung đã kiểm duyệt sau này chuyển sang repo private, kéo vào bằng workflow publish |
| Hiển thị demo | Có, xuất bản với `is_demo = true` và nhãn "Nội dung demo — chưa kiểm duyệt" ở chương trình, bài học và màn hình học |
| Giấu đáp án | Schema riêng `content_private` không mở qua API; client không có quyền nào; lời giải thích cũng nằm ở đó |
| Học liệu | `learning_items` thuộc về ngôn ngữ (dùng lại giữa nhiều bài, một lịch ôn duy nhất cho spec 3); `lesson_items` nối bài ↔ học liệu |
| Bài tiên quyết | Chỉ gợi ý thứ tự + cảnh báo nhẹ, không khoá |
| Chấm bài | Chỉ trong Postgres (`grading_normalize`, `grade_exercise`); bản TS của bộ chuẩn hoá chỉ dùng để lint nội dung; hai bản khớp nhau qua fixtures dùng chung |
| Offline | Hàng chờ trên máy; không chấm ở client; không có đáp án trên client |
| Ghi dữ liệu học | Chỉ qua RPC `security definer`, `search_path = ''`, `auth.uid()`; `not_authenticated` giữ SQLSTATE `42501` như spec 1; mọi lỗi khác là `P0001` với mã snake_case |
| Ghi nội dung | Chỉ qua `content_private.import_bundle(jsonb)`, chỉ `service_role` được gọi |

## 3. Dữ liệu nội dung (migration `supabase/migrations/20261014000100_content.sql`)

### 3.1 Quy ước chung

Mọi bảng nội dung có:

- `id uuid` — **UUIDv5** sinh từ `key` ổn định trong repo (vd `en:lesson:greetings-hello`), nên nhập lại không đổi id.
- `key text unique not null`.
- `status text not null check (status in ('draft','in_review','approved','published','archived'))`.
- `is_demo boolean not null default false`.
- `reviewed_by text`, `reviewed_at timestamptz`; check `status not in ('approved','published') or is_demo or reviewed_at is not null`.
- `version int not null default 1`, `content_hash text not null`.
- `source_id uuid not null references content_sources` (trừ `content_sources`). Chương trình, unit, bài và bài tập lấy `source_id` từ `source` của file chương trình; học liệu lấy từ `source` của file items.
- `created_at`, `updated_at` + trigger `set_updated_at` sẵn có.

Văn bản tiếng Việt dài dùng jsonb bản địa hoá `{"vi": "..."}` với `check (x ? 'vi')`. Văn bản ngôn ngữ đích (từ, câu ví dụ) nằm trong trường kiểu riêng (`text`, `ipa`, `romanization`), không nằm trong map bản địa hoá.

### 3.2 Bảng

| Bảng | Cột chính / ràng buộc |
|---|---|
| `content_sources` | `title`, `author_or_org`, `url`, `license check in ('own','cc_by','cc_by_sa','public_domain','licensed')`, `attribution_required bool` |
| `programs` | `language_code check in ('en','ko')`, `title jsonb`, `description jsonb`, `kind check in ('core','goal')`, `goal_types text[]` (rỗng nếu `core`), `level_from`, `level_to` (FK kép tới `level_reference_hours`), `order_index` |
| `units` | `program_id` FK, `order_index`, `title jsonb`; unique `(program_id, order_index)` |
| `lessons` | `unit_id` FK, `language_code`, `level_code` (FK kép), `order_index`, `title jsonb`, `objectives jsonb` (mảng ≥ 1), `body jsonb` (mảng khối `objective \| explain \| deep_explain \| example \| common_mistake \| summary`), `estimated_minutes int check 1..60`, `skills text[]`, `content_version int generated always as (version) stored`, `published_at`; unique `(unit_id, order_index)`; index một phần `(language_code, level_code) where status = 'published'`; trigger kiểm tra ngôn ngữ khớp chương trình |
| `lesson_prerequisites` | PK `(lesson_id, prerequisite_lesson_id)`, check khác nhau; trigger chặn vòng lặp (CTE đệ quy → `P0001 prerequisite_cycle`) và chặn khác ngôn ngữ (`prerequisite_language_mismatch`) |
| `learning_items` | `language_code`, `item_type check in ('vocab','phrase','grammar_point','hangul')`, `front jsonb`, `back jsonb` (PRD §6.4: IPA/romanization, từ loại, nghĩa tiếng Việt, ví dụ + dịch tự nhiên, lỗi hay nhầm), `level_code`, `difficulty smallint 1..5`, `skill_tags text[]`, `audio_path text null` |
| `lesson_items` | PK `(lesson_id, item_id)`, `position`, `role check in ('introduce','reuse')`; unique một phần `item_id where role = 'introduce'` |
| `exercises` | `lesson_id` FK, `item_id` FK null, `order_index`, `exercise_type check in ('mcq','fill_blank','word_bank','translate','listen')`, `stage check in ('recognition','recall','application')`, `answer_lang check in ('en','ko','vi')`, `prompt jsonb` (công khai), `difficulty smallint 1..5`; unique `(lesson_id, order_index)` |
| `content_private.exercise_keys` | PK `(exercise_id, version)`, `answer_key jsonb not null`, `rubric jsonb not null`, `known_wrong jsonb not null default '[]'`, `explanation jsonb not null` (có `vi`), `display_answer text not null` |
| `content_private.revisions` | `entity_type`, `entity_id`, `version`, `snapshot jsonb`, `content_hash`, `imported_at`, `git_sha`; unique `(entity_type, entity_id, version)` |

### 3.3 Chuyển trạng thái

Trigger trên mọi bảng nội dung chỉ cho phép: `draft → in_review`, `in_review → draft | approved`, `approved → published | draft`, `published → archived`, `archived → draft`. Sửa nội dung một dòng `published` không phải demo bắt buộc tăng `version` và cập nhật `reviewed_at`. Vi phạm → `P0001 invalid_status_transition`.

### 3.4 Phân quyền

- RLS bật trên mọi bảng; `revoke all` khỏi `anon, authenticated`; `grant select` cho `authenticated` trên các bảng `public` ở 3.2.
- Policy select duy nhất: `status = 'published'`; bảng con còn yêu cầu bài cha đã xuất bản (`exists` trên `lessons`), bài yêu cầu unit và chương trình đã xuất bản.
- `content_private`: không có trong `api.schemas` của `config.toml`; `revoke all on schema content_private from public, anon, authenticated`; không policy, không grant.
- Không xoá dòng nội dung; dòng vắng mặt trong bundle bị chuyển `archived`.

### 3.5 RPC nội dung

- `content_private.import_bundle(p_bundle jsonb) returns jsonb` — `security definer`, chỉ `service_role` có execute. Một transaction: upsert theo `key`, so `content_hash`, tăng `version` khi `content_hash` đổi (`lessons.content_version` sinh từ `version`; hash của bài tính trên bài **cùng** bài tập, liên kết học liệu và bài tiên quyết, nên mọi thay đổi ở con đều tăng phiên bản bài), ghi `revisions`, giữ dòng `exercise_keys` cũ, kiểm tra chuyển trạng thái, archive dòng vắng mặt. Trả `{inserted, updated, archived, unchanged}`.
- `public.path_lessons(p_path_id uuid)` — nằm trong migration `lesson_runs` (mục 6), không ở migration nội dung, vì `run_status`/`prerequisites_met` đọc `lesson_runs`. `stable`, `security invoker` (RLS của `learning_paths` bảo đảm quyền sở hữu). Trả bài đã xuất bản, sắp theo chương trình → unit → bài, kèm `lesson_id, unit, program, title, level_code, estimated_minutes, is_demo, prerequisites_met bool, run_status ('not_started'|'in_progress'|'completed')`. Điều kiện: cùng ngôn ngữ; `kind = 'core'` hoặc `goal_type = any(goal_types)`; khoảng `[level_from, level_to]` giao `[current_level, target_level]` theo `ordinal`. Lộ trình không thuộc người gọi → tập rỗng.

## 4. Định dạng nội dung và công cụ nhập

### 4.1 Cấu trúc thư mục

```
content/
  sources.yaml
  en/items/*.yaml
  en/programs/<program>/program.yaml
  en/programs/<program>/units/<nn>-<unit>/unit.yaml
  en/programs/<program>/units/<nn>-<unit>/lessons/<nn>-<lesson>.yaml
  ko/... (giống en)
```

Mỗi file có `schema_version: 1`; file demo có `demo: true` và dòng đầu `# DEMO — chưa kiểm duyệt`. Đáp án viết ngay trong bài tập (`answer`, `rubric`, `known_wrong`, `explanation`); bộ nhập tách chúng sang `content_private`.

### 4.2 Schema dùng chung (`packages/shared/src/content/`)

Zod cho: văn bản bản địa hoá, khối nội dung bài, học liệu, chương trình/unit/bài, và một discriminated union theo `exercise_type` định nghĩa **cả** `prompt` công khai **và** `answer` tương ứng (mục 5.2). Web dùng cùng schema `prompt` (`.strict()`, từ chối mọi trường đáp án).

### 4.3 Script `scripts/content-import.mjs` (`pnpm content:check|build|push`)

- `--check` (không cần DB): zod hợp lệ; `key` duy nhất; bài tiên quyết tồn tại, không vòng lặp, cùng ngôn ngữ; `level_code` hợp lệ cho ngôn ngữ; mỗi bài có đủ khối §6.2 (mục tiêu, giải thích, ví dụ, lỗi thường gặp, tóm tắt) và đủ ba giai đoạn bài tập; mỗi bài tập có đáp án khớp kiểu (vd đáp án mcq là id phương án có thật) và lời giải thích `vi`; mỗi dòng có nguồn có giấy phép; file `demo: true` thì mọi dòng `is_demo`; chuẩn hoá NFC; **mọi đáp án chấp nhận chấm đúng và mọi phương án nhiễu/`known_wrong` chấm sai** theo bộ chuẩn hoá TS.
- `--emit-sql`: ghi `supabase/seed.sql` tất định (`select content_private.import_bundle('<json>'::jsonb);`). Bật `[db.seed]` trong `config.toml`.
- `--apply`: gọi RPC trên Supabase hosted bằng `SUPABASE_SERVICE_ROLE_KEY` (biến môi trường local hoặc secret CI). Không bao giờ là biến `VITE_*`.
- `--emit-sql --check`: CI fail nếu `seed.sql` lệch với `content/`.

### 4.4 CI

- Job web: `pnpm content:check` và `content:build --check`.
- Job database: `db reset` nạp seed → pgTAP chạy trên nội dung demo thật.
- `scripts/check-public-env.mjs` chặn `SERVICE_ROLE` và `GEMINI` trong biến `VITE_*`.
- Workflow `content-publish.yml` (`workflow_dispatch`, environment `production` có người duyệt) chạy `--apply`. Cần secret `SUPABASE_SERVICE_ROLE_KEY` (thêm vào `docs/DEPLOY.md`).

## 5. Bài tập và chấm điểm

### 5.1 Dạng bài

| Loại | Đề công khai | Câu trả lời |
|---|---|---|
| `mcq` | `stem`, `options [{id, text, lang}]` 2–6, `shuffle` | `{option_id}` |
| `fill_blank` | `template` có `{{id}}`, `blanks [{id, width_hint?}]`, `hint_levels?` | `{blanks: {id: text}}` |
| `word_bank` | `instruction`, `tokens [{id, text}]` (gồm từ nhiễu) | `{token_ids: []}` |
| `translate` | `source_text`, `source_lang`, `direction ('vi_to_target'\|'target_to_vi')`, `hint_levels?` | `{text}` ≤ 300 ký tự |
| `listen` | `audio_asset_id \| null`, `fallback_text`, `options` như mcq | `{option_id}` |

Câu trả lời đặc biệt `{give_up: true}` ("Xem đáp án"). Id phương án là chuỗi ngẫu nhiên, không lộ thứ tự đúng; client xáo trộn khi `shuffle`.

`hint_levels` theo PRD §6.3 (dịch đầy đủ → từ khoá → không) chỉ có ở giai đoạn `recognition`; giai đoạn `recall`/`application` không có gợi ý.

### 5.2 Đáp án (server)

- `mcq`/`listen`: `{correct_option_id}`.
- `fill_blank`: `{blanks: {id: accepted[]}}`.
- `word_bank`: `{orders: token_id[][]}`.
- `translate`: `{accepted: string[]}` (tối thiểu 3 biến thể với dịch tự do).
- `rubric`: `{punctuation: 'ignore'|'strict', diacritics: 'strict'|'lenient', ko_spacing: 'strict'|'lenient', typo_tolerance: 0|1, expand_contractions: bool}`.
- `known_wrong`: `[{answer, feedback_vi, error_tag}]`.

### 5.3 Chuẩn hoá (`public.grading_normalize(text, lang, rubric) immutable`, không grant cho client)

1. `normalize(NFC)` (ghép lại jamo rời từ IME iOS).
2. *(Bỏ.)* Không ghép jamo tương thích (U+3131–318E): bài xếp chữ Hangul ghép bằng id token của `word_bank`, không bao giờ từ jamo người học gõ. Bước 1 (NFC) vẫn ghép jamo nối (conjoining).
3. Trim, gộp khoảng trắng, chữ thường.
4. `’‘`´` → `'`, `“”` → `"`.
5. Bỏ dấu câu cuối `. ! ? … 。`; nếu `punctuation = 'ignore'` bỏ mọi dấu câu trừ `'` và `-`.
6. **EN:** nếu `expand_contractions` thì mở rộng bảng cố định (`don't`→`do not`, `can't`→`cannot`, `I'm`→`I am`, …) ở cả hai phía; không mở rộng `'s`.
7. **VI:** đưa vị trí dấu thanh kiểu cũ/mới về một dạng (`hoà`↔`hòa`, `thuỷ`↔`thủy`, `oá/óa`, `uý/úy`).

### 5.4 Kết luận chấm (`public.grade_exercise(key, rubric, known_wrong, response, lang) immutable`)

Theo thứ tự:

1. Khớp sau chuẩn hoá → `correct` (score 1).
2. Khớp `known_wrong` → `incorrect` với `feedback_vi`, `error_tag`.
3. **EN** `typo_tolerance = 1`: đúng một token dài ≥ 5 ký tự lệch Levenshtein ≤ 1 (`fuzzystrmatch`), không phải mạo từ/`be` → `almost` (`typo`). Thiếu/sai `a/an/the` luôn là `incorrect` (`article`).
4. **KO** `ko_spacing = 'lenient'`: khớp khi bỏ mọi khoảng trắng → `almost` (`spacing`). Sai biến thể trợ từ theo patchim (은/는, 이/가, 을/를, 이에요/예요, 와/과, 으로/로 với ngoại lệ ㄹ) → `incorrect` (`particle_allomorph`). Không có dung sai lỗi gõ. Không chấp nhận phiên âm Latinh.
5. **VI** `diacritics = 'lenient'`: khớp sau `unaccent` (xử lý `đ`) → `almost` (`missing_diacritics`).
6. Còn lại → `incorrect`.

`almost` (score 0.8) tính `is_correct = true` và hiển thị "Gần đúng: …".

Theo loại: `mcq`/`listen` so id; `word_bank` so chuỗi token id trong `orders`; `fill_blank` mọi ô phải đạt (kết luận là mức thấp nhất của các ô); `translate` so với từng `accepted`.

### 5.5 Quy tắc hiện đáp án (server bắt buộc)

- Trả lời đúng/gần đúng → trả `display_answer`, `explanation`.
- Sai lần 1 → chỉ trả `feedback_vi`/`error_tag` (nếu khớp `known_wrong`), cho làm lại một lần.
- Sai lần 2 hoặc `give_up` → trả `display_answer`, `explanation`; đánh dấu `revealed`.
- Mọi lượt sau khi đã lộ đáp án có `after_reveal = true`, không tính là bằng chứng đã thuộc.
- Bài sai 2 lần được đưa vào hàng "làm lại" ở cuối bài (PRD §7.5).

### 5.6 Fixtures

`packages/shared/src/content/grading.fixtures.json` (các trường hợp EN/KO/VI: viết tắt, dấu câu, mạo từ, lỗi gõ, khoảng cách tiếng Hàn, trợ từ, jamo, dấu thanh cũ/mới, thiếu dấu). `scripts/sync-grading-fixtures.mjs [--check]` sinh `supabase/tests/grading.test.sql`, theo đúng mẫu `sync-estimate-fixtures.mjs`. Vitest chạy cùng fixtures với `normalize.ts`.

## 6. Dữ liệu học (migration `supabase/migrations/20261014000200_lesson_runs.sql`)

### 6.1 `public.lesson_runs`

`id, user_id, learning_path_id, lesson_id, content_version, cursor smallint, queue jsonb (thứ tự bài tập, gồm hàng làm lại), status check in ('in_progress','completed'), started_at, completed_at, next_review_at, summary_json`. Unique một phần `(user_id, learning_path_id, lesson_id) where status = 'in_progress'`. RLS select-own; không quyền ghi cho client.

### 6.2 `public.attempts`

| Nhóm | Cột |
|---|---|
| Định danh | `id`, `user_id`, `learning_path_id`, `lesson_run_id`, `lesson_id`, `exercise_id`, `exercise_version`, `content_version`, `learning_item_id` |
| Chống trùng | `idempotency_key uuid`, `payload_hash text`; unique `(user_id, idempotency_key)` |
| Kết quả | `response_json`, `normalized_response`, `verdict check in ('correct','almost','incorrect')`, `is_correct`, `score numeric(3,2)`, `error_tags text[]`, `attempt_no smallint`, `revealed bool`, `after_reveal bool`, `gave_up bool`, `feedback_json` |
| Tín hiệu PRD | `stage`, `exercise_type`, `confidence smallint check 1..3 null`, `response_ms int` (kẹp 0–600000), `hint_count smallint` (kẹp 0–3), `modality check in ('audio','text_fallback') null` |
| Thời gian | `client_at`, `created_at`, `synced_late bool` (created_at − client_at > 60 s) |

Index `(user_id, learning_path_id, created_at desc)`, `(lesson_run_id)`. RLS select-own; không quyền ghi cho client.

### 6.3 RPC

| RPC | Hợp đồng |
|---|---|
| `get_lesson(p_lesson_id uuid, p_path_id uuid) → jsonb` | Meta bài, khối nội dung, học liệu, đề bài công khai (không bao giờ có trường đáp án), `content_version`, `is_demo`, và trạng thái run nếu có: `run_id, cursor, queue`, mỗi bài tập đã chấm kèm `verdict` và `feedback_json` đã lưu. Lỗi: `lesson_not_found`, `path_not_found`, `lesson_not_in_path` |
| `start_lesson(p_lesson_id, p_path_id) → jsonb` | Trả run đang dở hoặc tạo mới (khoá dòng `profiles` như spec 1). Lỗi như trên |
| `save_lesson_cursor(p_run_id, p_cursor smallint) → void` | `cursor = greatest(cursor, p_cursor)`. Lỗi `run_not_found`, `run_not_active` |
| `submit_exercise(p_run_id, p_exercise_id, p_exercise_version int, p_idempotency_key uuid, p_response jsonb, p_confidence smallint, p_response_ms int, p_hint_count smallint, p_client_at timestamptz) → jsonb` | Trả `{attempt_id, attempt_no, verdict, is_correct, score, error_tags, feedback_vi, revealed, display_answer?, explanation?, requeued, replayed}`. Khoá run; kiểm tra kiểu câu trả lời (≤ 2 KB); chấm theo `(exercise_id, version)` được gửi lên. Trùng `idempotency_key` + cùng `payload_hash` → trả kết quả đã lưu với `replayed = true`; khác hash → `idempotency_conflict`. Lỗi: `run_not_found`, `run_not_active`, `exercise_not_in_lesson`, `exercise_version_mismatch`, `invalid_response`, `rate_limited` (> 30 lần/10 s) |
| `complete_lesson(p_run_id) → jsonb` | Mọi bài tập trong `queue` đã có kết quả cuối (đúng, gần đúng, hoặc đã lộ đáp án), nếu không → `attempts_incomplete`. Ghi `summary_json` `{accuracy_by_stage, almost_count, confident_wrong, unsure_right}`, `next_review_at` = đầu ngày mai theo múi giờ người học (`learning_user_today` + 1). Gọi lại trên run đã xong trả cùng kết quả |

Tất cả: `security definer`, `set search_path = ''`, `auth.uid()` bắt buộc (`not_authenticated`), revoke khỏi `public, anon`, grant `authenticated`. Mã lỗi thêm vào `apps/web/src/features/lesson-player/error-map.ts` bằng tiếng Việt.

## 7. Web

### 7.1 Điểm vào

- **`/app/hoc-tap`** (trong AppLayout, tab "Học tập"): danh sách unit → bài từ `path_lessons(current_path)`, mỗi bài hiện trạng thái chưa học / đang học / đã xong, số phút, nhãn demo; bài có tiên quyết chưa học hiện "Nên học trước: …" (không khoá). Trạng thái rỗng khi chưa có bài phù hợp lộ trình.
- **Trang chủ:** thẻ "Bài tiếp theo" = bài `in_progress` đầu tiên, nếu không có thì bài `not_started` đầu tiên có `prerequisites_met`; nút "Tiếp tục"/"Bắt đầu".

### 7.2 Trình học bài `/app/hoc-tap/bai/:lessonId`

Ngoài AppLayout (giống onboarding), trong `AppRoute`. Các bước theo mục 1; `?buoc=` phản chiếu `cursor` (nút back đi lùi từng bước nội dung). Thanh tiến độ `role="progressbar"` ("Bước 4/9 · Câu 3/8"). Nút thoát mở sheet "Tiến độ đã được lưu".

Thư mục:

- `apps/web/src/features/lesson-player/`: `service.ts`, `error-map.ts`, `outbox.ts`, `useLessonRun.ts` (reducer thuần `playerMachine.ts`: bước, hàng bài tập, hàng làm lại, gộp outbox khi tiếp tục), `usePathLessons.ts`.
- `apps/web/src/components/exercise/`: `ExerciseFrame`, `McqExercise`, `FillBlankExercise`, `WordBankExercise`, `TranslateExercise`, `ListenExercise`, `AnswerInput`, `ConfidenceChips`, `FeedbackPanel`, `PendingSyncBadge`, `DemoBadge`.
- `apps/web/src/routes/app/lesson/`: `LessonPage`, `LessonProgress`, `StepObjective`, `StepExplain`, `StepExamples`, `StepMistake`, `StepSummary`, `StepNextReview`, `ExitSheet`.
- `apps/web/src/routes/app/learn/`: `LearnPage` (danh sách bài), `apps/web/src/routes/app/home/NextLessonCard.tsx`.

### 7.3 Tương tác

- Giai đoạn `recognition`: một nút "Kiểm tra". Giai đoạn `recall`/`application`: ba nút "Đoán" / "Hơi chắc" / "Chắc chắn" vừa chọn mức tự tin vừa nộp bài.
- `mcq`: `role="radiogroup"`, phím mũi tên, phím 1–6.
- `word_bank`: chạm để đặt/bỏ thẻ (nút ≥ 44px, đọc vị trí cho trình đọc màn hình); không cần kéo thả.
- `AnswerInput`: `lang` = ngôn ngữ trả lời, `autocapitalize="off" autocorrect="off" spellcheck={false} enterkeyhint="done"`, cỡ chữ ≥ 16px; Enter chỉ nộp khi `!isComposing && keyCode !== 229`; nộp chờ `compositionend` (dự phòng 80 ms).
- Phản hồi: biểu tượng ✓/≈/✗ + chữ "Chính xác" / "Gần đúng" / "Chưa đúng" + `aria-live="polite"`; focus chuyển tới tiêu đề phản hồi; với mcq ghi "Bạn chọn" và "Đáp án đúng". Không mang nghĩa chỉ bằng màu.
- Thanh hành động dính đáy, `pb-safe`, không bị bàn phím che (`visualViewport`). Chữ bài học 17–18px.
- Giảm chuyển động: không rung, không pháo giấy, chỉ đổi độ mờ.

### 7.4 Offline (PRD §17.2)

- `idempotency_key = crypto.randomUUID()` tạo lúc bấm nộp; mọi lần gửi lại dùng lại key.
- Gửi lỗi mạng/timeout → vào outbox `localStorage['linguo-outbox-v1:<userId>']` (qua `lib/storage.ts`, kiểm tra zod, tối đa 200 mục / 7 ngày). Hiện `PendingSyncBadge` "Đang chờ đồng bộ — sẽ chấm khi có mạng"; không bao giờ hiện kết luận chưa được server xác nhận; người học làm tiếp được.
- Flush theo FIFO khi `online`, `visibilitychange`, mở app; backoff 1/2/4… s có jitter, tối đa 60 s; khoá giữa các tab bằng `BroadcastChannel`/`navigator.locks` khi có.
- `complete_lesson` bị chặn cho tới khi outbox rỗng. Đăng xuất khi còn mục chờ → cảnh báo.
- Payload `get_lesson` của bài đang học (chỉ chữ) được lưu để mở lại khi offline.

## 8. Nội dung demo

Nguồn: "Linguo tự soạn — demo, chưa kiểm duyệt" (`license: own`).

- **EN — chương trình "Nền tảng tiếng Anh" (`core`, pre_a1→a1), unit "Chào hỏi & giới thiệu":** "Xin chào!", "Tôi là…" (be: am/is/are, a/an trước nghề nghiệp), "Bảng chữ cái & đánh vần tên".
- **KO — chương trình "Hangul và giao tiếp nền tảng" (`core`, hangul→topik1), unit "Bảng chữ Hangul":** nguyên âm cơ bản (ㅏㅓㅗㅜㅡㅣㅐㅔ, ㅇ câm, vị trí nguyên âm dọc/ngang), phụ âm cơ bản, phụ âm bật hơi/căng và nguyên âm ghép.
- Mỗi bài ~8 bài tập, đủ ba giai đoạn; toàn bộ đủ 5 dạng; có ca dịch nhiều biến thể, `known_wrong` cho lỗi người Việt hay gặp (thiếu `be`, sai `a/an`, 어/오, 으/우).
- Hướng dẫn viết: giải thích ≤ 3 câu mỗi ý, xưng "bạn", so sánh với tiếng Việt, thuật ngữ đơn giản cho người mới; tiếng Việt đủ dấu NFC; tiếng Hàn chuẩn Seoul, 해요체; phiên âm Latinh chỉ hỗ trợ, không bao giờ là đáp án.
- Checklist người duyệt nằm trong `content/README.md` (nguồn gốc, độ chính xác, đúng bậc, đáp án duy nhất hoặc liệt kê đủ biến thể, lời giải thích nói được "vì sao").

## 9. Kiểm thử

- **Vitest (shared):** schema từng dạng bài (đề công khai từ chối trường đáp án), `normalize.ts` theo fixtures (gồm NFC ghép jamo nối).
- **Vitest (scripts):** `content-import --check` (bài thiếu khối, vòng lặp tiên quyết, đáp án không khớp kiểu, file demo thiếu cờ), `--emit-sql` tất định.
- **Vitest (web):** `playerMachine` (tiếp tục, hàng làm lại), outbox (thứ tự, chống trùng, giới hạn, dữ liệu hỏng, khoá theo user), `AnswerInput` IME, từng dạng bài (bàn phím, `aria-live`), `LearnPage`, `NextLessonCard`, nhãn demo.
- **pgTAP:**
  - `anon`/`authenticated` không có quyền trên schema `content_private` (`has_schema_privilege` false, select → 42501); không hàm nào cấp cho `authenticated` trả cột đáp án; JSON của `get_lesson`/`start_lesson` không chứa `answer_key`, `accepted`, `correct_option_id`, `explanation`, `display_answer` (kiểm tra đệ quy).
  - Chỉ thấy nội dung `published`; bài cha bị archive ẩn bài tập.
  - Chuyển trạng thái, chặn vòng lặp tiên quyết, `import_bundle` nhập lại idempotent và tăng phiên bản khi đổi.
  - Chấm theo fixtures; quy tắc hiện đáp án (lần 1, lần 2, bỏ cuộc); chống trùng (replay, conflict); `exercise_version_mismatch`; `rate_limited`; `attempts_incomplete`; người dùng A/B cách ly (run, attempts, RPC); `path_lessons` lọc đúng ngôn ngữ/mục tiêu/bậc.
- **Playwright (mock Supabase, 6 thiết bị):** học trọn bài EN và KO; tải lại giữa chừng tiếp tục đúng bước kèm phản hồi; `context.setOffline(true)` → nhãn chờ → có mạng → có kết luận; bấm đúp chỉ một request; chỉ dùng bàn phím; axe sáng/tối; không cuộn ngang; thanh hành động nằm trong viewport; nhãn demo hiển thị. Tiếng Hàn qua CDP `Input.imeSetComposition` (Chromium).
- **Thủ công (`docs/MOBILE-QA.md`):** gõ tiếng Hàn trên bàn phím iOS, Gboard, Samsung Keyboard; Telex/VNI; VoiceOver, TalkBack.

## 10. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Dịch tự do bị chấm sai dù đúng | Nhiều biến thể, `known_wrong`, giai đoạn dịch ngắn; báo đáp án đúng (spec 7), AI kiểm tra (spec 5) |
| Bộ chuẩn hoá TS và SQL lệch nhau | Fixtures chung + `--check` trong CI |
| Lộ đáp án qua view/hàm mới | Schema không mở qua API + pgTAP kiểm tra quyền và JSON trả về |
| Repo public → đáp án demo công khai | Chấp nhận cho demo; nội dung thật ở repo private |
| Nhầm demo với nội dung đã duyệt | Nhãn cố định, cờ `is_demo` + ràng buộc DB |
| IME trên Samsung Keyboard | QA thủ công |
| localStorage mất (iOS private mode) | Outbox chỉ là tầng tạm; server là nguồn thật |

## 11. Chia việc

Đợt 1 (song song, theo hợp đồng ở mục 3–7):

| # | Việc | Phụ thuộc |
|---|---|---|
| A1 | `packages/shared/src/content/`: zod nội dung + bài tập + câu trả lời, `normalize.ts`, `grading.fixtures.json`, unit test | — |
| A2 | Migration nội dung (3.1–3.5), `content_private`, triggers, RLS/grants, `import_bundle`, `config.toml`, pgTAP nội dung + không lộ đáp án | — |
| A3 | Migration `lesson_runs`/`attempts`, `grading_normalize`, `grade_exercise`, RPC mục 6.3, `path_lessons`, `sync-grading-fixtures.mjs`, pgTAP | fixtures A1, bảng A2 |
| A4 | `scripts/content-import.mjs`, script `pnpm content:*`, CI, `content-publish.yml`, `check-public-env`, `docs/DEPLOY.md` | schema A1 |
| A5 | YAML demo (mục 8) + `content/README.md` | schema A1 |
| A6 | Tầng dữ liệu web: `service`, `error-map`, `outbox`, `playerMachine`, `useLessonRun`, `usePathLessons` | hợp đồng 6.3 |
| A7 | Component bài tập (7.2–7.3) | schema A1 |
| A8 | Khung trình học, các bước nội dung, `LearnPage`, `NextLessonCard`, router | A6, A7 (mock) |

Đợt 2: tích hợp, sinh lại `database.types.ts`, E2E + axe, `docs/MOBILE-QA.md`, sửa link PRD trong spec 1.
