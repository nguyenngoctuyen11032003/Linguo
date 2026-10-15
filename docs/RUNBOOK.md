# Runbook vận hành Linguo

Tài liệu xử lý sự cố và vận hành production (spec 7 §3). Thiết lập ban đầu và quy trình deploy hằng ngày: [DEPLOY.md](DEPLOY.md). Cài đặt local: [SETUP.md](SETUP.md).

| Thành phần | Ở đâu | Ai/cái gì có quyền |
|---|---|---|
| Web (SPA tĩnh) | GitHub Pages, build bởi workflow **Deploy** | Mọi người đọc; chỉ Deploy ghi |
| Database + Auth | Supabase hosted (project `SUPABASE_PROJECT_ID`) | RLS cho user; `service_role` chỉ ở Edge Functions và workflow `production` |
| Gia sư AI | Edge Function `ai-tutor` + Gemini | Key Gemini chỉ trong secret Supabase |
| Nhắc học và Web Push | Workflow **Notify** (mỗi 15 phút) → Edge Function `notify-dispatch` | `NOTIFY_CRON_SECRET` (environment `notify` và Supabase), khoá VAPID chỉ trong secret Supabase |
| Dọn dữ liệu | Workflow **Maintenance** (hằng ngày) → RPC `purge_expired_data` | `SUPABASE_SERVICE_ROLE_KEY` trong environment `production` |
| Quản trị nội dung | `/quan-tri` (bảng `staff_roles`) | Vai trò `editor` < `reviewer` < `admin`, cấp bằng SQL hoặc `admin_grant_role` |
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
- Mở PR → CI áp toàn bộ migration trên Supabase local và chạy pgTAP → merge → Deploy áp migration (cần Approve `production`) → ghi checksum bằng `node scripts/check-migrations-immutable.mjs --record <file>` (quy trình đầy đủ ở [DEPLOY.md](DEPLOY.md) mục *Quy tắc an toàn database*).
- Số của migration sửa lỗi phải **lớn hơn** số của migration cuối trong `supabase/migrations-applied.json` (nếu không `supabase db push` từ chối); đặt tên bằng tay nếu `supabase migration new` sinh số nhỏ hơn (DEPLOY.md, *Quy tắc đánh số migration mới*).
- Nếu một migration đã áp làm hỏng logic (không hỏng dữ liệu), sửa tiến bằng `create or replace function …` của chính hàm đó trong migration mới, giữ nguyên chữ ký hàm và `revoke`/`grant`. Ví dụ đã làm trong repo: `20261015000800_answer_integrity.sql` thay `submit_exercise`, `20261015000600_review_grade_guard.sql` thay `grade_review`, `20261014000600_spec2_sync.sql` vá file bị sửa sau khi deploy.
- Trong lúc chờ bản sửa, có thể giảm thiểu mà không đụng database: tắt tính năng liên quan bằng cách dừng workflow hoặc gỡ secret (mục 9).
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

### `NOTIFY_CRON_SECRET`

1. `openssl rand -hex 32` (tối thiểu 32 ký tự, ngắn hơn bị coi là chưa đặt).
2. Cập nhật **cả hai** secret cùng tên: environment `production` và environment `notify`.
3. Actions → Deploy → **Run workflow** với `functions = true` → Approve (đẩy giá trị mới lên Supabase). Trong khoảng giữa bước 2 và 3, Notify nhận `HTTP 401`; chạy lại Notify bằng tay sau bước 3.

### Khoá VAPID (Web Push)

Quy trình và hệ quả (mọi subscription cũ mất hiệu lực, người học phải bật lại thông báo trên từng thiết bị) ở [DEPLOY.md](DEPLOY.md) mục *Nhắc học & Web Push → Xoay khoá VAPID*. Chỉ xoay khi private key bị lộ.

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
- Theo dõi: Supabase → Table editor → `ai_usage` (chỉ metadata), lọc theo `status` và `created_at`; hoặc admin mở `/quan-tri/thong-ke` → "Mức dùng AI" (request theo tác vụ và trạng thái, báo cáo câu trả lời AI).
- **Breaker nằm trong bộ nhớ của từng instance** của function (`supabase/functions/ai-tutor/index.ts`), không dùng chung: sau khi instance khởi động lại hoặc một instance khác nhận request, breaker có thể đang đóng và thử Gemini một lần nữa. Người học vẫn thấy hết quota khi Gemini vẫn từ chối.
- **Người học thấy gì:** nút "Giải thích AI" hiện lý do, thời điểm thử lại (nếu biết) và lời giải thích soạn sẵn nếu bài/thẻ có (`web/components/ai/AiFallback.tsx`). Phản hồi bài viết trong luyện thi (`review_writing`) dùng chung hạ tầng nên cũng báo không khả dụng; phần làm bài, chấm đáp án và xem kết quả thi không phụ thuộc AI.
- **Lượt của người học không mất oan:** thiếu key hoặc breaker đang mở thì function trả 503 trước khi trừ lượt; nếu lỗi xảy ra sau khi đã trừ (Gemini lỗi, đầu ra không hợp lệ), function hoàn lượt bằng `ai_quota_refund` (cố gắng tối đa, không bảo đảm). Không cần can thiệp vào `ai_quota`.
- **Muốn chủ động tắt AI** (ví dụ chi phí, nghi lạm dụng): xem mục 9 *Tắt AI*.

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
- [ ] Nhắc học: environment `notify` có `NOTIFY_CRON_SECRET`; Actions → Notify chạy tay trả `HTTP 200`; nếu bật Web Push thì `VITE_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` đã đặt và một thiết bị thật nhận được thông báo thử.
- [ ] Quản trị: đã bootstrap admin đầu tiên (DEPLOY.md → Quản trị nội dung) và đăng nhập `/quan-tri` được; tài khoản thường mở `/quan-tri` thấy 404.
- [ ] `purge_analytics()` và `purge_notifications()` đã được quyết định (nối vào Maintenance hoặc chạy tay định kỳ), xem DEPLOY.md → Bảo trì dữ liệu.
- [ ] Mọi migration đã deploy đều có trong `supabase/migrations-applied.json` (`node scripts/check-migrations-immutable.mjs` xanh).

