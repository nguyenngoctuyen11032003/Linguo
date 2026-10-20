# Deploy — GitHub Actions + GitHub Pages + Supabase

Không có server riêng. CI/CD chạy trên GitHub; Auth/Database là Supabase hosted.

Sự cố production (backup/khôi phục, rollback, xoay key, Gemini hết quota, checklist ra mắt): [RUNBOOK.md](RUNBOOK.md).

```text
Pull Request ──► CI (.github/workflows/ci.yml)
                  ├─ web:      check-public-env → check-migrations-immutable → lint → content:check → content:build --check → typecheck → unit tests → build → check:bundle → check:bundle-size
                  ├─ secrets:  gitleaks (binary pin sha256) quét toàn bộ lịch sử Git
                  ├─ functions: bản sao hợp đồng AI khớp shared → deno check → deno lint → deno test (Edge Functions)
                  ├─ e2e:      Playwright trên iPhone SE/15 Pro/15 Pro Max/landscape, Pixel 7, Galaxy S9+
                  └─ database: fixtures SQL ↔ TS (ước lượng, chấm bài, FSRS, kiểm tra đầu vào, chấm đề thi) → Supabase local (Docker) → áp mọi migration + seed.sql → db lint → pgTAP (RLS, chấm điểm, bài học) → kiểm types

push main ─────► Deploy (.github/workflows/deploy.yml)
                  verify (= CI) ─┐
                  changes ───────┼─► migrate (khi supabase/migrations đổi; cần bấm duyệt)
                                 ├─► functions (khi supabase/functions đổi)
                                 └─► build (VITE_* từ Variables, base /<repo>/, CSP chèn lúc build) → check:bundle → GitHub Pages

Deploy xanh trên main ─► Smoke (.github/workflows/smoke.yml; cũng chạy hằng ngày): kiểm site và Supabase thật, xem RUNBOOK
```

## Quy tắc an toàn database
- CI chỉ chạy `supabase db push`. Không bao giờ chạy `db reset`, `config push`, `db push --include-seed` với project hosted.
- Mỗi thay đổi schema = một file migration mới (`pnpm exec supabase migration new <ten>`).
- **Không bao giờ sửa migration đã deploy; luôn tạo migration mới.** Supabase chỉ áp mỗi file migration **một lần** (theo tên trong `supabase_migrations.schema_migrations`); sửa file đã áp thì project hosted giữ bản cũ, còn `db reset`/CI dùng bản mới, hai bên lệch nhau mà không ai báo. Đã xảy ra một lần: `20261014000100_content.sql` bị sửa sau khi deploy (thêm `public.import_content_bundle`), phải vá bằng `20261014000600_spec2_sync.sql`.
  - `supabase/migrations-applied.json` ghi sha256 của mọi migration đã deploy. `node scripts/check-migrations-immutable.mjs` (chạy trong CI job web và `pnpm test`) fail khi một file trong danh sách bị sửa, đổi tên hoặc xoá. File migration mới không bị chặn.
  - **Bước tay sau mỗi lần Deploy có `Supabase db push` thành công:** ghi các migration vừa áp vào danh sách rồi commit thẳng lên `main` (repo cá nhân, không mở PR):
    ```bash
    # 1. Liệt kê file migration chưa có trong danh sách (chính là các file vừa được áp)
    for f in supabase/migrations/*.sql; do n=$(basename "$f"); grep -q "\"$n\"" supabase/migrations-applied.json || echo "$n"; done
    # 2. Ghi checksum của chúng (liệt kê mọi file, cách nhau bằng dấu cách)
    node scripts/check-migrations-immutable.mjs --record 20261015000800_answer_integrity.sql
    # 3. Commit
    git add supabase/migrations-applied.json && git commit -m "chore(db): record deployed migration (<ten>)"
    ```
    Danh sách file vừa áp cũng có trong log bước `db push --dry-run` của job `migrate`. `--record` chỉ nhận tên file dạng `^\d{14}_[a-z0-9_]+\.sql$` có trong `supabase/migrations/`, và từ chối ghi đè checksum khác của một file đã có trong danh sách. Chỉ ghi **sau khi** job `migrate` xanh: ghi sớm sẽ khoá một file chưa được áp. Commit này chỉ đổi `supabase/migrations-applied.json` (nằm ngoài thư mục `migrations`), nên Deploy chạy tiếp chỉ build lại site, không áp migration hay deploy function.
  - **Quy tắc đánh số migration mới:** tên file `<14 chữ số>_<ten>.sql` (chữ thường, số, gạch dưới) và số phải **lớn hơn** số của migration cuối cùng trong `supabase/migrations-applied.json`. Supabase CLI từ chối `db push` một migration có số nhỏ hơn migration đã áp trên project (hành vi của Supabase CLI, repo không tự kiểm tra), trong khi CI (`db reset` từ đầu) vẫn xanh vì áp theo thứ tự tên file. Các migration hiện có đã dùng dãy số `20261015…`, nên `supabase migration new` (lấy giờ hiện tại) có thể sinh ra số nhỏ hơn: kiểm tra tên file vừa tạo và đổi tên (khi chưa commit) cho lớn hơn migration cuối, tính cả các file đã có trong `supabase/migrations/` nhưng chưa được ghi vào `supabase/migrations-applied.json` (số của file cuối cộng thêm một bước, ví dụ sau `20261016000800_…` dùng `20261016000900_<ten>.sql`).
  - Lỡ sửa migration đã deploy: hoàn tác file về bản đã deploy, đưa thay đổi vào một migration mới (`create or replace`, `drop … if exists` rồi tạo lại, `revoke`/`grant` tường minh) sao cho cả DB hosted lẫn DB mới tinh đều ra cùng một schema.
- Thiết lập Auth trong `supabase/config.toml` chỉ áp dụng local; Auth hosted cấu hình trên Dashboard.

