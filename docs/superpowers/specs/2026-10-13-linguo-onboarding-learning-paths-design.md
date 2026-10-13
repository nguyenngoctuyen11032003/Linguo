# Linguo — Spec 1: Onboarding và lộ trình học

**Ngày:** 2026-10-13
**Trạng thái:** Đã duyệt thiết kế, chờ review văn bản
**Nguồn yêu cầu:** [Dac_ta_LexiPath_English_Korean.md](./Dac_ta_LexiPath_English_Korean.md) mục 2.1E, 4.1, 4.2, 5.1, 5.2, 14, 14.1, 20.1
**Nền tảng:** [Spec 0 — Nền móng](./2026-10-13-linguo-foundation-design.md) (đã merge vào `main`)

---

## 1. Mục tiêu

Người dùng đã đăng nhập chọn ngôn ngữ (Anh/Hàn), điểm xuất phát, trình độ hiện tại, mục tiêu, thời gian học mỗi ngày và hạn (tùy chọn); hệ thống tạo **lộ trình học** (`learning_path`) với **ước lượng thời gian có giả định rõ ràng**. Người dùng có thể có một lộ trình cho mỗi ngôn ngữ, chọn một ngôn ngữ đang học, chuyển đổi không mất dữ liệu, sửa kế hoạch, tạm dừng hoặc lưu trữ lộ trình.

**Ngoài phạm vi:** bài kiểm tra đầu vào (spec 4 — ở đây chỉ tự đánh giá), kế hoạch phiên học theo tuần (spec 6), nội dung bài học (spec 2).

## 2. Quyết định đã chốt

| Chủ đề | Quyết định |
|---|---|
| Ước lượng thời gian | Bảng giờ tham chiếu theo bậc lưu trong DB (có nguồn, cờ `reviewed`); khoảng ±; hiển thị giả định |
| Nhiều ngôn ngữ | Tối đa 1 lộ trình chưa lưu trữ cho mỗi ngôn ngữ; đúng 1 "ngôn ngữ đang học" (`profiles.current_learning_path_id`), chuyển qua LanguagePill |
| Ghi dữ liệu | Wizard giữ bản nháp ở client; ghi qua Postgres RPC `security definer` (nguyên tử); client không có quyền ghi trực tiếp |
| Trình độ ban đầu | Tự đánh giá; `skill_estimates.confidence = 'self_reported'`, UI ghi "chưa đủ dữ liệu" |
| Tiếng Hàn | Bật `LANGUAGES.ko.available = true` |

## 3. Dữ liệu (migration `supabase/migrations/<ts>_learning_paths.sql`)

### 3.1 `public.level_reference_hours`

| Cột | Kiểu |
|---|---|
| `language_code` | text, check in ('en','ko') |
| `level_code` | text |
| `ordinal` | smallint (thứ tự tăng dần trong ngôn ngữ) |
| `cumulative_hours` | integer ≥ 0 |
| `source` | text |
| `reviewed` | boolean default false |

Khóa chính `(language_code, level_code)`; unique `(language_code, ordinal)`.

Seed (đánh dấu `reviewed = false`):

| Ngôn ngữ | Bậc → giờ cộng dồn | Nguồn |
|---|---|---|
| en | pre_a1 0 · a1 90 · a2 190 · b1 375 · b2 575 · c1 775 · c2 1100 | Cambridge English — guided learning hours (giá trị giữa khoảng) |
| ko | hangul 0 · topik1 120 · topik2 300 · topik3 650 · topik4 1000 · topik5 1500 · topik6 2200 | Ước lượng tham khảo từ FSI (ngôn ngữ nhóm IV), chưa kiểm duyệt |

GRANT: `select` cho `anon`, `authenticated`; không có quyền ghi.

### 3.2 `public.learning_paths`