## 9. Sự cố cơ bản

### Xem log ở đâu

| Cần xem | Ở đâu |
|---|---|
| CI, Deploy, Publish content, Maintenance, Notify | GitHub → Actions (log không in secret, endpoint hay nội dung thông báo; Notify chỉ in `HTTP <mã>` và `{generated, pushed, failed, removed}`) |
| Edge Function `ai-tutor`, `notify-dispatch` | Supabase Dashboard → Edge Functions → chọn function → **Logs**. `notify-dispatch` chỉ log số đếm và các thông điệp cố định (ví dụ `VAPID keys not set, push skipped`, `NOTIFY_CRON_SECRET is unset or too short`); `ai-tutor` không tự ghi log ra console, siêu dữ liệu từng request nằm ở bảng `ai_usage` |
| Lỗi database, RLS, RPC | Supabase Dashboard → **Logs** (Postgres, API) |
| Dùng AI, báo lỗi nội dung, thao tác quản trị | `/quan-tri/thong-ke`, `/quan-tri/bao-loi`, `/quan-tri/nhat-ky` (cần vai trò) |
| Lỗi phía trình duyệt | Console của trình duyệt; app không gửi log lỗi về server (analytics nội bộ chỉ có sự kiện học tập trong danh sách `ANALYTICS_EVENTS`) |

### Tắt nhắc học và Web Push toàn hệ thống

Chọn mức nhẹ nhất đủ dùng:
1. **Dừng lịch gọi:** Actions → **Notify** → `...` → **Disable workflow**. Không còn thông báo mới (cả trong app lẫn đẩy). Bật lại bằng **Enable workflow**.
2. **Hoặc xoá secret `NOTIFY_CRON_SECRET` khỏi environment `notify`:** workflow chỉ cảnh báo và thoát 0 (không gửi mail lỗi). Muốn function từ chối mọi lời gọi ở phía Supabase: `pnpm exec supabase secrets unset NOTIFY_CRON_SECRET --project-ref <ref>` (function trả 401 khi thiếu hoặc ngắn hơn 32 ký tự). Nhớ xoá cả secret cùng tên ở environment `production`, nếu không lần Deploy `functions` kế tiếp đặt lại nó.
3. **Chỉ tắt đẩy tới thiết bị, giữ thông báo trong app:** `pnpm exec supabase secrets unset VAPID_PRIVATE_KEY --project-ref <ref>` (function bỏ qua push, không đụng subscription) và xoá secret `VAPID_PRIVATE_KEY` ở environment `production` để Deploy không đặt lại.
4. Từng người học tự tắt được ở Cài đặt → Nhắc học (không có cờ tắt toàn cục trong database).

### Tắt AI

Function đọc cấu hình từ biến môi trường ở mỗi request; thiếu `GEMINI_API_KEY` hoặc `GEMINI_MODEL` thì trả 503 `ai_unavailable` (không trừ lượt) và web hiện phương án dự phòng. Phần còn lại của app không bị ảnh hưởng.
1. `pnpm exec supabase secrets unset GEMINI_API_KEY --project-ref <ref>` (hoặc `GEMINI_MODEL`).
2. Xoá secret cùng tên ở GitHub environment `production`. Deploy chỉ **đặt** secret có giá trị, không bao giờ xoá; để nguyên thì lần chạy `functions` sau sẽ đặt lại key.
3. Thử một câu hỏi gia sư trên production để xác nhận (chưa kiểm chứng thời gian có hiệu lực của `secrets unset` trên hạ tầng Supabase; nếu vẫn trả lời, đợi ít phút hoặc chạy lại lệnh).
4. Bật lại: đặt lại secret ở GitHub rồi chạy Deploy với `functions = true`.
Giảm thiểu mà không tắt hẳn: hạ `GEMINI_DAILY_USER_LIMIT` (mục 6).

### Dừng các tác vụ tự động khác