## Thiết lập một lần
1. **Repo public** trên GitHub (Pages cho repo private cần gói trả phí). Push nhánh `main`.
2. **Settings → Pages → Source: GitHub Actions.**
3. **Settings → Environments → New environment `production`**: bật **Required reviewers** (chọn bạn), Deployment branches = `main`. Thêm secrets:
   - `SUPABASE_ACCESS_TOKEN` — supabase.com → Account → Access Tokens. Đây là token cá nhân, có quyền trên **mọi project** của tài khoản; chỉ đặt trong environment `production` (không đặt ở repo secrets) và thu hồi ngay nếu nghi bị lộ.
   - `SUPABASE_DB_PASSWORD` — mật khẩu database của project
   - `SUPABASE_SERVICE_ROLE_KEY` — Supabase Dashboard → Project Settings → API Keys: **secret key** (`sb_secret_…`) hoặc key `service_role` (legacy JWT). Chỉ dùng cho workflow **Publish content** và **Maintenance**; chỉ có quyền trên project này nhưng bỏ qua RLS, nên chỉ đặt trong environment `production` và thu hồi/đổi ngay nếu nghi bị lộ.
4. **Settings → Secrets and variables → Actions → Variables**:
   - `SUPABASE_PROJECT_ID` — project ref
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_SITE_URL` = `https://nguyenngoctuyen11032003.github.io/Linguo` (phân biệt hoa/thường: `/Linguo`)
   - `VITE_AUTH_GOOGLE_ENABLED` = `true` hoặc `false`
   - `VITE_HERO_VIDEO_URL` (tuỳ chọn)
   - `VITE_VAPID_PUBLIC_KEY` (tuỳ chọn) — khoá công khai VAPID cho thông báo đẩy, xem mục **Nhắc học & Web Push**
   - `VITE_BASE_PATH` (tuỳ chọn) — mặc định `/<tên-repo>/`. Đặt `/` khi dùng tên miền riêng hoặc repo dạng `<user>.github.io`.
5. Supabase **Authentication → URL Configuration** như `docs/SETUP.md` bước 2: Site URL `https://nguyenngoctuyen11032003.github.io/Linguo`; Redirect URLs `https://nguyenngoctuyen11032003.github.io/Linguo/**`, `http://localhost:5173/**`, `http://localhost:4173/**`. Cũng đặt **Minimum password length = 8** ở **Sign In / Providers → Email** (xem `docs/SETUP.md`).

## Tổng hợp secrets và biến
Đối chiếu với `.github/workflows/*.yml`. Ô "Bắt buộc" là bắt buộc để tính năng đó chạy; thiếu thì Deploy/Notify cảnh báo hoặc dừng như mô tả ở từng mục.

| Tên | Loại / nơi đặt | Bắt buộc | Dùng bởi |
|---|---|---|---|
| `SUPABASE_PROJECT_ID` | Variable (repo) | Có | `migrate`, `functions` (Deploy) |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Variable (repo) | Có | build web; còn dùng `VITE_SUPABASE_URL` làm URL cho Publish content, Maintenance, Notify |
| `VITE_SITE_URL` | Variable (repo) | Nên có | build web (`/Linguo`, phân biệt hoa/thường) |
| `VITE_AUTH_GOOGLE_ENABLED` | Variable (repo) | Không (mặc định không bật) | build web |
| `VITE_HERO_VIDEO_URL`, `VITE_BASE_PATH` | Variable (repo) | Không | build web (`VITE_BASE_PATH` mặc định `/<tên-repo>/`) |
| `VITE_VAPID_PUBLIC_KEY` | Variable (repo) | Chỉ khi muốn Web Push | build web và được Deploy đẩy lên Supabase làm `VAPID_PUBLIC_KEY` |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` | Secret, environment `production` | Có | `migrate` (`functions` chỉ cần token) |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret, environment `production` | Có cho Maintenance (và `pnpm content:push` chạy tay) | `maintenance.yml` |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Secret, environment `production` | Có, nếu muốn gia sư AI chạy | đẩy lên Supabase bởi `functions` |
| `GEMINI_DAILY_USER_LIMIT`, `GEMINI_MAX_OUTPUT_TOKENS`, `GEMINI_TIMEOUT_MS` | Secret, environment `production` | Không | như trên; mặc định và giới hạn hợp lệ ở mục Gia sư AI |
| `NOTIFY_CRON_SECRET` | Secret, environment `production` **và** environment `notify` (cùng giá trị) | Có, nếu muốn nhắc học | `functions` đẩy lên Supabase; `notify.yml` đọc từ environment `notify` |
| `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Secret, environment `production` | Chỉ khi muốn Web Push | đẩy lên Supabase bởi `functions` |