| Cột | Ghi chú |
|---|---|
| `id` uuid pk default `gen_random_uuid()` | |
| `user_id` uuid not null → `auth.users` on delete cascade | |
| `language_code` text check in ('en','ko') | |
| `start_point` text check in ('new','some','rusty','confident','unsure') | |
| `goal_type` text | EN: `foundation`, `daily_communication`, `work_it`, `reading_docs`, `cefr`; KO: `hangul_basics`, `communication`, `topik_i`, `topik_ii`, `skill_focus`. Check theo cặp ngôn ngữ–mục tiêu |
| `current_level` text, `target_level` text | FK tổng hợp `(language_code, level)` → `level_reference_hours` |
| `weekly_minutes` smallint[7] | Thứ Hai → Chủ nhật; mỗi phần tử 0–720; tổng > 0 |
| `target_date` date null | |
| `status` text check in ('active','paused','completed','archived') default 'active' | |
| `estimate` jsonb not null | `{hours_needed, weeks_min, weeks_mid, weeks_max, feasibility, suggested_minutes_per_day, suggested_date, assumptions}` |
| `created_at`, `updated_at` timestamptz | trigger `set_updated_at` (đã có) |

Ràng buộc: `target_level` có `ordinal` > `current_level`; unique index một phần `(user_id, language_code) where status <> 'archived'`.

### 3.3 `public.skill_estimates`

`id`, `learning_path_id` → `learning_paths` on delete cascade, `skill` (6 kỹ năng của `SKILLS`), `level_code`, `confidence` text check in ('self_reported','low','medium','high'), `sample_size` int default 0, `source` text check in ('self_report','diagnostic','assessment'), `assessed_at` timestamptz. Unique `(learning_path_id, skill, source)`.

### 3.4 `public.profiles.current_learning_path_id`

uuid null → `learning_paths(id)` on delete set null. Thêm vào column-level GRANT? **Không** — chỉ RPC cập nhật cột này.

### 3.5 Quyền và RLS

- `learning_paths`, `skill_estimates`: RLS bật; policy `select` cho chủ sở hữu (`skill_estimates` qua `exists` trên `learning_paths`). `revoke all … from anon, authenticated; grant select … to authenticated`. Không có policy/quyền insert/update/delete.
- Mọi ghi đi qua RPC (mục 4).

## 4. RPC (Postgres functions)

Tất cả: `language plpgsql`, `security definer`, `set search_path = ''`, dùng `auth.uid()` (raise `42501` nếu null), `revoke execute … from public, anon; grant execute … to authenticated`. Lỗi nghiệp vụ dùng `raise exception using errcode = 'P0001', message = '<code>'` với các mã:

`not_authenticated`, `path_exists_for_language`, `invalid_language`, `invalid_goal_for_language`, `invalid_level`, `target_not_above_current`, `invalid_schedule`, `target_date_in_past`, `target_date_too_far`, `invalid_start_point`, `target_not_allowed_for_goal`, `path_not_found`, `invalid_status_transition`, và `invalid_date` (chỉ `estimate_learning_path`, khi có `p_target_date` nhưng thiếu `p_today`).

`create_learning_path`, `set_current_learning_path` và `set_learning_path_status` khoá hàng `profiles` của user (`for update`) ngay sau kiểm tra đăng nhập để tuần tự hoá các thay đổi path hiện tại.

| Hàm | Hành vi |
|---|---|
| `create_learning_path(p_language text, p_start_point text, p_goal_type text, p_current_level text, p_target_level text, p_weekly_minutes smallint[], p_target_date date default null)` returns `learning_paths` | Validate; tính `estimate` bằng `public.estimate_learning_path(...)`; insert path; insert 6 `skill_estimates` (`level_code = current_level`, `self_reported`, `self_report`); đặt `profiles.current_learning_path_id` = path mới |
| `set_current_learning_path(p_id uuid)` returns void | Path phải thuộc user và `status <> 'archived'` |
| `update_learning_path_plan(p_id uuid, p_goal_type text, p_target_level text, p_weekly_minutes smallint[], p_target_date date default null)` returns `learning_paths` | Validate như trên; tính lại `estimate`. Bỏ trống `p_target_date` (null) = xoá hạn chót (không có deadline) |
| `set_learning_path_status(p_id uuid, p_status text)` returns `learning_paths` | Chuyển hợp lệ: active↔paused, active/paused/completed→archived, active→completed. Lưu trữ path đang là "current" → chuyển current sang path còn lại (nếu có) hoặc null |
| `estimate_learning_path(p_language, p_current_level, p_target_level, p_weekly_minutes, p_target_date, p_today date)` returns jsonb | `stable`, `security invoker`; thuần tính toán (mục 5); grant cho `authenticated` |

