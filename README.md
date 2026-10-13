# Linguo

Nền tảng học tiếng Anh và tiếng Hàn cá nhân hoá cho người Việt. Web app mobile-first trên GitHub Pages, backend Supabase (Auth + Postgres + RLS), CI/CD bằng GitHub Actions.

Site: https://nguyenngoctuyen11032003.github.io/Linguo/

## Trạng thái

MVP (P0) đang hoàn thiện trước khi ra mắt (spec 7). Đã có:

- Tài khoản và RLS, onboarding, lộ trình học cho tiếng Anh và tiếng Hàn.
- Đánh giá đầu vào, bài học có chấm điểm, flashcard với lịch ôn FSRS.
- Gia sư AI (Gemini) chạy qua Edge Function: quota ngày theo tài khoản, giới hạn theo IP, cache, circuit breaker và phương án dự phòng khi AI lỗi.
- Bảo mật web: CSP chèn lúc build, chặn secret và source map trong bundle, gitleaks quét toàn bộ lịch sử Git.

Đang làm: kế hoạch phiên học, xuất/xoá dữ liệu tài khoản, trang quyền riêng tư và điều khoản, kiểm thử a11y. Danh sách kiểm tra trước khi ra mắt nằm trong [docs/RUNBOOK.md](docs/RUNBOOK.md#8-checklist-trước-khi-ra-mắt).

## Tài liệu

- Đặc tả sản phẩm (PRD): [docs/superpowers/specs/Dac_ta_Linguo_English_Korean.md](docs/superpowers/specs/Dac_ta_Linguo_English_Korean.md)
- Thiết kế từng spec: [docs/superpowers/specs/](docs/superpowers/specs/) (spec 0 nền móng → spec 7 hoàn thiện trước ra mắt)
- Cài đặt local và các key cần cung cấp: [docs/SETUP.md](docs/SETUP.md)
- Deploy (CI/CD, secrets, xuất bản nội dung): [docs/DEPLOY.md](docs/DEPLOY.md)
- Vận hành (backup, rollback, xoay key, Gemini hết quota, checklist ra mắt): [docs/RUNBOOK.md](docs/RUNBOOK.md)
- Kiểm thử thiết bị thật: [docs/MOBILE-QA.md](docs/MOBILE-QA.md) · Soạn nội dung: [content/README.md](content/README.md)

## Cấu trúc
```text
apps/web/          React + Vite + Tailwind v4 + motion (SPA)
packages/shared/   zod schema, hằng số, types sinh từ database
content/           nội dung bài học (YAML), hướng dẫn soạn trong content/README.md
supabase/          config, migrations, seed.sql (sinh từ content/), pgTAP tests, functions/ai-tutor (Deno)
scripts/           make-icons (logo/icon), check-public-env + check-bundle-secrets (chặn lộ secret), content-import (kiểm/nhập nội dung), sync-*-fixtures (ca kiểm thử SQL ↔ TS)
.github/workflows/ ci.yml, deploy.yml, content-publish.yml
```

## Lệnh thường dùng
```bash
pnpm dev | pnpm test | pnpm e2e | pnpm lint | pnpm typecheck | pnpm build | pnpm check:bundle
pnpm db:start | pnpm db:test | pnpm db:types | pnpm icons
pnpm content:check | pnpm content:build | pnpm fixtures:sync | pnpm fixtures:grading
```
