# Runbook vận hành Linguo

Tài liệu xử lý sự cố và vận hành production (spec 7 §3). Thiết lập ban đầu và quy trình deploy hằng ngày: [DEPLOY.md](DEPLOY.md). Cài đặt local: [SETUP.md](SETUP.md).

| Thành phần | Ở đâu | Ai/cái gì có quyền |
|---|---|---|
| Web (SPA tĩnh) | GitHub Pages, build bởi workflow **Deploy** | Mọi người đọc; chỉ Deploy ghi |
| Database + Auth | Supabase hosted (project `SUPABASE_PROJECT_ID`) | RLS cho user; `service_role` chỉ ở Edge Functions và workflow `production` |
| Gia sư AI | Edge Function `ai-tutor` + Gemini | Key Gemini chỉ trong secret Supabase |
| Secrets | GitHub environment `production`, Supabase secrets | Không bao giờ trong `VITE_*`, file commit hay log |

## 1. Mục tiêu khôi phục (MVP)

- **RPO 24 giờ:** chấp nhận mất tối đa dữ liệu của 24 giờ gần nhất (khoảng cách giữa hai bản backup ngày).
- **RTO 4 giờ:** từ lúc phát hiện đến khi app chạy lại, có thể ở chế độ không AI.
- Nội dung bài học không phụ thuộc backup: `content/` và `supabase/seed.sql` nằm trong Git, nhập lại bằng workflow **Publish content**.
- Xem lại hai ngưỡng này khi có người dùng trả phí hoặc trên 1.000 người học hằng tuần.

## 2. Backup và khôi phục database

### Backup

- **Supabase Pro trở lên:** Supabase tự backup hằng ngày và giữ 7 ngày (gói Pro). Xem tại Dashboard → **Database → Backups**. Bật thêm **Point-in-Time Recovery** nếu cần RPO dưới 24 giờ (add-on trả phí).
- **Supabase Free:** không có bản backup tải về hay khôi phục được từ Dashboard. Để giữ RPO 24h phải tự dump ít nhất mỗi ngày:
  ```bash
  pnpm exec supabase link --project-ref <ref>
  pnpm exec supabase db dump -f backup-roles.sql --role-only
  pnpm exec supabase db dump -f backup-schema.sql
  pnpm exec supabase db dump -f backup-data.sql --data-only --use-copy
  ```
  Các file dump chứa dữ liệu người dùng: lưu ở nơi riêng tư có mã hoá, **không commit vào Git**, xoá sau 30 ngày.
- Mỗi quý thử khôi phục một lần vào một project Supabase tạm, theo mục bên dưới, rồi ghi ngày thử vào cuối file này.

### Khôi phục

