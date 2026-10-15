# Linguo

Nền tảng học tiếng Anh và tiếng Hàn cá nhân hoá cho người Việt. Web app mobile-first (PWA) trên GitHub Pages, backend Supabase (Auth + Postgres + RLS + Edge Functions), CI/CD bằng GitHub Actions.

Site: https://nguyenngoctuyen11032003.github.io/Linguo/

## Trạng thái

Các spec 0–11 đã triển khai và đã vào production: nền móng, onboarding và lộ trình, bài học và trình học (có hàng đợi offline), flashcard FSRS, kiểm tra đầu vào thích ứng, gia sư AI (Gemini), kế hoạch phiên học, hoàn thiện trước ra mắt (xuất/xoá dữ liệu, quyền riêng tư, CSP, quét secret), tiến độ và động lực, luyện thi TOPIK/CEFR, nhắc học + Web Push + PWA, báo lỗi nội dung và khu quản trị `/quan-tri`. Sau đó đã thêm: luyện thi tính vào chuỗi ngày, bốn tác vụ AI mới (phân tích câu, tóm tắt phiên học, kế hoạch ôn, đóng vai hội thoại), luyện nói (`/app/luyen-noi`), từ vựng cá nhân nhập CSV (`/app/tu-vung-cua-toi`), gia cố nhắc học/Web Push và khu quản trị, tối ưu hiệu năng (route lazy, ngân sách kích thước bundle), cải thiện truy cập/UX và smoke check production. Chi tiết và danh sách migration: [docs/superpowers/HANDOFF.md](docs/superpowers/HANDOFF.md). Nội dung học của tiếng Anh (pre-A1 → C2) và tiếng Hàn (hangul → TOPIK 6) đã được duyệt (người duyệt là AI do chủ dự án uỷ quyền, chưa có giáo viên bản ngữ; xem [content/README.md](content/README.md)).