Không thuộc workflow nào (chỉ đặt trong shell khi chạy tay `pnpm audio:generate`, mục **Audio bài nghe**): `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, tuỳ chọn `GEMINI_TTS_MODEL`.

Tự Supabase cấp cho Edge Functions, không cần đặt: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Mọi biến `VITE_*` đều đóng gói vào JavaScript công khai: chỉ đặt giá trị công khai (`scripts/check-public-env.mjs` chặn tên và giá trị giống secret). Secret chỉ đẩy lên Supabase khi job `functions` chạy; GitHub secret để trống không xoá giá trị đang có trên Supabase.

## Gia sư AI (Gemini)
Edge Function `ai-tutor` (`verify_jwt = true`) đọc key và model từ **secret của Supabase**, không từ `VITE_*` hay GitHub Variables.

1. Lấy key và chọn model Flash miễn phí như `docs/SETUP.md` bước 7.
2. GitHub → **Settings → Environments → `production` → Secrets** (không đặt ở repo secrets/variables):
   - `GEMINI_API_KEY` — key từ Google AI Studio (bắt buộc)
   - `GEMINI_MODEL` — model id, ví dụ một model `gemini-…-flash` thuộc free tier (bắt buộc)
   - Tuỳ chọn (theo `supabase/functions/ai-tutor/handler.ts`; giá trị không phải số nguyên hoặc ngoài khoảng sẽ bị bỏ qua và dùng mặc định): `GEMINI_DAILY_USER_LIMIT` (mặc định `20`, hợp lệ 1–1000), `GEMINI_MAX_OUTPUT_TOKENS` (mặc định `2048`, hợp lệ 64–8192), `GEMINI_TIMEOUT_MS` (mặc định `20000`, hợp lệ 1–45000)
3. Job `functions` của Deploy chạy bước **Set Edge Function secrets (Gemini)** trước `functions deploy`: chỉ gửi những secret **có giá trị** qua `supabase secrets set --env-file` (giá trị không bao giờ được in ra; secret GitHub bỏ trống không xoá giá trị đang có trên Supabase). `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` do Supabase tự cấp cho Edge Functions.
4. Job `functions` chỉ chạy khi `supabase/functions` đổi. Đổi key/model mà không đổi code: Actions → Deploy → **Run workflow** với `functions = true` (rồi Approve `production`). Hoặc đặt tay từ máy: `pnpm exec supabase secrets set --project-ref <ref> GEMINI_MODEL=<model-id>` (key nên đặt qua GitHub để không lưu vào lịch sử shell).
5. Thiếu `GEMINI_API_KEY`/`GEMINI_MODEL` thì function trả 503 `ai_unavailable` (không trừ lượt) và web hiện phương án dự phòng; phần còn lại của app không bị ảnh hưởng.

## Nhắc học & Web Push
Edge Function `notify-dispatch` (`verify_jwt = false`, spec 10 §3) được workflow **Notify** (`.github/workflows/notify.yml`) gọi mỗi 15 phút. Mỗi lần chạy nó gọi `generate_due_notifications` (tạo thông báo trong app) rồi gửi Web Push tới các thiết bị đã bật. Function chỉ nhận header `Authorization: Bearer <NOTIFY_CRON_SECRET>`; sai hoặc thiếu → 401.

1. **Tạo khoá** (một lần, trên máy):
   ```bash
   openssl rand -hex 32                 # → NOTIFY_CRON_SECRET (tối thiểu 32 ký tự)
   npx web-push generate-vapid-keys     # → Public Key + Private Key (base64url)
   ```
2. GitHub → **Settings → Secrets and variables → Actions → Variables**: `VITE_VAPID_PUBLIC_KEY` = Public Key. Đây là khoá công khai (được đóng gói vào web và cũng được Deploy đẩy lên Supabase làm `VAPID_PUBLIC_KEY`, nên hai phía luôn dùng cùng một cặp). `scripts/check-public-env.mjs` chặn nếu giá trị không giống public key (ví dụ dán nhầm private key).
3. GitHub → **Settings → Environments → `production` → Secrets**:
   - `NOTIFY_CRON_SECRET` — chuỗi ở bước 1
   - `VAPID_PRIVATE_KEY` — Private Key ở bước 1 (**không bao giờ** đặt vào biến `VITE_*`)
   - `VAPID_SUBJECT` — `mailto:<email-của-bạn>` hoặc một URL `https://…`