1. Đánh giá phạm vi: dữ liệu bị hỏng từ lúc nào, bảng nào. Chụp lại log/triệu chứng.
2. Tạm dừng ghi nếu cần: tắt Deploy tự động (Actions → Deploy → **Disable workflow**) để không có migration mới chen vào.
3. Có backup Supabase (Pro): Dashboard → **Database → Backups** → chọn bản trước sự cố → **Restore**. Project sẽ ngừng hoạt động trong lúc khôi phục; dữ liệu sau thời điểm backup bị mất (RPO).
4. Chỉ có file dump (Free): tạo project mới, áp dump theo thứ tự roles → schema → data (`psql "$DB_URL" -f …`), rồi chuyển app sang project mới: cập nhật Variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID` và secrets trong environment `production`, cấu hình lại Auth URL như [DEPLOY.md](DEPLOY.md) bước 5, rồi chạy lại Deploy với `migrate = true` và `functions = true`.
5. Kiểm tra: `supabase migration list` khớp `supabase/migrations`, đăng nhập bằng tài khoản thử, mở một bài học, ôn tập, xem tiến độ.
6. Bật lại Deploy. Ghi sự cố (thời điểm, nguyên nhân, dữ liệu mất) vào issue.

## 3. Rollback web

Web là file tĩnh, rollback bằng cách deploy lại một commit cũ:

1. Tìm commit tốt gần nhất: Actions → **Deploy** → lần chạy xanh gần nhất trước sự cố, ghi lại SHA.
2. Cách nhanh: mở lần chạy đó → **Re-run all jobs** (GitHub chỉ cho chạy lại trong 30 ngày). Workflow build lại đúng commit cũ và đưa bản đó lên Pages. Chỉ dùng cách này khi từ commit đó đến nay **không có migration mới**. Nếu có, job `migrate` sẽ fail vì project hosted có migration mà commit cũ không có, và build bị chặn; khi đó dùng cách 3.
3. Cách bền vững: `git revert <sha-lỗi>` → push `main`. Deploy tự chạy với code đã hoàn tác. Nhánh `main` luôn khớp với bản đang chạy.
4. Không dùng `git push --force` lên `main`.

Lưu ý: bản web cũ phải tương thích với schema database hiện tại. Nếu bản lỗi có migration, chỉ rollback web khi migration đó tương thích ngược (thêm cột/bảng/hàm), nếu không thì sửa tiến (mục 4).

## 4. Rollback database: chỉ bằng forward migration

- **Không bao giờ** sửa hay xoá migration đã deploy, chạy `db reset` hay xoá bảng tay trên project hosted (xem [DEPLOY.md](DEPLOY.md) mục *Quy tắc an toàn database*).
- Hoàn tác một thay đổi schema = tạo migration mới đảo ngược nó:
  ```bash
  pnpm exec supabase migration new revert_<ten>
  ```
  Trong file mới dùng `create or replace`, `drop … if exists`, `alter table … drop column if exists`, `revoke`/`grant` tường minh, để cả DB hosted lẫn DB mới tinh đều ra cùng schema.
- Mở PR → CI áp toàn bộ migration trên Supabase local và chạy pgTAP → merge → Deploy áp migration (cần Approve `production`) → ghi checksum bằng `node scripts/check-migrations-immutable.mjs --record <file>`.
- Dữ liệu đã bị migration làm hỏng thì khôi phục theo mục 2, không có forward migration nào lấy lại được dữ liệu đã xoá.

## 5. Xoay vòng key

Xoay ngay khi nghi bị lộ (CI `secrets`/`check:bundle` báo, key xuất hiện trong log, máy cá nhân bị mất), và định kỳ 6 tháng một lần.

### Gemini (`GEMINI_API_KEY`)

1. Google AI Studio → **API keys** → tạo key mới trong cùng project Google Cloud.
2. GitHub → Settings → Environments → `production` → sửa secret `GEMINI_API_KEY`.
3. Actions → Deploy → **Run workflow** với `functions = true` → Approve. Bước *Set Edge Function secrets (Gemini)* đẩy key mới lên Supabase.
4. Thử một câu hỏi gia sư AI trên production.
5. Xoá key cũ trong Google AI Studio. Đến lúc này key cũ mới hết hiệu lực.

### Supabase service role / secret key

`SUPABASE_SERVICE_ROLE_KEY` bỏ qua RLS. Edge Functions nhận nó tự động; workflow **Publish content** đọc nó từ environment `production`.

1. Supabase Dashboard → Project Settings → **API Keys** → tạo secret key mới (`sb_secret_…`).
2. Cập nhật secret `SUPABASE_SERVICE_ROLE_KEY` trong environment `production`.
3. Thu hồi key cũ trên Dashboard. Nếu project vẫn dùng JWT `service_role` cũ (legacy): chuyển hẳn sang secret key mới rồi tắt legacy API keys. Đừng xoay JWT secret nếu chưa tính đến việc mọi phiên đăng nhập sẽ bị đăng xuất.
4. Chạy lại Deploy với `functions = true` để Edge Functions khởi động lại, rồi chạy thử **Publish content**.

### Các key khác

- `SUPABASE_ACCESS_TOKEN` (token cá nhân, có quyền trên mọi project): supabase.com → Account → Access Tokens → tạo mới, cập nhật secret, thu hồi token cũ.
- `SUPABASE_DB_PASSWORD`: Dashboard → Database → **Reset database password** → cập nhật secret.
- `VITE_SUPABASE_PUBLISHABLE_KEY` là key công khai, chỉ đổi khi chuyển project.

Sau khi xoay: key cũ có thể vẫn nằm trong lịch sử Git nếu từng bị commit. Thu hồi key là bắt buộc, còn viết lại lịch sử Git chỉ là việc phụ.

## 6. Gemini hết quota hoặc lỗi

Triệu chứng: gia sư AI báo "Tạm thời không khả dụng" với mọi người. `ai_usage` có nhiều dòng `ai_unavailable` hoặc `quota_exceeded`.

- **Phần học cốt lõi không bị ảnh hưởng:** bài học, ôn tập và chẩn đoán không gọi Gemini. Không cần hành động khẩn cấp cho các phần này.
- **Hết quota ngày (free tier):** circuit breaker mở ngay khi Gemini báo hết quota ngày và trả `retry_after_sec`. Quota Google reset theo giờ Thái Bình Dương. Các lựa chọn:
  1. Chờ reset (mặc định).
  2. Đổi `GEMINI_MODEL` sang một model Flash khác còn quota, rồi chạy Deploy với `functions = true`.
  3. Hạ `GEMINI_DAILY_USER_LIMIT` để quota chung kéo dài hơn.
  4. Bật billing trên Google Cloud (quyết định chi phí, cần chủ dự án đồng ý).
- **Lỗi 429/5xx kéo dài:** breaker mở sau 5 lỗi upstream trong 60 giây, thử lại sau 60 giây. Kiểm tra [trạng thái Google AI](https://aistudio.google.com/status) trước khi đổi cấu hình.
- **Một IP gửi dồn dập:** `ai-tutor` giới hạn 30 request/phút/IP trong bộ nhớ (theo `x-forwarded-for`), trả 429 `quota_exceeded` với `retry_after_sec` và không trừ lượt. Giới hạn chính vẫn là quota ngày theo tài khoản.
- Theo dõi: Supabase → Table editor → `ai_usage` (chỉ metadata), lọc theo `status` và `created_at`.

## 7. Bảo mật web

- **CSP** đặt bằng `<meta http-equiv="Content-Security-Policy">`, được plugin `apps/web/build/csp.ts` chèn lúc build (GitHub Pages không cho đặt header). Chỉ cho phép `self`, origin Supabase lấy từ `VITE_SUPABASE_URL`, Google Fonts, jsDelivr (font Pretendard) và origin của `VITE_HERO_VIDEO_URL` nếu có. Script inline duy nhất (chọn theme) được cho phép bằng hash sha256 tính lúc build.
- **Giới hạn của CSP dạng meta:** trình duyệt bỏ qua `frame-ancestors`, `report-uri`/`report-to` và `sandbox` trong meta. Site vẫn có thể bị nhúng iframe (clickjacking), và vi phạm CSP không được báo về đâu. Muốn chặn thì phải đưa site ra sau CDN/proxy có thể đặt header (ví dụ Cloudflare) với `Content-Security-Policy: frame-ancestors 'none'` và `X-Frame-Options: DENY`.
- Dev server (`pnpm dev`) không có CSP để HMR chạy được. E2E (`tests/e2e/csp.spec.ts`) chạy trên bản build và fail khi có vi phạm.
- Thêm nguồn mới (CDN, ảnh ngoài, API khác) thì phải sửa `build/csp.ts` và test của nó. Nếu không, trình duyệt sẽ chặn nguồn đó.
- **`referrer`** = `strict-origin-when-cross-origin`.
- **Bundle:** `pnpm check:bundle` (CI job web và Deploy, sau build) fail khi `apps/web/dist` có key Google (`AIza…`), `sb_secret_…`, chuỗi `service_role`, JWT có role `service_role`, hoặc source map.
- **Lịch sử Git:** job CI `secrets` chạy gitleaks 8.30.1 (tải binary và kiểm sha256) trên toàn bộ lịch sử. `.gitleaks.toml` chỉ allowlist file mẫu `.env.example`/`.env.e2e`; `.gitleaksignore` liệt kê fingerprint các giá trị giả trong test đã được rà soát. Khi gitleaks báo một secret thật, làm theo thứ tự: xoay key (mục 5), xoá khỏi code, rồi mới thêm fingerprint cũ vào `.gitleaksignore` kèm ghi chú.

## 8. Checklist trước khi ra mắt

Theo PRD §19 (điều kiện tối thiểu), §20.3 (bảo mật) và §22 (định nghĩa hoàn thành). Đánh dấu khi đã kiểm trên production.

### Điều kiện tối thiểu (PRD §19)

- [ ] Nội dung căn bản đã được người duyệt kiểm tra (`pnpm content:check` xanh, không còn bài `draft` trên production).
- [ ] Việc học và tiến độ còn nguyên sau khi tải lại trang và đăng nhập lại trên thiết bị khác.
- [ ] Dữ liệu người dùng không rò rỉ: pgTAP `rls_cross_user` và các test RLS xanh trong CI.
- [ ] AI key không lộ: `pnpm check:bundle` và job `secrets` xanh; key Gemini chỉ có trong secret Supabase.
- [ ] Chế độ không AI chạy được: xoá tạm `GEMINI_MODEL` trên một project thử, vẫn học và ôn được; gia sư báo không khả dụng.

### Bảo mật (PRD §20.3)

- [ ] Test RLS với ít nhất hai tài khoản (pgTAP `rls_cross_user.test.sql`, `account_data.test.sql`).
- [ ] User A không đọc/sửa/xoá được dữ liệu User B qua REST/RPC trực tiếp (thử tay một lần bằng hai token).
- [ ] Không có key Gemini trong JavaScript, source map hay lịch sử Git (job `web` → *Bundle không chứa secret*, job `secrets`).
- [ ] Endpoint AI có rate limit (quota ngày theo tài khoản + 30 request/phút/IP) và giới hạn payload 8 KB.
- [ ] Xoá tài khoản chạy đúng luồng: Cài đặt → *Xoá tài khoản* → dữ liệu biến mất, tài khoản khác không bị ảnh hưởng.
- [ ] Trang `/quyen-rieng-tu` và `/dieu-khoan` có nội dung, có link từ landing và Cài đặt.

### Định nghĩa hoàn thành (PRD §22) cho mỗi tính năng P0

- [ ] UI responsive (Playwright iPhone SE → desktop xanh, `docs/MOBILE-QA.md` đã chạy trên máy thật).
- [ ] Loading/error/empty/offline state có mặt; error boundary và trang 404 tiếng Việt.
- [ ] Migration + RLS + pgTAP cho mọi bảng mới.
- [ ] Kiểm thử logic và thao tác quan trọng (unit + E2E) xanh.
- [ ] Không thu thập dữ liệu quá mức (log AI chỉ metadata, `purge_expired_data` chạy hằng ngày).
- [ ] Tài liệu cấu hình và chạy local cập nhật (`SETUP.md`, `DEPLOY.md`, file này).
- [ ] Hoạt động khi AI/mạng lỗi (banner ngoại tuyến, "Đang chờ đồng bộ", fallback AI).
- [ ] Không có dữ liệu giả trên production (không chạy `seed.sql` lên hosted, không có tài khoản test cũ).

### Vận hành

- [ ] Có backup đáp ứng RPO 24h (gói Pro, hoặc dump hằng ngày nếu dùng Free) và đã thử khôi phục một lần.
- [ ] Environment `production` bật Required reviewers; secrets chỉ nằm trong environment đó.
- [ ] Supabase Auth: Site URL, Redirect URLs, độ dài mật khẩu tối thiểu 8.
- [ ] Đã thử rollback web một lần (Re-run một Deploy cũ).

## Nhật ký diễn tập

| Ngày | Việc | Kết quả |
|---|---|---|
| | | |
