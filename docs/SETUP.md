# Cài đặt Linguo trên máy

## Cần có
- Node.js 22 (`node -v`), pnpm 10 (`corepack enable` là đủ; phiên bản pnpm được ghim trong `package.json`)
- Docker Desktop (chỉ cần cho test database local)

## 1. Cài phụ thuộc
```bash
pnpm install
```

## 2. Tạo project Supabase (một lần)
1. supabase.com → **New project**. Tên `linguo`, region **Southeast Asia (Singapore)**. Lưu lại **Database password**.
2. Copy **Project URL** ở **Project Settings → Data API** (hoặc nút **Connect** ở đầu trang project), và **Publishable key** (`sb_publishable_…`) ở **Project Settings → API Keys**.
3. **Authentication → Sign In / Providers → Email**:
   - Bật **Confirm email**.
   - Đặt **Minimum password length = 8**. App yêu cầu tối thiểu 8 ký tự, nhưng mặc định của Supabase hosted là 6; không đặt thì ai gọi thẳng API vẫn tạo được mật khẩu 6 ký tự.
   - (Tuỳ chọn) bật **Secure password change**: đổi mật khẩu yêu cầu đăng nhập gần đây.
4. **Authentication → URL Configuration** (đường dẫn **phân biệt hoa/thường**: `/Linguo`, không phải `/linguo`):
   - Site URL: `https://nguyenngoctuyen11032003.github.io/Linguo`
   - Redirect URLs: `https://nguyenngoctuyen11032003.github.io/Linguo/**`, `http://localhost:5173/**`, `http://localhost:4173/**`
5. Email mặc định của Supabase chỉ gửi vài email mỗi giờ. Trước khi có người dùng thật, cấu hình **Authentication → Emails → SMTP** (ví dụ Resend).

## 3. Điền `.env`
```bash
cp .env.example .env
```
Điền `VITE_SUPABASE_URL` và `VITE_SUPABASE_PUBLISHABLE_KEY`. Ở production đặt thêm `VITE_SITE_URL=https://nguyenngoctuyen11032003.github.io/Linguo` (khi chạy local có thể bỏ trống, app dùng origin hiện tại). Kiểm tra: `pnpm check-env`.

## 4. Áp migration lên project (lần đầu, hoặc để CI làm)
```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref <project-ref>
pnpm exec supabase db push
```
> Chạy `db push` từ máy cá nhân **bỏ qua cổng duyệt** của environment `production`. Chỉ làm vậy cho lần push đầu tiên; sau đó để Deploy workflow áp migration (có duyệt).

Sau mỗi lần đổi migration, sinh lại types và commit (CI sẽ fail nếu file lỗi thời hoặc chưa được commit):
```bash
pnpm db:types   # cần `pnpm db:start` đang chạy
```

## 5. Đăng nhập Google (tuỳ chọn)
1. console.cloud.google.com → APIs & Services → **OAuth consent screen**: cấu hình trước khi tạo client (App name `Linguo`, User support email, Developer contact email).
2. **Credentials → Create OAuth client ID → Web application**.
3. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Supabase → **Authentication → Sign In / Providers → Google**: dán Client ID và Client Secret, bật.
5. Đặt `VITE_AUTH_GOOGLE_ENABLED=true` trong `.env` và trong GitHub Variables.

## 6. Chạy
```bash
pnpm dev            # http://localhost:5173
pnpm test           # unit tests
pnpm e2e            # Playwright trên các thiết bị iPhone/Android giả lập
pnpm db:start && pnpm db:test   # database local + test RLS (cần Docker)
pnpm build && pnpm check:bundle # bản production: CSP được chèn lúc build, bundle không được chứa secret/source map
pnpm check:bundle-size          # sau pnpm build: ngân sách kích thước JS tải đầu (chunk vào 33 KiB, tổng 240 KiB gzip; CI cũng chạy)
```

Ngân sách và cách xử lý khi vượt: `docs/FEATURES.md` mục 18. Kiểm tra site và Supabase đang chạy thật (chỉ đọc) bằng `SITE_URL=… SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… pnpm smoke`; xem `docs/RUNBOOK.md` → *Kiểm tra sau deploy (smoke)*.

`pnpm e2e` build web ở chế độ `e2e` (file `.env.e2e` ở gốc repo: Supabase giả ở `e2e.invalid`, mọi lời gọi được Playwright mock) rồi chạy `vite preview`; không cần Supabase hay Docker. Lần đầu cần cài trình duyệt: `pnpm --filter @linguo/web exec playwright install chromium webkit` (như CI). Test unit chạy bằng `pnpm test`, gồm cả kiểm tra migration đã deploy không bị sửa và các script trong `scripts/`.