4. **Settings → Environments → New environment `notify`**: Deployment branches = `main`, **không** bật Required reviewers (cron phải chạy không cần duyệt). Thêm đúng một secret `NOTIFY_CRON_SECRET` (cùng giá trị bước 3). Secret này chỉ dùng để kích hoạt việc gửi nhắc, không đọc/ghi được dữ liệu nào khác. Workflow còn cần repository variable `VITE_SUPABASE_URL` (đã đặt ở mục Thiết lập một lần, bước 4); thiếu secret hoặc variable thì run cảnh báo và thoát 0 mà không gửi gì (`notify.yml`).
5. Job `functions` của Deploy chạy bước **Set Edge Function secrets (reminders)**: đẩy `NOTIFY_CRON_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (chỉ những giá trị có thật, không in ra log). Sau khi thêm/đổi: Actions → Deploy → **Run workflow** với `functions = true`. Đổi `VITE_VAPID_PUBLIC_KEY` cũng cần build lại web (Deploy làm việc đó).
6. Kiểm tra: Actions → Notify → **Run workflow**; log chỉ in `HTTP 200` và số đếm `{generated, pushed, failed, removed}` (không bao giờ in endpoint, khoá hay nội dung thông báo).

Lịch chạy của workflow **Notify**: `cron: '*/15 * * * *'` (mỗi 15 phút, UTC), cộng `workflow_dispatch` để chạy tay (Actions → Notify → **Run workflow**, chỉ trên `main`: job có điều kiện `github.ref == 'refs/heads/main'`). Job dùng concurrency group `notify` (không chạy chồng) và environment `notify`. Tốc độ chạy thực tế của cron do GitHub quyết định, nên một lượt có thể đến muộn hoặc bị bỏ qua: vì vậy nhắc vẫn "đến hạn" trong 60 phút kể từ đầu khung (`REMINDER_RULES.window_minutes` trong `packages/shared/src/notifications/contract.ts`), lượt đến muộn vẫn phát đúng một lần (unique `(user_id, kind, local_day)` + chặn trùng theo khung), và vẫn tôn trọng giờ yên tĩnh. Push gửi lỗi được các lượt sau thử lại trong 4 giờ (`pending_push_notifications`). Nội dung push luôn chung chung (không có tên bài, số thẻ, số phút), chi tiết chỉ nằm trong hộp thông báo trong app. Endpoint push chỉ nhận FCM, Mozilla autopush, WNS và Apple (`is_allowed_push_endpoint`, cả trong RPC lẫn CHECK, và kiểm lại trong `notify-dispatch`; không theo redirect). Các lượt chạy trong giờ 20:00–20:59 UTC còn gọi `purge_notifications` (xoá hộp thông báo quá 90 ngày).

**Xoay khoá VAPID** (chỉ khi private key bị lộ; mọi subscription cũ sẽ không còn dùng được):
1. Tạo cặp mới: `npx web-push generate-vapid-keys`.
2. Cập nhật Variable `VITE_VAPID_PUBLIC_KEY` (Public Key mới) và secret `VAPID_PRIVATE_KEY` trong environment `production`.
3. Actions → Deploy → **Run workflow** với `functions = true`, **Approve**. Lần chạy này đẩy cặp mới lên Supabase (bước *Set Edge Function secrets (reminders)*) **và** build lại web với public key mới. Nếu chỉ đổi một nửa (private key mới nhưng public key cũ, hoặc ngược lại), `notify-dispatch` kiểm tra bằng một chữ ký thử (`isValidVapid` trong `supabase/functions/notify-dispatch/push.ts`), thấy cặp không khớp thì bỏ qua push và vẫn trả 200 (thông báo trong app vẫn tạo).
4. Subscription cũ do push service từ chối: tự bị xoá khi `failure_count` đạt 10 (chỉ các lượt push service trả 401/403, tức từ chối danh tính VAPID của ta, mới được đếm), hoặc ngay khi push service trả 404/410. Người học phải bấm lại "Bật thông báo trên thiết bị này" ở Cài đặt → Nhắc học trên từng thiết bị để tạo subscription mới. Không có cách nào di chuyển subscription cũ sang khoá mới.
5. Kiểm tra bằng Actions → Notify → **Run workflow**: `pushed` tăng lên khi đã có thiết bị đăng ký lại.

Hành vi:
- Thiếu VAPID (hoặc cặp khoá sai/lệch nhau) → vẫn tạo thông báo trong app, bỏ qua push, trả 200 (không lỗi, không đụng tới subscription).
- Thiếu `NOTIFY_CRON_SECRET` trong environment `notify` → workflow cảnh báo và thoát 0 (không gửi mail lỗi mỗi 15 phút).
- Push service trả 404/410 → xoá subscription. 401/403 → `failure_count + 1`, xoá khi đạt 10 (`MAX_PUSH_FAILURES`). Lỗi khác (5xx, 429, mạng) không tính vào `failure_count`; dòng chưa gửi được thử lại ở các lượt sau trong 4 giờ. Thành công → `failure_count = 0`, cập nhật `delivered_push_at`. Endpoint ngoài danh sách cho phép bị bỏ qua cục bộ (không gọi mạng).
- **Xoay VAPID** làm mọi subscription cũ hết hiệu lực (push service từ chối); chúng tự bị xoá sau vài lần thất bại và người học cần bật lại thông báo trên thiết bị. Chỉ xoay khi private key bị lộ.

## Quy trình hằng ngày
1. Tạo nhánh → code → mở PR → CI phải xanh (xem các artifact `playwright-report-1`…`-4`, mỗi shard e2e một artifact, để duyệt ảnh chụp mobile).
2. Merge vào `main` → Deploy tự chạy; bạn **Approve** `production` cho từng job (xem bên dưới). Có migration mới thì sau khi `migrate` xanh nhớ ghi checksum (mục Quy tắc an toàn database).
   - **Những job chờ duyệt** (theo `deploy.yml`, mọi job khai báo `environment: production` đều dừng chờ Required reviewers): `migrate` (khi `supabase/migrations` đổi hoặc chạy tay với `migrate = true`), `functions` (khi `supabase/functions` đổi hoặc chạy tay với `functions = true`) và `build`. Vì vậy mỗi lần push vào `main` cần ít nhất **một** lần duyệt (cho `build`), cộng thêm một lần cho mỗi job `migrate`/`functions` có chạy. Job `pages` dùng environment `github-pages` (không có reviewer). Thứ tự: `verify` (CI) → `migrate` → `functions` và `build` (chạy song song, đều chờ `migrate` xong hoặc bị bỏ qua; `build` không đợi `functions`) → `pages`. Migrate thất bại thì cả `functions` lẫn `build` không chạy; `functions` thất bại không chặn việc đưa web lên.
   - **Lần deploy đầu tiên:** chưa có Edge Function nào thì job `functions` được bỏ qua (job `changes` đặt cờ functions = false khi `supabase/functions` không có `*/index.ts`, kể cả khi chạy tay với `functions = true`).
   - Cổng duyệt của environment chặn ngay từ lúc job bắt đầu, nên người duyệt **chưa thấy** kết quả `db push --dry-run` trước khi bấm. Hãy duyệt dựa trên **SQL migration trong diff của PR** (CI đã áp dụng và test mọi migration trên Supabase local mới tinh).
   - Log `db push --dry-run` chỉ để lưu vết: sau khi duyệt, job in danh sách migration sẽ áp rồi mới chạy `db push --yes`.
   - Một lần push đổi cả migration lẫn Edge Functions sẽ hỏi duyệt **ba lần** (`migrate`, rồi `functions` và `build`, cùng environment `production`).
   - Job `changes` so sánh với commit của lần Deploy **thành công** gần nhất trên `main` (không phải commit trước của lần push), nên migration trong một lần push thất bại/bị thay thế vẫn được áp ở lần sau.
3. Site: `https://nguyenngoctuyen11032003.github.io/Linguo/`.
   - Sau khi Deploy thành công, workflow **Smoke** tự kiểm tra site và Supabase thật (cũng chạy hằng ngày 02:30 UTC). Cần repository variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (và tuỳ chọn `VITE_SITE_URL`); thiếu thì bỏ qua kèm cảnh báo. Chi tiết: `docs/RUNBOOK.md` → *Kiểm tra sau deploy (smoke)*.