- Bản đồ từng tính năng (route, file, RPC, test): [docs/FEATURES.md](docs/FEATURES.md).
- Trạng thái từng spec, quyết định đã chốt, giới hạn đã biết và việc còn mở: [docs/superpowers/HANDOFF.md](docs/superpowers/HANDOFF.md).
- Danh sách kiểm tra trước khi ra mắt: [docs/RUNBOOK.md](docs/RUNBOOK.md#8-checklist-trước-khi-ra-mắt).

## Bắt đầu nhanh

Cần Node.js 22 và pnpm 10 (`corepack enable`; phiên bản pnpm ghim trong `package.json`). Docker chỉ cần cho test database local.

```bash
pnpm install
cp .env.example .env          # điền VITE_SUPABASE_URL và VITE_SUPABASE_PUBLISHABLE_KEY (project Supabase: docs/SETUP.md)
pnpm check-env                # kiểm tra các biến VITE_* (chặn nhầm secret)

pnpm dev                      # http://localhost:5173
pnpm test                     # unit test web + shared + script + kiểm tra migration đã deploy không bị sửa
pnpm lint && pnpm typecheck
pnpm build && pnpm check:bundle   # bản production + kiểm tra không lọt secret/source map
pnpm check:bundle-size        # sau pnpm build: ngân sách kích thước JS tải đầu (chunk vào 33 KiB, tổng 240 KiB gzip)
pnpm e2e                      # Playwright (build chế độ e2e, Supabase được mock; lần đầu: pnpm --filter @linguo/web exec playwright install chromium webkit)
```

Database local (Docker). **Chỉ chạy một stack Supabase tại một thời điểm.** Để chạy test database, dùng stack gọn:

```bash
pnpm exec supabase start -x studio,imgproxy,vector,logflare,edge-runtime,realtime,storage-api,mailpit,postgres-meta
pnpm db:test                  # pgTAP trong supabase/tests
pnpm db:lint                  # supabase db lint --fail-on error
pnpm db:reset                 # áp lại mọi migration + seed.sql trên stack local
pnpm db:stop
```

`pnpm db:start` (= `supabase start`) khởi động đủ dịch vụ. `pnpm db:types` sinh lại `packages/shared/src/database.types.ts` và cần `postgres-meta` (dùng `pnpm db:start`). Chi tiết (cổng 553xx, cổng bị Windows giữ, Windows/Git Bash, Gemini, VAPID, bootstrap admin, smoke check): [docs/SETUP.md](docs/SETUP.md).

## Tài liệu

- Đặc tả sản phẩm (PRD): [docs/superpowers/specs/Dac_ta_Linguo_English_Korean.md](docs/superpowers/specs/Dac_ta_Linguo_English_Korean.md)
- Thiết kế và kế hoạch từng spec: [docs/superpowers/specs/](docs/superpowers/specs/), [docs/superpowers/plans/](docs/superpowers/plans/)
- Bản đồ tính năng: [docs/FEATURES.md](docs/FEATURES.md) · Bàn giao: [docs/superpowers/HANDOFF.md](docs/superpowers/HANDOFF.md)
- Cài đặt local và các key cần cung cấp: [docs/SETUP.md](docs/SETUP.md)
- Deploy (CI/CD, secrets và biến, duyệt, ghi checksum migration, xuất bản nội dung, Notify, quản trị): [docs/DEPLOY.md](docs/DEPLOY.md)
- Vận hành (backup, rollback, xoay key, Gemini hết quota, tắt AI/nhắc học, log, smoke sau deploy, checklist ra mắt): [docs/RUNBOOK.md](docs/RUNBOOK.md)
- Kiểm thử thiết bị thật: [docs/MOBILE-QA.md](docs/MOBILE-QA.md) · Soạn nội dung: [content/README.md](content/README.md)

## Cấu trúc

```text
apps/web/            React 18 + Vite + Tailwind v4 + motion (SPA/PWA); src/sw.ts là service worker; tests/e2e là Playwright
packages/shared/     zod schema, hợp đồng RPC, thuật toán dùng chung (chấm điểm, FSRS, ước lượng, lập kế hoạch...), types sinh từ database
content/             nội dung học (YAML): chương trình en/ko, kho kiểm tra đầu vào, đề luyện thi, nguồn
supabase/            config.toml, migrations (+ migrations-applied.json), seed.sql (sinh từ content/), tests pgTAP, functions/
  functions/ai-tutor/        Edge Function gia sư AI (Deno, Gemini)
  functions/notify-dispatch/ Edge Function gửi nhắc học và Web Push (gọi bởi workflow Notify)
scripts/             content-import (kiểm/nhập nội dung), check-public-env, check-bundle-secrets, check-bundle-size, check-migrations-immutable, smoke (kiểm tra production sau deploy), sync-*-fixtures (ca kiểm thử SQL ↔ TS), sync-ai-contract, make-icons
design/brand/        tài nguyên thương hiệu
docs/                SETUP, DEPLOY, RUNBOOK, FEATURES, MOBILE-QA; superpowers/ (spec, kế hoạch, HANDOFF)
.github/workflows/   ci.yml, deploy.yml, content-publish.yml, maintenance.yml, notify.yml, smoke.yml
```

## Lệnh thường dùng

```bash
pnpm dev | pnpm test | pnpm e2e | pnpm lint | pnpm typecheck | pnpm build | pnpm preview | pnpm check:bundle | pnpm check:bundle-size | pnpm check-env | pnpm smoke
pnpm db:start | pnpm db:stop | pnpm db:reset | pnpm db:test | pnpm db:lint | pnpm db:types | pnpm icons
pnpm content:check | pnpm content:build | pnpm content:push
pnpm fixtures:sync | fixtures:grading | fixtures:fsrs | fixtures:diagnostic | fixtures:exam | pnpm ai:contract
```

`pnpm smoke` gọi site và Supabase thật, cần `SITE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` trong shell (chỉ đọc; xem [docs/RUNBOOK.md](docs/RUNBOOK.md#kiểm-tra-sau-deploy-smoke)). `pnpm content:push` nhập nội dung vào database hosted (cần `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` trong shell); bình thường dùng workflow **Publish content** (xem [docs/DEPLOY.md](docs/DEPLOY.md)).
