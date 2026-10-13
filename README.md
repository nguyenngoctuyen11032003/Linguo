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
content/           nội dung bài học (YAML), hướng dẫn soạn trong content/README.md
supabase/          config, migrations, seed.sql (sinh từ content/), pgTAP tests, (functions — spec sau)
scripts/           make-icons (logo/icon), check-public-env (chặn lộ secret), content-import (kiểm/nhập nội dung), sync-*-fixtures (ca kiểm thử SQL ↔ TS)
.github/workflows/ ci.yml, deploy.yml, content-publish.yml
```

## Lệnh thường dùng
```bash
pnpm dev | pnpm test | pnpm e2e | pnpm lint | pnpm typecheck | pnpm build
pnpm db:start | pnpm db:test | pnpm db:types | pnpm icons
pnpm content:check | pnpm content:build | pnpm fixtures:sync | pnpm fixtures:grading
```
