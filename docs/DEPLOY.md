# Deploy — GitHub Actions + GitHub Pages + Supabase

Không có server riêng. CI/CD chạy trên GitHub; Auth/Database là Supabase hosted.

Sự cố production (backup/khôi phục, rollback, xoay key, Gemini hết quota, checklist ra mắt): [RUNBOOK.md](RUNBOOK.md).

```text
Pull Request ──► CI (.github/workflows/ci.yml)
                  ├─ web:      check-public-env → check-migrations-immutable → lint → content:check → content:build --check → typecheck → unit tests → build → check:bundle
                  ├─ secrets:  gitleaks (binary pin sha256) quét toàn bộ lịch sử Git
                  ├─ e2e:      Playwright trên iPhone SE/15 Pro/15 Pro Max/landscape, Pixel 7, Galaxy S9+
                  └─ database: fixtures SQL ↔ TS (ước lượng, chấm điểm) → Supabase local (Docker) → áp mọi migration + seed.sql → db lint → pgTAP (RLS, chấm điểm, bài học) → kiểm types

push main ─────► Deploy (.github/workflows/deploy.yml)
                  verify (= CI) ─┐
                  changes ───────┼─► migrate (khi supabase/migrations đổi; cần bấm duyệt)
                                 ├─► functions (khi supabase/functions đổi)
                                 └─► build (VITE_* từ Variables, base /<repo>/, CSP chèn lúc build) → check:bundle → GitHub Pages
```

## Quy tắc an toàn database
- CI chỉ chạy `supabase db push`. Không bao giờ chạy `db reset`, `config push`, `db push --include-seed` với project hosted.
- Mỗi thay đổi schema = một file migration mới (`pnpm exec supabase migration new <ten>`).
- **Không bao giờ sửa migration đã deploy; luôn tạo migration mới.** Supabase chỉ áp mỗi file migration **một lần** (theo tên trong `supabase_migrations.schema_migrations`); sửa file đã áp thì project hosted giữ bản cũ, còn `db reset`/CI dùng bản mới, hai bên lệch nhau mà không ai báo. Đã xảy ra một lần: `20261014000100_content.sql` bị sửa sau khi deploy (thêm `public.import_content_bundle`), phải vá bằng `20261014000600_spec2_sync.sql`.
  - `supabase/migrations-applied.json` ghi sha256 của mọi migration đã deploy. `node scripts/check-migrations-immutable.mjs` (chạy trong CI job web và `pnpm test`) fail khi một file trong danh sách bị sửa, đổi tên hoặc xoá. File migration mới không bị chặn.
  - **Bước tay sau mỗi lần Deploy có `Supabase db push` thành công:** ghi các migration vừa áp vào danh sách rồi commit thẳng lên `main`:
    ```bash
    node scripts/check-migrations-immutable.mjs --record 20261014000600_spec2_sync.sql   # liệt kê mọi file vừa áp
    git add supabase/migrations-applied.json && git commit -m "chore(db): record deployed migrations"
    ```
    Danh sách file vừa áp có trong log bước `db push --dry-run` của job `migrate`. `--record` từ chối ghi đè checksum khác của một file đã có trong danh sách.
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
   - `VITE_BASE_PATH` (tuỳ chọn) — mặc định `/<tên-repo>/`. Đặt `/` khi dùng tên miền riêng hoặc repo dạng `<user>.github.io`.
5. Supabase **Authentication → URL Configuration** như `docs/SETUP.md` bước 2: Site URL `https://nguyenngoctuyen11032003.github.io/Linguo`; Redirect URLs `https://nguyenngoctuyen11032003.github.io/Linguo/**`, `http://localhost:5173/**`, `http://localhost:4173/**`. Cũng đặt **Minimum password length = 8** ở **Sign In / Providers → Email** (xem `docs/SETUP.md`).

## Gia sư AI (Gemini)
Edge Function `ai-tutor` (`verify_jwt = true`) đọc key và model từ **secret của Supabase**, không từ `VITE_*` hay GitHub Variables.