Giới hạn: `target_date` trong `[today, today + 3650 ngày]` (theo `profiles.timezone`).

## 5. Thuật toán ước lượng

Cùng một thuật toán ở `packages/shared/src/learning/estimate.ts` (hiển thị tức thì trên UI) và `estimate_learning_path` (giá trị lưu chính thức). Cả hai được kiểm bằng **cùng một file fixtures** `packages/shared/src/learning/estimate.fixtures.json`.

```
hours_needed = cum(target) − cum(current)
weekly = sum(weekly_minutes)
weeks_mid = ceil(hours_needed × 60 / weekly)
weeks_min = ceil(weeks_mid × 0.8); weeks_max = ceil(weeks_mid × 1.3)
nếu không có target_date: feasibility = 'no_deadline'
ngược lại weeks_available = floor((target_date − today) / 7):
  weeks_available ≥ weeks_max  → 'feasible'
  weeks_available ≥ weeks_mid  → 'tight'
  còn lại                      → 'needs_more_time'
     suggested_minutes_per_day = ceil(hours_needed × 60 / (max(weeks_available,1) × active_days))
       (active_days = số ngày có phút > 0), giới hạn 720
     suggested_date = today + weeks_mid × 7
assumptions = { weekly_minutes: weekly, hours_needed, reference_reviewed: bool, multiplier_range: [0.8, 1.3] }
```

UI luôn ghi "ước lượng", hiển thị giả định và nhãn "số giờ tham chiếu chưa kiểm duyệt" khi `reference_reviewed = false`.

## 6. Luồng và màn hình

### 6.1 Điểm vào
- `/app` (HomePage): nếu `LearningPathsProvider` đã tải xong và danh sách rỗng → `<Navigate to="/app/bat-dau" replace>`.
- Nút "Tạo lộ trình" ở Trang chủ bật và dẫn tới `/app/bat-dau`.
- LanguagePill: mục "+ Thêm ngôn ngữ" → `/app/bat-dau?lang=<code>` khi còn ngôn ngữ chưa có lộ trình.

### 6.2 Wizard `/app/bat-dau` (6 bước)
Chung: chỉ báo tiến độ là một thanh (`role="progressbar"`, chuyển 200ms, tôn trọng giảm chuyển động); nút "Tiếp tục" cố định đáy có `pb-safe`; nút "Quay lại"; tiêu đề `h1` mỗi bước và focus chuyển vào tiêu đề khi đổi bước; bản nháp `localStorage['linguo-onboarding-draft']` dạng `{ version: 1, step, data }`, kiểm bằng zod — sai/hỏng → xoá, về bước 1, toast thông báo; xoá bản nháp khi tạo thành công.
Bước hiện tại nằm trên URL qua tham số `buoc` (`?buoc=<n>`): nút Back của thiết bị/trình duyệt chuyển giữa các bước. `?lang=<code>` với ngôn ngữ còn khả dụng (chưa có lộ trình) bắt đầu một bản nháp mới ở bước 2 (đã chọn ngôn ngữ). Bản nháp khôi phục từ `localStorage` luôn được kiểm lại (zod và các ràng buộc theo ngôn ngữ/bậc/lịch) trước khi dùng.