- **Maintenance** (dọn dữ liệu hằng ngày): Actions → Maintenance → **Disable workflow**. Chỉ làm chậm việc dọn dữ liệu, không mất gì.
- **Deploy** khi nghi một bản đang lỗi: Actions → Deploy → **Disable workflow** (như mục 2 bước 2), rồi rollback theo mục 3 và 4.
- **Một nội dung sai** đang hiển thị cho người học: admin chuyển nó về `in_review` hoặc `archived` ở `/quan-tri/noi-dung` (có hiệu lực ngay, không cần deploy); sửa YAML trong repo sau đó. Lưu ý lần **Publish content** kế tiếp không hạ trạng thái của dòng có nội dung không đổi, nhưng nội dung đã sửa nhận trạng thái ghi trong YAML.

## Kiểm tra sau deploy (smoke)

Deploy xanh chưa chắc site đang chạy đúng (sai base path, thiếu env lúc build, service worker/manifest hỏng, Edge Function chưa deploy). Workflow **Smoke** (`.github/workflows/smoke.yml`, script `scripts/smoke.mjs`) gọi site và Supabase thật sau mỗi lần Deploy thành công trên `main`, hằng ngày lúc 02:30 UTC và khi bấm **Run workflow**. Chỉ đọc: không gọi gì tốn lượt AI, không gửi thông báo, không in dữ liệu người dùng hay nội dung phản hồi.

**Biến cần có** (repository variables, giá trị công khai, không cần secret; job không gắn environment `production` nên không chờ duyệt):

| Biến | Bắt buộc | Ghi chú |
|---|---|---|
| `VITE_SUPABASE_URL` | Có | cùng biến dùng để build web |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Có | cùng biến dùng để build web |
| `VITE_SITE_URL` | Không | mặc định `https://<owner viết thường>.github.io/<tên repo>`; đặt nếu dùng tên miền riêng |

Thiếu `VITE_SUPABASE_URL` hoặc `VITE_SUPABASE_PUBLISHABLE_KEY` ở cấp repo thì run in `::warning::` rồi kết thúc xanh (không kiểm tra gì). Nếu hai biến này mới chỉ nằm trong environment `production`, hãy thêm cùng tên ở **Settings → Secrets and variables → Actions → Variables → Repository variables**.

**Chạy tay:**

```bash
SITE_URL=https://<owner>.github.io/<repo> SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_PUBLISHABLE_KEY=sb_publishable_... node scripts/smoke.mjs        # thêm --json cho máy đọc
```

Mỗi kiểm tra in một dòng `PASS`/`FAIL` rồi một dòng tổng kết; exit 1 nếu có lỗi, 2 nếu thiếu biến.

| Kiểm tra | Fail nghĩa là |
|---|---|
| `page:/` | `/` không 200 hoặc HTML thiếu `#root`, CSP meta (`script-src 'self'`, không `unsafe-inline`/`unsafe-eval`), `<meta name="referrer">`, module script: sai base path hoặc build lỗi/thiếu `VITE_SUPABASE_URL` |
| `deeplink:/dang-nhap`, `deeplink:/app` | GitHub Pages trả `404.html` (status 404) cho route SPA; script chấp nhận 200 hoặc 404 miễn body là app shell. Fail: `404.html` không phải bản sao `index.html` |
| `assets` | một script/modulepreload/CSS cùng origin trong `index.html` không 200, rỗng hoặc sai content-type: deploy dở dang hoặc cache cũ |
| `manifest` | `manifest.webmanifest` không phải JSON hợp lệ, thiếu `name`/`start_url`/`icons`, `start_url` ngoài scope hoặc icon không tải được |
| `sw.js` | không 200, không phải JavaScript hoặc là HTML (SPA fallback): PWA offline hỏng |
| `bundle-secrets` | JS phục vụ có secret (cùng luật với `pnpm check:bundle`) hoặc có source map: xoay key (mục 5) rồi deploy lại |
| `supabase:auth-health` | `/auth/v1/health` không 200: project tạm dừng, sai `VITE_SUPABASE_URL` hoặc key |
| `supabase:function:ai-tutor`, `…:notify-dispatch` | `OPTIONS` trả 404 hoặc 5xx: Edge Function chưa deploy (Actions → Deploy → Run workflow với `functions = true`) |
| `supabase:rpc-anon` | RPC `export_my_data` gọi ẩn danh không bị 401/403: `revoke … from anon` bị mất, xem migration |
| `supabase:table-anon` | `profiles` đọc ẩn danh trả dòng: RLS hoặc grant bị gỡ. Coi là sự cố bảo mật |

**Tắt lịch:** Actions → **Smoke** → menu `…` → **Disable workflow** (tắt luôn lần chạy sau Deploy), hoặc xoá khối `schedule:` trong `smoke.yml`. Lỗi mạng tạm thời được thử lại 2 lần; run đỏ do GitHub Pages chưa kịp cập nhật thì chạy lại bằng **Run workflow**.

## Nhật ký diễn tập

| Ngày | Việc | Kết quả |
|---|---|---|
| | | |
