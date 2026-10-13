# Linguo

Nền tảng học tiếng Anh và tiếng Hàn cá nhân hoá cho người Việt. Web app mobile-first trên GitHub Pages, backend Supabase (Auth + Postgres + RLS), CI/CD bằng GitHub Actions.

- Đặc tả sản phẩm: [docs/superpowers/specs/Dac_ta_Linguo_English_Korean.md](docs/superpowers/specs/Dac_ta_Linguo_English_Korean.md)
- Thiết kế spec 0 (nền móng): [docs/superpowers/specs/2026-10-13-linguo-foundation-design.md](docs/superpowers/specs/2026-10-13-linguo-foundation-design.md)
- Cài đặt local và các key cần cung cấp: [docs/SETUP.md](docs/SETUP.md)
- Deploy: [docs/DEPLOY.md](docs/DEPLOY.md) · Kiểm thử thiết bị thật: [docs/MOBILE-QA.md](docs/MOBILE-QA.md)

## Cấu trúc
```text
apps/web/          React + Vite + Tailwind v4 + motion (SPA)
packages/shared/   zod schema, hằng số, types sinh từ database
supabase/          config, migrations, pgTAP tests, (functions — spec sau)
scripts/           make-icons (logo/icon), check-public-env (chặn lộ secret)
.github/workflows/ ci.yml, deploy.yml
```

## Lệnh thường dùng
```bash
pnpm dev | pnpm test | pnpm e2e | pnpm lint | pnpm typecheck | pnpm build
pnpm db:start | pnpm db:test | pnpm db:types | pnpm icons
```