1. Lấy key và chọn model Flash miễn phí như `docs/SETUP.md` bước 7.
2. GitHub → **Settings → Environments → `production` → Secrets** (không đặt ở repo secrets/variables):
   - `GEMINI_API_KEY` — key từ Google AI Studio (bắt buộc)
   - `GEMINI_MODEL` — model id, ví dụ một model `gemini-…-flash` thuộc free tier (bắt buộc)
   - Tuỳ chọn: `GEMINI_DAILY_USER_LIMIT` (mặc định `20`), `GEMINI_MAX_OUTPUT_TOKENS` (`1200`), `GEMINI_TIMEOUT_MS` (`20000`)
3. Job `functions` của Deploy chạy bước **Set Edge Function secrets (Gemini)** trước `functions deploy`: chỉ gửi những secret **có giá trị** qua `supabase secrets set --env-file` (giá trị không bao giờ được in ra; secret GitHub bỏ trống không xoá giá trị đang có trên Supabase). `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` do Supabase tự cấp cho Edge Functions.
4. Job `functions` chỉ chạy khi `supabase/functions` đổi. Đổi key/model mà không đổi code: Actions → Deploy → **Run workflow** với `functions = true` (rồi Approve `production`). Hoặc đặt tay từ máy: `pnpm exec supabase secrets set --project-ref <ref> GEMINI_MODEL=<model-id>` (key nên đặt qua GitHub để không lưu vào lịch sử shell).
5. Thiếu `GEMINI_API_KEY`/`GEMINI_MODEL` thì function trả 503 `ai_unavailable` (không trừ lượt) và web hiện phương án dự phòng; phần còn lại của app không bị ảnh hưởng.

## Quy trình hằng ngày
1. Tạo nhánh → code → mở PR → CI phải xanh (xem artifact `playwright-report` để duyệt ảnh chụp mobile).
2. Merge vào `main` → Deploy tự chạy. Có migration mới thì job `migrate` chờ bạn **Approve** `production`.
   - **Lần deploy đầu tiên** chỉ hỏi duyệt `migrate` một lần: chưa có Edge Function nào nên job `functions` được bỏ qua (job `changes` đặt cờ functions = false khi `supabase/functions` không có `*/index.ts`, kể cả khi chạy tay với `functions = true`).
   - Cổng duyệt của environment chặn ngay từ lúc job bắt đầu, nên người duyệt **chưa thấy** kết quả `db push --dry-run` trước khi bấm. Hãy duyệt dựa trên **SQL migration trong diff của PR** (CI đã áp dụng và test mọi migration trên Supabase local mới tinh).
   - Log `db push --dry-run` chỉ để lưu vết: sau khi duyệt, job in danh sách migration sẽ áp rồi mới chạy `db push --yes`.
   - Một lần push đổi cả migration lẫn Edge Functions sẽ hỏi duyệt **hai lần** (job `migrate` rồi job `functions`, cùng environment `production`).
   - Job `changes` so sánh với commit của lần Deploy **thành công** gần nhất trên `main` (không phải commit trước của lần push), nên migration trong một lần push thất bại/bị thay thế vẫn được áp ở lần sau.
3. Site: `https://nguyenngoctuyen11032003.github.io/Linguo/`.

## Xuất bản nội dung
Nội dung bài học nằm trong `content/**/*.yaml`. Deploy **không** tự nhập nội dung vào database hosted; việc này chạy tay qua workflow riêng.