1. **Ngôn ngữ** — 2 thẻ "Tiếng Anh · English" / "Tiếng Hàn · 한국어" (`lang` cho chữ Hàn); thẻ đã có lộ trình bị khóa với nhãn "Đã có lộ trình". `?lang=` chọn sẵn.
2. **Điểm xuất phát** — 5 lựa chọn (PRD 4.1 bước 2); "Chưa chắc" kèm ghi chú bài kiểm tra đầu vào sắp có.
3. **Trình độ hiện tại** — danh sách bậc từ `level_reference_hours` với mô tả tiếng Việt (`levels.ts`). Bỏ qua khi `start_point = 'new'` (gán `pre_a1`/`hangul`). Mặc định gợi ý `a1`/`topik1` khi `unsure`.
4. **Mục tiêu** — loại mục tiêu theo ngôn ngữ, rồi bậc đích (> hiện tại). TOPIK I chỉ cấp 1–2, TOPIK II cấp 3–6. Bậc gợi ý mặc định theo mục tiêu (`levels.ts`).
5. **Thời gian** — preset 15 / 30 / 60 / 120 phút/ngày (7 ngày) hoặc "Tùy chỉnh từng ngày" (7 ô số, 0 = nghỉ, tổng > 0); hạn: không / ngày cụ thể / số tuần hoặc tháng (quy ra ngày); không cho ngày quá khứ.
6. **Xem lại** — tóm tắt; ước lượng "khoảng X–Y tuần" (`CountUp`), huy hiệu khả thi (icon + chữ + màu), danh sách giả định; nếu `tight`/`needs_more_time`: nút "Dùng N phút/ngày" (cập nhật bước 5) và "Dời ngày mục tiêu sang <ngày>". Nút "Tạo lộ trình" gọi `create_learning_path`; thành công → hiệu ứng ăn mừng (RouteLine vẽ trọn, đếm số tuần) → `/app`.

### 6.3 Sau khi tạo
- **Trang chủ** — `PathSummaryCard`: ngôn ngữ, bậc hiện tại → mục tiêu, ước lượng + khả thi, phút hôm nay theo lịch (thứ trong tuần theo `profiles.timezone`), "Kỹ năng: chưa đủ dữ liệu"; nút "Bắt đầu phiên học" disabled + "Sắp ra mắt". Lộ trình `paused` hiển thị nhãn "Đang tạm dừng" + nút "Tiếp tục".
- **LanguagePill** — nhận `paths` và `currentId` qua props; liệt kê lộ trình chưa lưu trữ (chọn → `set_current_learning_path`, cập nhật provider); "+ Thêm ngôn ngữ"; không còn nhãn "Sắp ra mắt" cho KO.
- **Cảnh báo dàn trải** — khi có ≥ 2 lộ trình `active` và trung bình phút/ngày của mỗi lộ trình < 15: banner trên Trang chủ "Bạn đang học 2 ngôn ngữ với ít thời gian cho mỗi ngôn ngữ…" (PRD 2.1E).
- **Cài đặt → "Lộ trình học"** — cho mỗi lộ trình: sửa lịch/mục tiêu/hạn (ước lượng tính lại, dùng lại component bước 4–5), Tạm dừng/Tiếp tục, Lưu trữ (dialog xác nhận, nêu rõ lịch sử được giữ).

## 7. Cấu trúc code

```
packages/shared/src/learning/
  levels.ts            mã bậc, nhãn, mô tả, mục tiêu theo ngôn ngữ, bậc gợi ý
  estimate.ts          estimatePath(input, refHours, today) → EstimateResult
  estimate.fixtures.json
  schemas.ts           zod: draft từng bước, tham số RPC
  *.test.ts
packages/shared/src/constants.ts   LANGUAGES.ko.available = true
apps/web/src/features/learning-paths/
  service.ts           listPaths, listReferenceHours, createPath, setCurrent, updatePlan, setStatus
  error-map.ts         mã lỗi RPC → tiếng Việt
  LearningPathsProvider.tsx  { status, paths, current, reload, setCurrent }
  useOnboardingDraft.ts
apps/web/src/routes/app/onboarding/
  OnboardingPage.tsx, StepLanguage.tsx, StepStartPoint.tsx, StepCurrentLevel.tsx,
  StepGoal.tsx, StepSchedule.tsx, StepReview.tsx, OnboardingProgress.tsx
apps/web/src/routes/app/home/PathSummaryCard.tsx, SpreadWarning.tsx
apps/web/src/routes/app/settings/LearningPathsSection.tsx
supabase/migrations/<ts>_learning_paths.sql
supabase/tests/learning_paths.test.sql
```