### Docker và Supabase local
- **Chỉ chạy một stack Supabase tại một thời điểm** trên máy (`pnpm db:stop` hoặc `supabase stop` stack khác trước khi `pnpm db:start`).
- Để chạy test database, một stack gọn là đủ (không cần Studio, Auth UI, Storage...):
  ```bash
  pnpm exec supabase start -x studio,imgproxy,vector,logflare,edge-runtime,realtime,storage-api,mailpit,postgres-meta
  pnpm db:test      # pgTAP trong supabase/tests
  pnpm db:lint      # supabase db lint --fail-on error
  pnpm db:stop
  ```
  `pnpm db:start` (= `supabase start`, không loại trừ gì) khởi động đủ dịch vụ và nặng hơn.
- `pnpm db:types` (sinh lại `packages/shared/src/database.types.ts`) dùng `supabase gen types --local`; CI chạy lệnh này trên stack không loại trừ `postgres-meta` (xem `.github/workflows/ci.yml`, job `database`), nên khi cần sinh lại types hãy dùng `pnpm db:start` hoặc bỏ `postgres-meta` khỏi danh sách `-x`.
- `pnpm db:reset` (`supabase db reset`) áp lại toàn bộ migration và `supabase/seed.sql` trên **stack local**; không bao giờ chạy với project hosted (xem `docs/DEPLOY.md`).
- Chạy Edge Function local: `pnpm exec supabase functions serve --env-file supabase/functions/.env` (mục 7, 8) khi stack local đang chạy. Chưa kiểm chứng việc này với cấu hình `-x` gọn ở trên (cấu hình đó loại `edge-runtime`); nếu gặp lỗi, dùng `pnpm db:start` đầy đủ.

`pnpm dev` không có CSP để HMR chạy được. Muốn kiểm CSP thì chạy `pnpm build && pnpm preview` (xem `docs/RUNBOOK.md` mục 7).

### Supabase local
Cổng local dùng dải 553xx thay vì mặc định 543xx:

| Dịch vụ | Cổng |
|---|---|
| API | 55321 |
| Database | 55322 |
| Studio | 55323 |
| Mailpit | 55324 |

Lý do: Windows (Hyper-V/WSL) có thể giữ trước các cổng TCP 54237–54336, khiến `supabase start` không bind được cổng mặc định. Xem cấu hình trong `supabase/config.toml`.

**Cổng bị Windows giữ là bẫy chung, không riêng Supabase.** Dải bị giữ khác nhau theo máy và có thể đổi sau khi khởi động lại: xem bằng `netsh interface ipv4 show excludedportrange protocol=tcp`. Trên máy phát triển của dự án, dải 584xx cũng bị chặn; khi cần cổng riêng (một stack Supabase thứ hai, server thử), chọn trong dải 574xx hoặc 575xx và kiểm lại bằng lệnh trên. (Thông tin về máy này do người vận hành ghi nhận, không kiểm chứng được từ repo.) Quy ước chạy nhiều phiên làm việc song song trên cùng một Docker (khoá `linguo-db.lock`): `docs/superpowers/HANDOFF.md` mục 6.

### Windows (Git Bash)
Git Bash tự đổi các chuỗi giống đường dẫn Unix thành đường dẫn Windows, làm hỏng biến môi trường như `VITE_BASE_PATH=/Linguo/`. Thêm tiền tố `MSYS_NO_PATHCONV=1` cho lệnh truyền đường dẫn qua biến môi trường:
```bash
MSYS_NO_PATHCONV=1 VITE_BASE_PATH=/Linguo/ pnpm build
```

## 7. Gia sư AI — Gemini (tuỳ chọn)
Gia sư AI chạy trong Edge Function `supabase/functions/ai-tutor`; key Gemini **chỉ** nằm ở phía server (secret của Edge Function), không bao giờ ở `.env` của web hay biến `VITE_*`. Không có key, app vẫn chạy: nút "Giải thích AI" hiện "Tạm thời không khả dụng" kèm lời giải thích soạn sẵn. Tám tác vụ AI (gồm phân tích câu, tóm tắt phiên học, kế hoạch ôn và đóng vai `/app/dong-vai`) dùng chung một function, một key và một quota ngày; mỗi lượt đóng vai trừ một lượt (FEATURES mục 6 và 16). Luyện nói (`/app/luyen-noi`) không cần key hay secret nào: ghi âm chỉ ở trình duyệt.