1. Sửa YAML → `pnpm content:check` (kiểm tra schema, khoá, bài tiên quyết, đáp án chấm đúng/sai) → `pnpm content:build` (ghi lại `supabase/seed.sql`, dùng cho Supabase local và CI) → commit cả hai. CI fail nếu `seed.sql` lệch với `content/`.
2. Merge vào `main` (migration nội dung, nếu có, phải được Deploy áp trước).
3. Actions → **Publish content** → **Run workflow**, rồi **Approve** environment `production`. Job chạy `pnpm content:check` rồi `pnpm content:push`: gửi bundle nội dung tới RPC `public.import_content_bundle` (`POST {SUPABASE_URL}/rest/v1/rpc/import_content_bundle`, chỉ `service_role` được gọi; hàm này chỉ bọc `content_private.import_bundle`, đúng import mà `seed.sql` chạy) và in kết quả `{inserted, updated, archived, unchanged}`. Nhập lại cùng nội dung không đổi gì; dòng vắng mặt khỏi `content/` bị chuyển `archived` (không xoá).
   - Cần secret `SUPABASE_SERVICE_ROLE_KEY` trong environment `production` (bước 3 ở trên). URL lấy từ variable `VITE_SUPABASE_URL` sẵn có (URL project là công khai), truyền vào script dưới tên `SUPABASE_URL`.
   - Không dùng `SUPABASE_ACCESS_TOKEN` (token cá nhân có quyền trên mọi project): token đó chỉ còn dùng cho `supabase db push`/`functions deploy` trong Deploy.
4. Chạy `pnpm content:push` từ máy local chỉ khi thật cần: phải đặt **cả hai** biến môi trường `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` trong shell, không ghi vào file nào được commit (script từ chối chạy nếu thiếu và không bao giờ in key ra). Ví dụ (Git Bash): `SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=sb_secret_… pnpm content:push`.
5. **Không bao giờ** đặt token/khoá server vào biến `VITE_*` (chúng bị đóng gói vào JavaScript công khai). `scripts/check-public-env.mjs` chặn mọi biến `VITE_*` có tên chứa `SERVICE_ROLE`, `GEMINI`, `SECRET`, `ACCESS_TOKEN`…

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

**Cấp/thu hồi vai trò về sau:** admin gọi RPC `admin_grant_role(p_user_id, p_role)` (`p_role = null` để thu hồi); mỗi lần cấp/thu hồi được ghi vào `admin_audit_log` (xem ở trang "Nhật ký"). Thay đổi bằng SQL thủ công **không** được ghi nhật ký, nên chỉ dùng SQL cho lần bootstrap hoặc khi mất hết admin. Không bao giờ cấp vai trò qua `service_role` từ code web.

**Trạng thái duyệt và import nội dung:** reviewer chuyển trạng thái trên trang quản trị (`admin_set_status`, ghi `reviewed_by`/`reviewed_at`). Khi chạy lại **Publish content**, dòng có nội dung không đổi (cùng `content_hash`) chỉ nhận trạng thái từ YAML nếu đó là đúng một bước hợp lệ từ trạng thái hiện tại; nếu không, trạng thái trong database được giữ (migration `20261015000420_import_keep_published.sql`). Vì vậy import không bao giờ hạ một dòng `published` xuống `draft`/`in_review`/`approved`; lưu trữ (`archived`, hoặc xoá khỏi `content/`) vẫn hoạt động. Nội dung đã sửa (hash đổi) luôn nhận trạng thái ghi trong YAML, nên hãy cập nhật YAML theo quyết định duyệt khi sửa nội dung.

## Bảo trì dữ liệu (Maintenance)
Workflow `.github/workflows/maintenance.yml` chạy **hằng ngày** (cron `17 19 * * *` UTC, tức 02:17 giờ Việt Nam) và chạy tay được qua Actions → **Maintenance** → **Run workflow**.

- Job gọi `POST {VITE_SUPABASE_URL}/rest/v1/rpc/purge_expired_data` bằng secret `SUPABASE_SERVICE_ROLE_KEY` của environment `production` (cùng secret với Publish content). RPC này chỉ `service_role` gọi được. Nó xoá:
  - `ai_cache` đã hết hạn;
  - `ai_usage` quá 90 ngày;
  - `ai_quota` quá 60 ngày;
  - `account_export_requests` (đếm giới hạn 5 lần xuất dữ liệu/giờ) quá 1 ngày;
  - `study_sessions` chưa hoàn thành, tạo quá 180 ngày (nếu bảng đã có).

  Kết quả trả về là số dòng đã xoá của từng bảng, in ra log.
