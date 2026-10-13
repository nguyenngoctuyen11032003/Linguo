# Deploy — GitHub Actions + GitHub Pages + Supabase

Không có server riêng. CI/CD chạy trên GitHub; Auth/Database là Supabase hosted.

```text
Pull Request ──► CI (.github/workflows/ci.yml)
                  ├─ web:      check-public-env → lint → content:check → content:build --check → typecheck → unit tests → build
                  ├─ e2e:      Playwright trên iPhone SE/15 Pro/15 Pro Max/landscape, Pixel 7, Galaxy S9+
                  └─ database: fixtures SQL ↔ TS (ước lượng, chấm điểm) → Supabase local (Docker) → áp mọi migration + seed.sql → db lint → pgTAP (RLS, chấm điểm, bài học) → kiểm types

push main ─────► Deploy (.github/workflows/deploy.yml)
                  verify (= CI) ─┐
                  changes ───────┼─► migrate (khi supabase/migrations đổi; cần bấm duyệt)
                                 ├─► functions (khi supabase/functions đổi)
                                 └─► build (VITE_* từ Variables, base /<repo>/) → GitHub Pages
```

## Quy tắc an toàn database
- CI chỉ chạy `supabase db push`. Không bao giờ chạy `db reset`, `config push`, `db push --include-seed` với project hosted.
- Mỗi thay đổi schema = một file migration mới (`pnpm exec supabase migration new <ten>`). Không sửa migration đã deploy.
- Thiết lập Auth trong `supabase/config.toml` chỉ áp dụng local; Auth hosted cấu hình trên Dashboard.

## Thiết lập một lần
1. **Repo public** trên GitHub (Pages cho repo private cần gói trả phí). Push nhánh `main`.
2. **Settings → Pages → Source: GitHub Actions.**
3. **Settings → Environments → New environment `production`**: bật **Required reviewers** (chọn bạn), Deployment branches = `main`. Thêm secrets:
   - `SUPABASE_ACCESS_TOKEN` — supabase.com → Account → Access Tokens. Đây là token cá nhân, có quyền trên **mọi project** của tài khoản; chỉ đặt trong environment `production` (không đặt ở repo secrets) và thu hồi ngay nếu nghi bị lộ.
   - `SUPABASE_DB_PASSWORD` — mật khẩu database của project
4. **Settings → Secrets and variables → Actions → Variables**:
   - `SUPABASE_PROJECT_ID` — project ref
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_SITE_URL` = `https://nguyenngoctuyen11032003.github.io/Linguo` (phân biệt hoa/thường: `/Linguo`)
   - `VITE_AUTH_GOOGLE_ENABLED` = `true` hoặc `false`
   - `VITE_HERO_VIDEO_URL` (tuỳ chọn)
   - `VITE_BASE_PATH` (tuỳ chọn) — mặc định `/<tên-repo>/`. Đặt `/` khi dùng tên miền riêng hoặc repo dạng `<user>.github.io`.
5. Supabase **Authentication → URL Configuration** như `docs/SETUP.md` bước 2: Site URL `https://nguyenngoctuyen11032003.github.io/Linguo`; Redirect URLs `https://nguyenngoctuyen11032003.github.io/Linguo/**`, `http://localhost:5173/**`, `http://localhost:4173/**`. Cũng đặt **Minimum password length = 8** ở **Sign In / Providers → Email** (xem `docs/SETUP.md`).

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
3. Actions → **Publish content** → **Run workflow**, rồi **Approve** environment `production`. Job chạy `pnpm content:check` rồi `pnpm content:push`: gửi SQL `content_private.import_bundle(...)` qua Supabase Management API (`POST /v1/projects/{ref}/database/query`) và in kết quả `{inserted, updated, archived, unchanged}`. Nhập lại cùng nội dung không đổi gì; dòng vắng mặt khỏi `content/` bị chuyển `archived` (không xoá).
   - Dùng lại secret `SUPABASE_ACCESS_TOKEN` (environment `production`) và variable `SUPABASE_PROJECT_ID` ở trên; không cần secret mới.
4. Chạy `pnpm content:push` từ máy local chỉ khi thật cần: phải đặt **cả hai** biến môi trường `SUPABASE_ACCESS_TOKEN` và `SUPABASE_PROJECT_ID` trong shell (script từ chối chạy nếu thiếu).
5. **Không bao giờ** đặt token/khoá server vào biến `VITE_*` (chúng bị đóng gói vào JavaScript công khai). `scripts/check-public-env.mjs` chặn mọi biến `VITE_*` có tên chứa `SERVICE_ROLE`, `GEMINI`, `SECRET`, `ACCESS_TOKEN`…

## Xử lý sự cố
| Triệu chứng | Cách xử lý |
|---|---|
| Build báo thiếu `VITE_SUPABASE_URL` | Chưa tạo Variables (bước 4) |
| `migrate` báo `Thiếu SUPABASE_…` | Secrets chưa đặt trong environment `production` |
| Migration chưa được áp | Actions → Deploy → **Run workflow** với `migrate = true` |
| Pages 404 ở trang chủ | Kiểm tra bước 2 (Source = GitHub Actions) |
| Link email mở sai địa chỉ | Kiểm tra Site URL / Redirect URLs trên Supabase |
| "Hãy mở liên kết trên cùng trình duyệt" | Liên kết PKCE phải mở trên trình duyệt đã gửi yêu cầu |
| App báo lỗi kết nối sau thời gian dài không dùng | Supabase Free tạm dừng project → Restore trong Dashboard |