1. **Lấy API key:** vào [Google AI Studio](https://aistudio.google.com/apikey) → đăng nhập Google → **Get API key / Create API key** (chọn hoặc tạo một Google Cloud project). Không bật billing cho project này nếu chỉ muốn dùng gói miễn phí.
2. **Chọn model:** trong AI Studio (bảng chọn model, hoặc trang [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)) chọn một model **Flash** có trong **free tier**, ví dụ dạng `gemini-…-flash`. Ghi đúng **model id** (không phải tên hiển thị). Model chỉ đọc từ secret `GEMINI_MODEL`; đổi model không cần sửa code (cache cũ tự không dùng lại vì khoá cache chứa tên model).
3. **Chạy local:**
   ```bash
   cp supabase/functions/.env.example supabase/functions/.env   # file này bị git ignore
   # điền GEMINI_API_KEY và GEMINI_MODEL
   pnpm db:start
   pnpm exec supabase functions serve --env-file supabase/functions/.env
   ```
   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` được Supabase CLI tự cấp, không cần điền. Tuỳ chọn: `GEMINI_DAILY_USER_LIMIT` (mặc định 20 lượt/người/ngày), `GEMINI_MAX_OUTPUT_TOKENS` (2048), `GEMINI_TIMEOUT_MS` (20000); giá trị ngoài khoảng hợp lệ bị bỏ qua (xem `docs/DEPLOY.md` → Gia sư AI).
4. **Kiểm tra code function** (cần Deno 2, hoặc `npx deno@2`): trong `supabase/functions` chạy `deno check .`, `deno lint`, `deno test --allow-env` (test dùng fetch giả, không gọi Gemini thật).
5. **Production:** đặt secrets trong GitHub environment `production` (xem `docs/DEPLOY.md` → Gia sư AI); workflow Deploy tự đẩy chúng lên Supabase.

## 8. Nhắc học & thông báo đẩy (tuỳ chọn)
Thông báo nhắc học luôn hiện trong hộp thư của app. Thông báo đẩy tới thiết bị (Web Push) cần thêm một cặp khoá VAPID; không có khoá thì chỉ bỏ qua phần đẩy.

1. **Tạo khoá:** `npx web-push generate-vapid-keys` (Public Key + Private Key) và `openssl rand -hex 32` (`NOTIFY_CRON_SECRET`).
2. **Web:** đặt `VITE_VAPID_PUBLIC_KEY=<Public Key>` trong `.env` (khoá công khai, được phép ở phía client). Kiểm tra: `pnpm check-env`.
3. **Edge Function `notify-dispatch`:** trong `supabase/functions/.env` điền `NOTIFY_CRON_SECRET`, `VAPID_PUBLIC_KEY` (cùng giá trị bước 2), `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:<email>`. Private key **chỉ** ở đây, không bao giờ trong biến `VITE_*`.
4. **Gọi thử local** (sau `pnpm exec supabase functions serve --env-file supabase/functions/.env`):
   ```bash
   curl -X POST -H "Authorization: Bearer <NOTIFY_CRON_SECRET>" http://127.0.0.1:55321/functions/v1/notify-dispatch
   ```
   Kết quả chỉ là số đếm `{generated, pushed, failed, removed}`.
5. **Kiểm tra code:** trong `supabase/functions` chạy `deno check .` và `deno test --allow-env` (Supabase và push service đều là bản giả, không cần Docker hay mạng).
6. **Production:** xem `docs/DEPLOY.md` → Nhắc học & Web Push (workflow **Notify** gọi function mỗi 15 phút).

## 9. Trang quản trị `/quan-tri` trên máy (tuỳ chọn)
Cần một dòng trong `public.staff_roles`. Trên Supabase local: đăng ký một tài khoản trong app, rồi chạy câu `insert into public.staff_roles …` ở `docs/DEPLOY.md` → Quản trị nội dung (bootstrap admin) bằng Studio (`http://127.0.0.1:55323`, SQL Editor) hoặc `psql` tới cổng 55322. Không cần mật khẩu hay secret nào khác. Có vai trò admin rồi thì cấp vai trò cho tài khoản khác ở trang Nhân sự `/quan-tri/nhan-su`.

## 10. Khu giáo viên `/giao-vien` trên máy (tuỳ chọn)
Cần một dòng trong `public.teacher_profiles`: đăng ký một tài khoản trong app, rồi chạy câu `insert into public.teacher_profiles …` ở `docs/DEPLOY.md` → Giáo viên (Studio hoặc `psql` như mục 9). Tải lại trang để thấy "Lớp học (giáo viên)"; dùng tài khoản thứ hai để vào lớp bằng mã mời ở `/app/lop-hoc`.

## 11. Audio bài nghe (tuỳ chọn)
Không cần gì để chạy app: thiếu audio thì bài nghe đọc bằng giọng máy của trình duyệt. Chỉ cần khi muốn **tạo** audio (`scripts/generate-audio.mjs`, xem `docs/AUDIO.md`):

1. `pnpm audio:plan` và `pnpm audio:check` không cần key hay mạng.
2. Thử tạo trên Supabase local: cần đủ dịch vụ (`pnpm db:start`; stack gọn `-x … storage-api …` không có Storage). Đặt trong shell (không ghi vào file): `GEMINI_API_KEY` (key Google AI Studio như mục 7), `SUPABASE_URL=http://127.0.0.1:55321`, `SUPABASE_SERVICE_ROLE_KEY` (lấy từ `pnpm exec supabase status`); tuỳ chọn `GEMINI_TTS_MODEL`. Rồi `pnpm audio:generate -- --lang ko --limit 3 --out <thư mục ngoài repo>` và nghe thử.
3. Chạy local sẽ ghi `audio_asset_id` vào YAML và manifest dù file chỉ nằm trên Storage local: đừng commit kết quả của lần thử local (`git checkout -- content supabase/content-audio-manifest.json`, xoá manifest nếu mới tạo). Production: `docs/DEPLOY.md` → Audio bài nghe.

## Thông tin bạn cần cung cấp — tóm tắt
| Giá trị | Đặt ở đâu |
|---|---|
| Project URL, Publishable key | `.env` và GitHub → Variables |
| Project ref | GitHub → Variables (`SUPABASE_PROJECT_ID`) |
| Access token (supabase.com → Account → Access Tokens) | GitHub → Environment `production` → Secrets |
| Database password | GitHub → Environment `production` → Secrets |
| Google OAuth Client ID/Secret (tuỳ chọn) | Supabase Dashboard |
| Gemini API key + model id (Google AI Studio) | Local: `supabase/functions/.env`; production: GitHub → Environment `production` → Secrets `GEMINI_API_KEY`, `GEMINI_MODEL` |
| Secret/service_role key của Supabase (chỉ để chạy `pnpm content:push` hoặc workflow Publish content/Maintenance) | Production: GitHub → Environment `production` → Secrets `SUPABASE_SERVICE_ROLE_KEY`; local: biến môi trường của một lệnh, không ghi vào file |
| Tên đầy đủ các secret/biến của GitHub | `docs/DEPLOY.md` → Tổng hợp secrets và biến |
| VAPID public key (tuỳ chọn) | `.env` và GitHub → Variables (`VITE_VAPID_PUBLIC_KEY`) |
| VAPID private key, subject, `NOTIFY_CRON_SECRET` (tuỳ chọn) | Local: `supabase/functions/.env`; production: GitHub → Environment `production` → Secrets `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NOTIFY_CRON_SECRET`; `NOTIFY_CRON_SECRET` đặt thêm (cùng giá trị) ở environment `notify`, và workflow Notify còn đọc repository variable `VITE_SUPABASE_URL` |
| Tạo audio bài nghe (tuỳ chọn): Gemini API key, Supabase URL, secret/service_role key; tuỳ chọn `GEMINI_TTS_MODEL` | Chỉ biến môi trường của lệnh `pnpm audio:generate`, không ghi vào file, không đặt ở GitHub (`docs/DEPLOY.md` → Audio bài nghe) |
| Smoke check sau deploy (tuỳ chọn) | GitHub → repository Variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (đã đặt cho build; không cần secret) |

## Bảng giờ tham chiếu (ước lượng thời gian)

Ước lượng thời gian của lộ trình dựa trên bảng `public.level_reference_hours` (giờ học cộng dồn mỗi bậc). Giá trị hiện tại là **tham khảo, chưa kiểm duyệt** (`reviewed = false`) và UI luôn ghi rõ điều đó. Muốn chỉnh số giờ: tạo migration mới cập nhật bảng, sửa `packages/shared/src/learning/estimate.fixtures.json` nếu ca kiểm thử bị ảnh hưởng, chạy `pnpm fixtures:sync` và commit cả hai.