Các provider (`ProfileProvider > LearningPathsProvider`) nằm trong `routes/app/AppRoute.tsx` (route bọc `/app`), nên `/app/bat-dau` render ngoài `AppLayout` (không có AppBar/thanh điều hướng) nhưng vẫn dùng chung dữ liệu. Router thêm `/app/bat-dau`. `LanguagePill` đổi API sang props (`paths`, `currentId`, `onSelect`, `onAdd`), AppBar truyền dữ liệu từ provider.

## 8. Xử lý lỗi

| Tình huống | Hành vi |
|---|---|
| Mã lỗi RPC | `error-map.ts` → câu tiếng Việt; lỗi lạ → thông báo chung kèm mã |
| Mất mạng khi xác nhận | Giữ bản nháp và bước; `FormAlert` + "Thử lại"; không báo thành công |
| Bấm tạo nhiều lần | Nút khóa khi gửi; unique index là lớp chặn thứ hai (`path_exists_for_language`) |
| Bản nháp hỏng/khác version | Xoá, về bước 1, toast |
| Không tải được bảng tham chiếu | `ErrorState` + thử lại; không cho qua bước 3 |
| Provider tải lỗi | Trang chủ hiện `ErrorState` + thử lại; không redirect sang onboarding khi đang lỗi |

## 9. Kiểm thử

- **Vitest shared:** `estimatePath` theo fixtures (bậc đầu/cuối, ngày nghỉ, không hạn, 3 mức khả thi, gợi ý phút/ngày và ngày, làm tròn); zod schema (mục tiêu đúng ngôn ngữ, đích > hiện tại, lịch hợp lệ).
- **pgTAP:** RLS A/B; client không insert/update/delete được (42501); mỗi RPC đúng hành vi và mã lỗi; không tạo được lộ trình thứ 2 cùng ngôn ngữ; lưu trữ rồi tạo lại được; `set_current` không trỏ được tới path người khác; lưu trữ path current chuyển current đúng; `estimate_learning_path` khớp từng ca trong `estimate.fixtures.json` (fixtures được chép vào test SQL dưới dạng VALUES bởi script `scripts/sync-estimate-fixtures.mjs`, CI kiểm không lệch).
- **Vitest web:** bản nháp lưu/khôi phục/bỏ bản hỏng; validate từng bước; bỏ qua bước 3 với "mới hoàn toàn"; xác nhận gọi RPC đúng tham số và giữ bản nháp khi lỗi; redirect `/app` → `/app/bat-dau` khi rỗng (và không redirect khi lỗi); LanguagePill chuyển lộ trình; `PathSummaryCard`; cảnh báo dàn trải; Cài đặt sửa kế hoạch/tạm dừng/lưu trữ.
- **Playwright (mock Supabase, mở rộng `fixtures.ts`):** đi trọn wizard trên iPhone SE, Pixel 7, iPhone 15 Pro ngang; không cuộn ngang ở mọi bước; nút "Tiếp tục" không bị home indicator che; input ≥ 16px, vùng chạm ≥ 44px; axe sáng/tối; ảnh chụp 6 bước đính kèm báo cáo.

## 10. Tiêu chí hoàn thành

1. Người dùng mới sau đăng nhập được đưa vào onboarding, tạo lộ trình EN, thấy ước lượng kèm giả định; Trang chủ hiển thị thẻ lộ trình.
2. Thêm lộ trình KO; chuyển EN/KO qua LanguagePill không mất dữ liệu (PRD 20.1).
3. Sửa lịch/mục tiêu → ước lượng tính lại; tạm dừng/tiếp tục/lưu trữ hoạt động; lịch sử còn nguyên.
4. Tải lại trang giữa wizard vẫn ở đúng bước.
5. CI xanh: unit, pgTAP (gồm khớp fixtures SQL ↔ TS), E2E, axe.
6. UI và `docs/` ghi rõ số giờ tham chiếu là ước lượng chưa kiểm duyệt.