**Đưa đợt P2 lên production (các bước tay, theo thứ tự):** đợt này gồm migration `20261017000200_content_audio.sql`, `20261017000400_teacher_tools.sql`, `20261017000500_admin_staff.sql`, `20261018090000_db_hardening.sql`, `20261018130000_japanese.sql` (cùng `20261016000700`, `20261016000800` nếu chưa áp; danh sách ở HANDOFF mục 5).
1. Merge `integrate/p2-batch` vào `main` → Deploy chạy.
2. **Approve** `production` cho `migrate` (xem SQL trong diff), rồi `functions` và `build`.
3. `migrate` xanh → ghi các migration vừa áp bằng `node scripts/check-migrations-immutable.mjs --record <file…>` và commit (mục Quy tắc an toàn database).
4. Actions → **Publish content** → Approve: chương trình ja, kho kiểm tra đầu vào và đề JLPT chỉ nhập được sau khi `20261018130000_japanese.sql` đã áp (mục Xuất bản nội dung).
5. Tạo audio bài nghe từ máy (`pnpm audio:generate`, cần `GEMINI_API_KEY` + `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; mục Audio bài nghe), commit YAML và manifest, rồi chạy lại Publish content. Chưa làm thì bài nghe vẫn dùng giọng máy.
6. Cấp quyền giáo viên đầu tiên: trang **Nhân sự** `/quan-tri/nhan-su` (cần `20261018150000_admin_teachers.sql` đã áp), hoặc SQL vào `public.teacher_profiles` (mục Giáo viên).

## Xuất bản nội dung
Nội dung bài học nằm trong `content/**/*.yaml`. Deploy **không** tự nhập nội dung vào database hosted; việc này chạy tay qua workflow riêng.

1. Sửa YAML → `pnpm content:check` (kiểm tra schema, khoá, bài tiên quyết, đáp án chấm đúng/sai) → `pnpm content:build` (ghi lại `supabase/seed.sql`, dùng cho Supabase local và CI) → commit cả hai. CI fail nếu `seed.sql` lệch với `content/`.
2. Merge vào `main` (migration nội dung, nếu có, phải được Deploy áp trước).
3. Actions → **Publish content** → **Run workflow**, rồi **Approve** environment `production`. Job chạy `pnpm content:check`, rồi `node scripts/content-import.mjs --emit-apply-sql <file>` sinh đúng các câu lệnh của `seed.sql` (kèm `git_sha` của commit và `set statement_timeout = 0`), và `psql --single-transaction` chạy chúng qua kết nối DB trực tiếp (`supabase link` cho URL pooler, mật khẩu `SUPABASE_DB_PASSWORD`; cần secret như job `migrate` của Deploy). Lý do không còn đi qua HTTP (`pnpm content:push`, RPC `public.import_content_bundle`): cổng trước PostgREST cắt request ở khoảng 120 giây và bundle đầy đủ (4 ngôn ngữ, hơn 650 bài) vượt ngưỡng đó (HTTP 520, 2026-10-19). Import vẫn là một transaction và không được chia nhỏ. Nhập lại cùng nội dung không đổi gì; dòng vắng mặt khỏi `content/` bị chuyển `archived` (không xoá). Nếu `content/diagnostic/` và `content/exams/` có dữ liệu, script gửi tiếp kho câu hỏi kiểm tra đầu vào tới `import_diagnostic_content_bundle` và các đề luyện thi tới `import_exam_content_bundle` (theo `scripts/content-import.mjs`).
   - Workflow cũng chạy lại toàn bộ CI (`verify`) trước khi nhập; migration chứa RPC import mới phải đã được áp (nếu không: HTTP 404, xem bảng sự cố).
   - **Quy trình duyệt và xuất bản một đợt nội dung:** (a) trong YAML đặt `status`, `reviewed_by`, `reviewed_at` (nội dung không demo bắt buộc; `approved`/`published` cần cả hai trường duyệt, xem `content/README.md`); (b) `pnpm content:check` và `pnpm content:build`, commit YAML cùng `supabase/seed.sql`; (c) merge, rồi chạy **Publish content**; (d) kiểm tra kết quả `{inserted, updated, …}` và xem lại trên `/quan-tri/noi-dung` (xem mục Quản trị nội dung). Hiện toàn bộ nội dung trong `content/` đã ghi `status: published`; người duyệt là AI do chủ dự án uỷ quyền, chưa có giáo viên bản ngữ (`content/README.md`).
   - Cần secret `SUPABASE_SERVICE_ROLE_KEY` trong environment `production` (bước 3 ở trên). URL lấy từ variable `VITE_SUPABASE_URL` sẵn có (URL project là công khai), truyền vào script dưới tên `SUPABASE_URL`.
   - Không dùng `SUPABASE_ACCESS_TOKEN` (token cá nhân có quyền trên mọi project): token đó chỉ còn dùng cho `supabase db push`/`functions deploy` trong Deploy.
4. Chạy `pnpm content:push` từ máy local chỉ khi thật cần: phải đặt **cả hai** biến môi trường `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` trong shell, không ghi vào file nào được commit (script từ chối chạy nếu thiếu và không bao giờ in key ra). Ví dụ (Git Bash): `SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=sb_secret_… pnpm content:push`.
5. **Không bao giờ** đặt token/khoá server vào biến `VITE_*` (chúng bị đóng gói vào JavaScript công khai). `scripts/check-public-env.mjs` chặn mọi biến `VITE_*` có tên chứa `SERVICE_ROLE`, `GEMINI`, `SECRET`, `ACCESS_TOKEN`…
6. **Tiếng Nhật:** nội dung `content/ja/`, `content/diagnostic/ja/`, `content/exams/ja/` chỉ nhập được sau khi migration `20261018130000_japanese.sql` đã được Deploy áp (trước đó CHECK `en|ko` từ chối dòng `ja`). Thứ tự: Deploy xanh → **Publish content**.

## Audio bài nghe
Audio được tạo **tay từ máy**, không có workflow (gói miễn phí của Gemini TTS giới hạn request/phút và quota ngày). Hợp đồng, cờ và quy trình đầy đủ: [AUDIO.md](AUDIO.md).

1. Migration `20261017000200_content_audio.sql` (bucket `content-audio`, bảng `audio_assets`) phải đã được Deploy áp.
2. Trong shell (không ghi vào file nào được commit, script không in giá trị): `GEMINI_API_KEY` (key Google AI Studio, có thể dùng chung key của gia sư AI), `SUPABASE_URL=https://<ref>.supabase.co`, `SUPABASE_SERVICE_ROLE_KEY` (secret key của project); tuỳ chọn `GEMINI_TTS_MODEL` (mặc định trong script) hoặc cờ `--model`.
3. `pnpm audio:plan -- --lang ko --limit 20` xem trước, rồi `pnpm audio:generate -- --lang ko --limit 15 --rpm 3`; lặp theo từng ngôn ngữ (`en`, `ko`, `ja`) qua nhiều ngày nếu hết quota (429 hết quota ngày dừng cả lần chạy; phần đã tạo được ghi vào manifest ngay).
4. `pnpm content:check && pnpm audio:check && pnpm content:build`, commit `content/`, `supabase/content-audio-manifest.json` và `supabase/seed.sql`, merge, rồi chạy **Publish content** để `audio_asset_id` lên database.

## Quản trị nội dung
Trang `/quan-tri` (spec 11) chỉ mở cho tài khoản có vai trò trong bảng `public.staff_roles`: `editor` (xem nội dung kèm đáp án, xử lý báo lỗi) < `reviewer` (thêm: chuyển trạng thái duyệt) < `admin` (thêm: thống kê, mức dùng AI, nhật ký, cấp vai trò, ép publish khi còn báo lỗi "Đáp án sai"). Người không có vai trò mở `/quan-tri` sẽ thấy trang 404.

**Bootstrap admin đầu tiên** (chỉ làm một lần, sau khi migration `20261015000410_admin.sql` đã được Deploy áp):
1. Người đó đăng nhập Linguo một lần để có tài khoản trong `auth.users`.
2. Supabase Dashboard → project → **SQL Editor** (chạy với quyền `postgres`), thay email rồi chạy:
   ```sql
   insert into public.staff_roles (user_id, role)
   select id, 'admin' from auth.users where email = 'admin@example.com'
   on conflict (user_id) do update set role = excluded.role, granted_at = now();
   ```
   Kiểm tra: `select s.role, u.email from public.staff_roles s join auth.users u on u.id = s.user_id;`
3. Đăng xuất rồi đăng nhập lại (hoặc tải lại trang) → `/quan-tri` hiện ra.

**Cấp/thu hồi vai trò về sau:** admin dùng trang **Nhân sự** (`/quan-tri/nhan-su`, cần migration `20261017000500_admin_staff.sql`): tìm người nhận theo email (khớp chính xác) hoặc user id, chọn vai trò rồi **Cấp vai trò**; đổi vai trò hoặc **Thu hồi** ngay trên dòng của người đó. Người nhận phải đã đăng nhập Linguo ít nhất một lần. Trang gọi RPC `admin_grant_role(p_user_id uuid, p_role text)` (`p_role = null` để thu hồi; vai trò hợp lệ `editor`, `reviewer`, `admin`); mỗi lần cấp/thu hồi, mỗi lần tìm tài khoản và việc xem danh sách (tối đa một dòng mỗi 10 phút) được ghi vào `admin_audit_log` (trang "Nhật ký"). Không thể hạ hay gỡ admin cuối cùng, và admin cuối cùng không xoá được tài khoản của mình (`last_admin_required`): cấp admin cho người khác trước. RPC cần phiên đăng nhập của một admin nên không chạy được từ SQL Editor (ở đó không có `auth.uid()`); SQL như bootstrap ở trên vẫn dùng được khi cần (thu hồi: `delete from public.staff_roles where user_id = '<uuid>';`), nhưng **không** được ghi vào nhật ký và để trống `granted_by`. Không bao giờ cấp vai trò qua `service_role` từ code web.

**Cách đọc các trang quản trị** (menu "Tổng quan", "Nội dung", "Báo lỗi", "Nguồn" cho mọi vai trò; "Thống kê", "Nhật ký", "Nhân sự" chỉ admin; trên điện thoại menu là một hàng cuộn ngang):
- **Tổng quan** (`/quan-tri`): số mục nội dung theo trạng thái, số đã xuất bản, số nội dung demo, số báo lỗi đang mở (mở hoặc đã phân loại) và danh sách "Cần kiểm duyệt".
- **Nội dung** (`/quan-tri/noi-dung`): lọc theo loại, ngôn ngữ, trạng thái, từ khoá. Trang chi tiết có bốn khối: Trạng thái (đổi trạng thái; reviewer trở lên), Xem trước (đúng như người học thấy), Đáp án và giải thích (đáp án đúng, `known_wrong`, rubric; không bao giờ lộ cho người học), Nguồn và giấy phép. Đường chuyển trạng thái hợp lệ: `draft → in_review`; `in_review → approved | draft`; `approved → published | in_review`; `published → archived | in_review`; `archived → draft` (`ADMIN_STATUS_TRANSITIONS`); riêng câu hỏi trong đề thi (`exam_question`) chỉ chuyển được `published → archived`. Chuyển sang `approved`/`published` ghi người thực hiện vào `reviewed_by` và giờ vào `reviewed_at`. Nội dung vẫn sửa trong repo (`content/**/*.yaml`); trang chỉ cho thấy đường dẫn file (`repo_path`) cần sửa.
- **Báo lỗi** (`/quan-tri/bao-loi`): hàng đợi báo lỗi của người học, gộp theo nội dung bị báo; chọn nhiều mục rồi xử lý (`fixed`, `rejected`, `duplicate` là trạng thái cuối, kèm ghi chú). Lý do báo: `wrong_answer`, `unclear`, `typo`, `audio`, `translation`, `offensive`, `other`. Chuyển một mục sang `published` khi còn báo lỗi "Đáp án sai" chưa xử lý bị từ chối (`open_wrong_answer_reports`) trừ khi admin ép (`p_force`).
- **Nguồn** (`/quan-tri/nguon`): các nguồn và giấy phép khai báo trong `content/sources.yaml`.
- **Thống kê** (`/quan-tri/thong-ke`, admin): người dùng hoạt động mỗi ngày, phễu người dùng mới, mức dùng AI (số request theo tác vụ và trạng thái, báo cáo câu trả lời AI theo lý do). Chỉ số tổng hợp, không có id hay email; khoảng thời gian chọn được.
- **Nhật ký** (`/quan-tri/nhat-ky`, admin): các thao tác thay đổi dữ liệu gần đây của quản trị viên (đổi trạng thái, xử lý báo lỗi, cấp/thu hồi vai trò và quyền giáo viên, xem danh sách nhân sự hoặc giáo viên, tìm tài khoản).
- **Nhân sự** (`/quan-tri/nhan-su`, admin): danh sách nhân sự kèm email, vai trò, người cấp và ngày cấp; tìm tài khoản để cấp vai trò hoặc quyền giáo viên; đổi hoặc thu hồi vai trò; danh sách giáo viên (số lớp đang mở) và thu hồi quyền giáo viên (mục Giáo viên).

**Trạng thái duyệt và import nội dung:** reviewer chuyển trạng thái trên trang quản trị (`admin_set_status`, ghi `reviewed_by`/`reviewed_at`). Khi chạy lại **Publish content**, dòng có nội dung không đổi (cùng `content_hash`) chỉ nhận trạng thái từ YAML nếu đó là đúng một bước hợp lệ từ trạng thái hiện tại; nếu không, trạng thái trong database được giữ (migration `20261015000420_import_keep_published.sql`). Vì vậy import không bao giờ hạ một dòng `published` xuống `draft`/`in_review`/`approved`; lưu trữ (`archived`, hoặc xoá khỏi `content/`) vẫn hoạt động. Nội dung đã sửa (hash đổi) luôn nhận trạng thái ghi trong YAML, nên hãy cập nhật YAML theo quyết định duyệt khi sửa nội dung.

## Giáo viên
Hướng dẫn từng bước cho chủ dự án (cấp quyền, tạo lớp, mã mời, giao bài, học viên vào lớp, sự cố): [HUONG-DAN-GIAO-VIEN.md](HUONG-DAN-GIAO-VIEN.md).

Khu `/giao-vien` (công cụ giáo viên, cần migration `20261017000400_teacher_tools.sql`) chỉ mở cho tài khoản có một dòng trong `public.teacher_profiles`. Quyền giáo viên tách khỏi vai trò quản trị (`staff_roles`).

**Cấp quyền trên giao diện (cách nên dùng, có nhật ký):** admin vào **Nhân sự** (`/quan-tri/nhan-su`, cần thêm migration `20261018150000_admin_teachers.sql`). Ô "Email hoặc mã người dùng" tìm tài khoản (người đó phải đăng nhập Linguo ít nhất một lần), thẻ kết quả ghi "Quyền giáo viên: Đã có / Chưa có" và có nút **Cấp quyền giáo viên**. Phần **Giáo viên** bên dưới liệt kê mọi giáo viên kèm email, người cấp, ngày cấp và số lớp đang mở; nút **Thu hồi** hỏi xác nhận trước. Cả hai đi qua `grant_teacher_role` (nhật ký `grant_teacher` / `revoke_teacher`); xem danh sách ghi `list_teachers` tối đa một lần mỗi 10 phút. Thu hồi không xoá lớp: học viên vẫn thấy lớp và bài giao, giáo viên chỉ không mở được `/giao-vien` cho tới khi được cấp lại.

**Cấp quyền bằng SQL** (khi chưa có admin nào, hoặc migration `20261018150000` chưa áp; Supabase Dashboard → SQL Editor, quyền `postgres`), sau khi người đó đã đăng nhập Linguo một lần:
```sql
insert into public.teacher_profiles (user_id)
select id from auth.users where email = 'giaovien@example.com'
on conflict (user_id) do nothing;
```
Kiểm tra: `select t.granted_at, u.email from public.teacher_profiles t join auth.users u on u.id = t.user_id;`. Thu hồi: `delete from public.teacher_profiles where user_id = '<uuid>';` (lớp của giáo viên vẫn còn nhưng họ không mở được `/giao-vien` nữa). Cách này **không** ghi nhật ký và để trống `granted_by`.

**Cấp quyền bằng RPC** (có nhật ký `grant_teacher` / `revoke_teacher`; trang Nhân sự gọi chính RPC này): `grant_teacher_role(p_user_id uuid, p_grant boolean)`, chỉ admin gọi được và cần phiên đăng nhập của admin (như `admin_grant_role`, không chạy được từ SQL Editor), ví dụ qua REST `POST {SUPABASE_URL}/rest/v1/rpc/grant_teacher_role` với access token của admin và body `{"p_user_id": "<uuid>", "p_grant": true}`.

Người được cấp tải lại trang là thấy mục "Lớp học (giáo viên)" trong thanh điều hướng. Học viên vào lớp bằng mã mời hoặc liên kết `/app/lop-hoc/tham-gia?ma=<mã>` do giáo viên tạo.

## Ghim phiên bản GitHub Actions
Mọi action bên thứ ba trong `.github/workflows` được ghim theo **mã commit SHA đầy đủ** kèm phiên bản trong chú thích cuối dòng (ví dụ `uses: actions/checkout@<sha> # v7.0.1`). Các job có secret (`migrate`, `functions`, `build`, xuất bản nội dung, bảo trì, nhắc học) chạy các action này nên không dùng thẻ phiên bản trôi nổi như `@v7`. Dependabot mở PR hằng tuần, gộp bản minor/patch, để cập nhật các mã SHA; bản major đến thành PR riêng. Khi thêm action mới, luôn ghim bằng SHA (kiểm tra SHA đúng là commit của tag: `gh api repos/<owner>/<repo>/commits/<sha>`). Không đổi lại sang thẻ trôi nổi.

## Bảo trì dữ liệu (Maintenance)
Workflow `.github/workflows/maintenance.yml` chạy **hằng ngày** (cron `17 19 * * *` UTC, tức 02:17 giờ Việt Nam) và chạy tay được qua Actions → **Maintenance** → **Run workflow**.

- Job gọi `POST {VITE_SUPABASE_URL}/rest/v1/rpc/purge_expired_data` bằng secret `SUPABASE_SERVICE_ROLE_KEY` của environment `production` (cùng secret với Publish content). RPC này chỉ `service_role` gọi được. Nó xoá:
  - `ai_cache` đã hết hạn;
  - `ai_usage` quá 90 ngày;
  - `ai_quota` quá 60 ngày;
  - `account_export_requests` (đếm giới hạn 5 lần xuất dữ liệu/giờ) quá 1 ngày;
  - `study_sessions` chưa hoàn thành, tạo quá 180 ngày (nếu bảng đã có).

  Kết quả trả về là số dòng đã xoá của từng bảng, in ra log.
- **Đã lên lịch ở nơi khác:** `purge_notifications()` (xoá hộp thư thông báo quá 90 ngày) do Edge Function `notify-dispatch` gọi mỗi đêm (các lượt Notify trong giờ UTC 20), không thuộc Maintenance.
- Bước thứ hai của cùng job gọi `POST {VITE_SUPABASE_URL}/rest/v1/rpc/purge_analytics` (cũng chỉ `service_role` gọi được): xoá `analytics_events` quá 180 ngày (sự kiện sử dụng và báo lỗi kỹ thuật `client_error`) và trả số dòng đã xoá. Bước này chạy cả khi bước `purge_expired_data` lỗi. Con số 180 ngày cũng là cam kết trên trang quyền riêng tư (`apps/web/src/features/account/retention.ts`).
- Key chỉ được ghi vào một file cấu hình curl quyền 0600 rồi xoá ngay. Key không nằm trong argv và không bị in ra log. HTTP khác 2xx thì job fail.
- Job dùng chung concurrency group `supabase-production` với `migrate` (Deploy) và Publish content, nên không bao giờ chạy cùng lúc với migration.
- Environment `production` đang bật **Required reviewers**, nên mỗi lần chạy theo lịch cũng chờ bấm **Approve**. Không duyệt thì run hết hạn sau 30 ngày; dữ liệu chỉ được dọn muộn hơn, không mất gì. Nếu muốn chạy tự động hoàn toàn, tạo một environment riêng (ví dụ `maintenance`, chỉ cho nhánh `main`, không cần reviewer), chỉ chứa `SUPABASE_SERVICE_ROLE_KEY`, rồi đổi `environment:` trong workflow.
- Xoá tài khoản (`delete_my_account`) và xuất dữ liệu (`export_my_data`) chạy trực tiếp từ web. Bảng `account_deletions` chỉ ghi thời điểm và `reason_code`, không lưu user id hay email.

## Xử lý sự cố
| Triệu chứng | Cách xử lý |
|---|---|
| Build báo thiếu `VITE_SUPABASE_URL` | Chưa tạo Variables (bước 4) |
| `migrate` báo `Thiếu SUPABASE_…` | Secrets chưa đặt trong environment `production` |
| Publish content báo `Thiếu SUPABASE_DB_PASSWORD` (hoặc `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`) | Thiếu secret/variable cho `supabase link` và `psql` (cùng bộ với job `migrate` của Deploy) |
| Publish content báo `HTTP 404 … import_content_bundle` | Migration nội dung chưa được Deploy áp lên project hosted |
| Maintenance báo `HTTP 404 … purge_expired_data` | Migration `20261014000910_account_data.sql` chưa được Deploy áp lên project hosted |
| Maintenance báo `HTTP 404 … purge_analytics` | Migration `20261015000110_analytics.sql` chưa được Deploy áp lên project hosted |
| Maintenance báo `HTTP 401`/`403` | `SUPABASE_SERVICE_ROLE_KEY` sai hoặc đã bị xoay vòng; cập nhật secret trong environment `production` |
| Migration chưa được áp | Actions → Deploy → **Run workflow** với `migrate = true` |
| `db push` từ chối vì migration cục bộ có số nhỏ hơn migration đã áp trên project | Đổi tên file mới (chưa deploy) cho số lớn hơn migration cuối trong `supabase/migrations-applied.json` (xem *Quy tắc đánh số migration mới*); không dùng `--include-all` để vượt qua |
| CI báo `check-migrations-immutable` fail | Có file đã deploy bị sửa/đổi tên/xoá: hoàn tác file, đưa thay đổi vào migration mới |
| Actions → Notify chỉ in cảnh báo "Thiếu NOTIFY_CRON_SECRET" rồi xanh | Chưa đặt secret trong environment `notify` (hoặc thiếu `VITE_SUPABASE_URL`); workflow cố ý bỏ qua |
| Gia sư AI luôn "Tạm thời không khả dụng" | Thiếu secret `GEMINI_API_KEY`/`GEMINI_MODEL` trong environment `production`, hoặc chưa chạy lại Deploy với `functions = true` sau khi thêm; kiểm tra model id còn trong free tier |
| Gia sư AI đang chạy rồi bỗng không khả dụng với mọi người | Model hết quota ngày của free tier (breaker mở, thử lại sau); chờ quota reset hoặc đổi `GEMINI_MODEL` rồi chạy lại Deploy với `functions = true` |
| Notify báo `HTTP 401` | `NOTIFY_CRON_SECRET` trong environment `notify` khác giá trị đã đẩy lên Supabase (environment `production`), hoặc ngắn hơn 32 ký tự; đặt lại cả hai rồi chạy Deploy với `functions = true` |
| Notify báo `HTTP 500 generate_failed` | Migration nhắc học (`generate_due_notifications`) chưa được Deploy áp lên project hosted |
| Notify báo `HTTP 404` | Function `notify-dispatch` chưa được deploy: Actions → Deploy → **Run workflow** với `functions = true` |
| Có thông báo trong app nhưng thiết bị không nhận push (`pushed = 0`) | Thiếu/sai `VAPID_*` hoặc `VITE_VAPID_PUBLIC_KEY` khác cặp với `VAPID_PRIVATE_KEY`; kiểm tra log function (`push skipped`) |
| Job `secrets` (gitleaks) báo leak | Secret thật: xoay key ngay theo `docs/RUNBOOK.md` mục 5. Giá trị giả trong test: ghép chuỗi lúc chạy (xem `scripts/check-bundle-secrets.test.mjs`) hoặc, sau khi rà soát, thêm fingerprint vào `.gitleaksignore` |
| `check:bundle-size` fail (CI job `web`) | JS tải đầu vượt ngân sách hoặc một chunk lazy bị import tĩnh: chạy `pnpm build && pnpm check:bundle-size` để xem chunk nào; tìm import tĩnh mới thêm (nhớ `import { m as motion } from 'motion/react'`). Chỉ tăng `BUDGETS` trong `scripts/check-bundle-size.mjs` có lý do trong commit (FEATURES mục 18) |
| Smoke báo đỏ hoặc bỏ qua kèm cảnh báo | Xem `docs/RUNBOOK.md` → *Kiểm tra sau deploy (smoke)*; cần repository variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |
| `check:bundle` fail | Một secret hoặc source map lọt vào `apps/web/dist`: kiểm tra biến `VITE_*`, `build.sourcemap` trong `apps/web/vite.config.ts` |
| Console trình duyệt báo vi phạm Content-Security-Policy | Nguồn mới chưa có trong `apps/web/build/csp.ts`: thêm có chủ đích kèm test (`docs/RUNBOOK.md` mục 7) |
| Pages 404 ở trang chủ | Kiểm tra bước 2 (Source = GitHub Actions) |
| Link email mở sai địa chỉ | Kiểm tra Site URL / Redirect URLs trên Supabase |
| "Hãy mở liên kết trên cùng trình duyệt" | Liên kết PKCE phải mở trên trình duyệt đã gửi yêu cầu |
| App báo lỗi kết nối sau thời gian dài không dùng | Supabase Free tạm dừng project → Restore trong Dashboard |
