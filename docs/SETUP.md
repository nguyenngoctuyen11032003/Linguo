# Cài đặt LexiPath trên máy

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
3. **Authentication → Sign In / Providers → Email**: bật **Confirm email**.
4. **Authentication → URL Configuration**:
   - Site URL: `https://<user>.github.io/<repo>`
   - Redirect URLs: `https://<user>.github.io/<repo>/**`, `http://localhost:5173/**`, `http://localhost:4173/**`
5. Email mặc định của Supabase chỉ gửi vài email mỗi giờ. Trước khi có người dùng thật, cấu hình **Authentication → Emails → SMTP** (ví dụ Resend).

## 3. Điền `.env`
```bash
cp .env.example .env
```
Điền `VITE_SUPABASE_URL` và `VITE_SUPABASE_PUBLISHABLE_KEY`. Kiểm tra: `pnpm check-env`.

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
1. console.cloud.google.com → APIs & Services → **Credentials → Create OAuth client ID → Web application**.
2. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Supabase → **Authentication → Sign In / Providers → Google**: dán Client ID và Client Secret, bật.
4. Đặt `VITE_AUTH_GOOGLE_ENABLED=true` trong `.env` và trong GitHub Variables.

## 6. Chạy
```bash
pnpm dev            # http://localhost:5173
pnpm test           # unit tests
pnpm e2e            # Playwright trên các thiết bị iPhone/Android giả lập
pnpm db:start && pnpm db:test   # database local + test RLS (cần Docker)
```

### Supabase local
Cổng local dùng dải 553xx thay vì mặc định 543xx:

| Dịch vụ | Cổng |
|---|---|
| API | 55321 |
| Database | 55322 |
| Studio | 55323 |
| Mailpit | 55324 |

Lý do: Windows (Hyper-V/WSL) có thể giữ trước các cổng TCP 54237–54336, khiến `supabase start` không bind được cổng mặc định. Xem cấu hình trong `supabase/config.toml`.

### Windows (Git Bash)
Git Bash tự đổi các chuỗi giống đường dẫn Unix thành đường dẫn Windows, làm hỏng biến môi trường như `VITE_BASE_PATH=/Linguo/`. Thêm tiền tố `MSYS_NO_PATHCONV=1` cho lệnh truyền đường dẫn qua biến môi trường:
```bash
MSYS_NO_PATHCONV=1 VITE_BASE_PATH=/Linguo/ pnpm build
```

## Thông tin bạn cần cung cấp — tóm tắt
| Giá trị | Đặt ở đâu |
|---|---|
| Project URL, Publishable key | `.env` và GitHub → Variables |
| Project ref | GitHub → Variables (`SUPABASE_PROJECT_ID`) |
| Access token (supabase.com → Account → Access Tokens) | GitHub → Environment `production` → Secrets |
| Database password | GitHub → Environment `production` → Secrets |
| Google OAuth Client ID/Secret (tuỳ chọn) | Supabase Dashboard |
| Gemini API key (spec sau) | `supabase secrets set` |