- Key chỉ được ghi vào một file cấu hình curl quyền 0600 rồi xoá ngay. Key không nằm trong argv và không bị in ra log. HTTP khác 2xx thì job fail.
- Job dùng chung concurrency group `supabase-production` với `migrate` (Deploy) và Publish content, nên không bao giờ chạy cùng lúc với migration.
- Environment `production` đang bật **Required reviewers**, nên mỗi lần chạy theo lịch cũng chờ bấm **Approve**. Không duyệt thì run hết hạn sau 30 ngày; dữ liệu chỉ được dọn muộn hơn, không mất gì. Nếu muốn chạy tự động hoàn toàn, tạo một environment riêng (ví dụ `maintenance`, chỉ cho nhánh `main`, không cần reviewer), chỉ chứa `SUPABASE_SERVICE_ROLE_KEY`, rồi đổi `environment:` trong workflow.
- Xoá tài khoản (`delete_my_account`) và xuất dữ liệu (`export_my_data`) chạy trực tiếp từ web. Bảng `account_deletions` chỉ ghi thời điểm và `reason_code`, không lưu user id hay email.

## Xử lý sự cố
| Triệu chứng | Cách xử lý |
|---|---|
| Build báo thiếu `VITE_SUPABASE_URL` | Chưa tạo Variables (bước 4) |
| `migrate` báo `Thiếu SUPABASE_…` | Secrets chưa đặt trong environment `production` |
| Publish content báo `--apply needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY` | Thiếu secret `SUPABASE_SERVICE_ROLE_KEY` trong environment `production` hoặc variable `VITE_SUPABASE_URL` |
| Publish content báo `HTTP 404 … import_content_bundle` | Migration nội dung chưa được Deploy áp lên project hosted |
| Maintenance báo `HTTP 404 … purge_expired_data` | Migration `20261014000910_account_data.sql` chưa được Deploy áp lên project hosted |
| Maintenance báo `HTTP 401`/`403` | `SUPABASE_SERVICE_ROLE_KEY` sai hoặc đã bị xoay vòng; cập nhật secret trong environment `production` |
| Migration chưa được áp | Actions → Deploy → **Run workflow** với `migrate = true` |
| Gia sư AI luôn "Tạm thời không khả dụng" | Thiếu secret `GEMINI_API_KEY`/`GEMINI_MODEL` trong environment `production`, hoặc chưa chạy lại Deploy với `functions = true` sau khi thêm; kiểm tra model id còn trong free tier |
| Gia sư AI đang chạy rồi bỗng không khả dụng với mọi người | Model hết quota ngày của free tier (breaker mở, thử lại sau); chờ quota reset hoặc đổi `GEMINI_MODEL` rồi chạy lại Deploy với `functions = true` |
| Job `secrets` (gitleaks) báo leak | Secret thật: xoay key ngay theo `docs/RUNBOOK.md` mục 5. Giá trị giả trong test: ghép chuỗi lúc chạy (xem `scripts/check-bundle-secrets.test.mjs`) hoặc, sau khi rà soát, thêm fingerprint vào `.gitleaksignore` |
| `check:bundle` fail | Một secret hoặc source map lọt vào `apps/web/dist`: kiểm tra biến `VITE_*`, `build.sourcemap` trong `apps/web/vite.config.ts` |
| Console trình duyệt báo vi phạm Content-Security-Policy | Nguồn mới chưa có trong `apps/web/build/csp.ts`: thêm có chủ đích kèm test (`docs/RUNBOOK.md` mục 7) |
| Pages 404 ở trang chủ | Kiểm tra bước 2 (Source = GitHub Actions) |
| Link email mở sai địa chỉ | Kiểm tra Site URL / Redirect URLs trên Supabase |
| "Hãy mở liên kết trên cùng trình duyệt" | Liên kết PKCE phải mở trên trình duyệt đã gửi yêu cầu |
| App báo lỗi kết nối sau thời gian dài không dùng | Supabase Free tạm dừng project → Restore trong Dashboard |
