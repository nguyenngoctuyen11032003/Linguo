# Cài đặt LexiPath trên máy

## Cần có
- Node.js 22 (`node -v`), pnpm 10 (`corepack enable && corepack prepare pnpm@10.34.6 --activate`)
- Docker Desktop (chỉ cần cho test database local)

## 1. Cài phụ thuộc
```bash
pnpm install
```

## 2. Tạo project Supabase (một lần)
1. supabase.com → **New project**. Tên `lexipath`, region **Southeast Asia (Singapore)**. Lưu lại **Database password**.
2. **Project Settings → API Keys**: copy **Project URL** và **Publishable key** (`sb_publishable_…`).
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

## 5. Đăng nhập Google (tuỳ chọn)
1. console.cloud.google.com → APIs & Services → **Credentials → Create OAuth client ID → Web application**.
2. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Supabase → **Authentication → Providers → Google**: dán Client ID và Client Secret, bật.
4. Đặt `VITE_AUTH_GOOGLE_ENABLED=true` trong `.env` và trong GitHub Variables.

## 6. Chạy
```bash
pnpm dev            # http://localhost:5173
pnpm test           # unit tests
pnpm e2e            # Playwright trên các thiết bị iPhone/Android giả lập
pnpm db:start && pnpm db:test   # database local + test RLS (cần Docker)
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
