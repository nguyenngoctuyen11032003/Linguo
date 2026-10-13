# LexiPath — Spec 0: Nền móng (Foundation)

**Ngày:** 2026-10-13
**Trạng thái:** Đã duyệt thiết kế, chờ review văn bản
**Nguồn yêu cầu:** [Dac_ta_LexiPath_English_Korean.md](./Dac_ta_LexiPath_English_Korean.md) (PRD/SRS v1.0)
**Mô hình tham chiếu:** dự án `D:\Code\Tuyen\Note_mytasks` (GitHub Actions + GitHub Pages + Supabase, không server riêng)

---

## 1. Bối cảnh và phân rã

PRD quá lớn cho một spec. Chia thành các dự án con, mỗi dự án có spec → plan → triển khai riêng:

| # | Dự án con | Phụ thuộc |
|---|---|---|
| **0** | **Nền móng** (spec này) | — |
| 1 | Onboarding + learning paths (EN/KO, mục tiêu, thời lượng, ngày mục tiêu) | 0 |
| 2 | Nội dung + trình học bài (programs/units/lessons/items/exercises, seed "demo") | 1 |
| 3 | Flashcard + scheduler FSRS (`review_state`, chấm ôn qua RPC) | 2 |
| 4 | Bài kiểm tra đầu vào thích ứng | 2 |
| 5 | Gia sư AI Gemini (Edge Function, quota, cache, fallback không AI) | 0 |
| 6 | Kế hoạch phiên học + dashboard kỹ năng | 3, 4 |
| 7 | Hoàn thiện ra mắt (xóa tài khoản, báo lỗi nội dung, admin duyệt tối thiểu) | tất cả |

## 2. Mục tiêu spec 0

Một người dùng thật, trên điện thoại thật (iOS Safari / Android Chrome), mở URL GitHub Pages, xem landing page, đăng ký/đăng nhập (email hoặc Google), vào khung app, sửa tên hiển thị và giao diện, tải lại trang vẫn giữ nguyên. Mọi thay đổi được kiểm thử và deploy tự động bằng GitHub Actions.

**Ngoài phạm vi:** mọi tính năng học (dự án con 1–7), Edge Function AI, PWA offline/service worker, admin.

## 3. Quyết định đã chốt

| Chủ đề | Quyết định |
|---|---|
| Hosting | **Không server riêng.** Web tĩnh trên **GitHub Pages**; backend là **Supabase** hosted |
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS + `motion` (`motion/react`) + `lucide-react` + React Router |
| Backend | Supabase Auth + Postgres + RLS. Logic nghiệp vụ quan trọng (spec sau) nằm trong hàm Postgres (RPC); AI nằm trong Supabase Edge Function. **Không NestJS, không Next.js** |
| Supabase | **Project mới, riêng** cho LexiPath (không dùng chung với Note_mytasks/Fitora) |
| Đăng nhập | Email/mật khẩu (xác minh email, quên/đặt lại mật khẩu) + Google OAuth (nút tự ẩn nếu chưa cấu hình) |
| Phong cách | **Glass Path** (mục 6) |
| Logo | Script tách nền ca-rô của `logo.png` + vẽ mark SVG đơn giản cho favicon |
| Package manager | pnpm 10 workspaces, Node 22 LTS |

## 4. Kiến trúc

```
Trình duyệt (iOS / Android / desktop)
  └─ SPA tĩnh trên GitHub Pages (React + Vite)
       ├─ supabase-js (publishable key) ─► Supabase Auth (email + Google, PKCE)
       │                               └─► Postgres + RLS (chỉ dữ liệu của chính mình)
       └─ (spec 5) supabase.functions.invoke ─► Edge Function ─► Gemini
                                                (GEMINI_API_KEY chỉ trong Supabase secrets)
```

- Client chỉ giữ **publishable/anon key**. Không bao giờ có service-role key, DB password hay Gemini key trong biến `VITE_*`.
- Định tuyến: `BrowserRouter` với `basename = import.meta.env.BASE_URL`; Vite `base` lấy từ biến `VITE_BASE_PATH` (mặc định `/`, CI đặt `/<repo>/`). Fallback deep link: build copy `index.html` → `404.html`. Không dùng hash router vì Supabase PKCE trả `?code=` về `/auth/callback`.

## 5. Cấu trúc repo

```
apps/web/
  index.html
  public/icons/, public/brand/ (sinh bởi script), favicon.ico, manifest.webmanifest
  src/
    app/        main.tsx, App.tsx, router.tsx, providers (AuthProvider, ThemeProvider, MotionProvider)
    routes/     landing/, auth/, app/ (home, learn, review, tutor, more, settings), errors/
    features/   auth/ (hooks, error-map), profile/ (service), preferences/
    components/ ui/ (bộ component nền), layout/ (AppBar, BottomNav, Sidebar, MoreSheet)
    design/     tokens.css, motion.ts (EXPO_OUT, presets), fonts.css
    lib/        supabase.ts, env.ts, viewport.ts, cn.ts
  tests/        unit (Vitest), e2e (Playwright)
  vite.config.ts, playwright.config.ts, package.json (Tailwind v4 cấu hình bằng `@theme` trong CSS, không có tailwind.config)
packages/shared/
  src/ database.types.ts (sinh tự động), schemas.ts (zod), constants.ts (LanguageCode, Skill, Theme)
supabase/
  config.toml, migrations/, tests/ (pgTAP), functions/ (trống, dùng ở spec 5)
scripts/
  make-icons.mjs, check-public-env.mjs
design/brand/logo-source.png   (logo.png gốc, di chuyển vào đây)
.github/workflows/ ci.yml, deploy.yml
.github/dependabot.yml
docs/ SETUP.md, DEPLOY.md, MOBILE-QA.md
.env.example, .gitignore, package.json, pnpm-workspace.yaml, README.md
```

## 6. Hệ thống thiết kế "Glass Path"

Kết hợp 5 mẫu tham khảo (CARGOX, F1, Coffee profile, Church, Places/Unlock Pro), **dẫn dắt bởi màu logo** thay vì vàng CARGOX/F1.

### 6.1 Token màu (CSS variables trong `tokens.css`; Tailwind map vào)

Theme áp qua `data-theme="light|dark"` trên `<html>`; mặc định theo `prefers-color-scheme`. Landing luôn tối.

| Token | Tối | Sáng |
|---|---|---|
| `--bg` | `#0B1420` | `#F6F8FB` |
| `--surface` | `rgba(18,26,38,.78)` + `blur(16px)` + viền `rgba(255,255,255,.10)` | `#FFFFFF` + viền `#E3E8EF` |
| `--surface-solid` | `#121C29` | `#FFFFFF` |
| `--text` | `#EEF3F8` | `#0F1C2B` |
| `--muted` | `#9AA9B8` | `#5B6B7C` |
| `--primary` | `#4CA2D1` | `#276FA0` (5.4:1 trên trắng) |
| `--primary-strong` | `#3380B6` | `#1F5C86` |
| `--accent` (CTA) | `#F37D25` | `#F37D25` nền / `#C2560F` chữ |
| `--gold` (chỉ thành tích) | `#D9A13B` | `#B07D1E` |
| `--success` / `--warn` / `--error` | `#3FB67F` / `#E0A526` / `#EF6A5F` | `#1F7A50` / `#C98A0B` / `#D2453B` |

Quy tắc: màu trạng thái luôn kèm icon + chữ; văn bản dài đặt trên `--surface-solid`, không đặt trên kính mờ.

### 6.2 Typography

- **Be Vietnam Pro** 400/500/600/700/800 (subset `vietnamese` + `latin`): UI, nội dung, tiêu đề. Tiêu đề tracking `-0.03em`, line-height ≥ 1.05 (không dùng 0.82 của CARGOX vì dấu chồng Ữ/Ặ bị cắt).
- **Barlow Condensed 800**: chỉ chữ hero landing và số thống kê lớn; line-height ≥ 0.95.
- **Newsreader italic**: tối đa một từ nhấn trên landing.
- **Pretendard** (jsDelivr) → fallback **Noto Sans KR**: chỉ cho `:lang(ko)`, `word-break: keep-all`.
- Không dùng Albert Sans (không có subset tiếng Việt) và ITC Garamond (thương mại).
- Body 16px trên mobile (17–18px dành cho trang học bài ở spec sau). Font tải `display=swap`, preload Be Vietnam Pro 400/700.

### 6.3 Chuyển động (`design/motion.ts`)

- `EXPO_OUT = [0.16, 1, 0.3, 1]`, `EASE_OUT = [0.25, 0.46, 0.45, 0.94]`, `SPRING_POP = [0.34, 1.56, 0.64, 1]`.
- **Tầng nổi bật** (landing, khoảnh khắc ăn mừng): slide hai phía, speedReveal (skew + blur), blur-reveal (translateY 26px + blur 7px), line-draw (`pathLength`/`scaleX`), count-up (ease-out bậc 3, 2200ms), pop badge. Tối đa 1s. Reveal khi cuộn dùng `useInView({ once: true, margin: '0px 0px -60px 0px' })`. Hiệu ứng hero chỉ chạy khi video `canplay` + `document.fonts.ready`, hoặc sau 5s.
- **Tầng chức năng** (trong app): chỉ opacity/transform, 150–220ms.
- **Giảm chuyển động**: `MotionProvider` gộp `prefers-reduced-motion` và tùy chọn người dùng `reduce_motion`; khi bật, mọi preset chỉ còn opacity, count-up hiện số cuối, video không phát.
- Không dùng trong app: video nền, skew/blur entrance, liquid-glass `feDisplacementMap`.

### 6.4 Bộ component (`components/ui`)

`Button` (pill; primary/accent/ghost/glass; trạng thái loading khóa click), `ArrowCTA` (pill cam, đầu tròn có mũi tên xoay −135°→−90° khi hover), `Input` (pill, font ≥16px), `PasswordInput` (hiện/ẩn), `FormField` (label, mô tả, lỗi, `aria-describedby`), `GlassCard`, `SolidCard`, `Toast`, `Skeleton`, `EmptyState`, `ErrorState`, `OfflineBanner`, `CountUp`, `RouteLine` (SVG path tự vẽ + điểm mốc + mũi tên `animateMotion`), `LanguagePill` (chữ "EN ▾"/"KO ▾", không dùng cờ), `Spinner`.

Layout: `AppBar` (logo mark, LanguagePill, avatar), `BottomNav` 5 tab (Trang chủ, Học tập, Ôn tập, Gia sư AI, Thêm), `Sidebar` 7 mục trên desktop ≥1024px, `MoreSheet` (Luyện thi, Tiến độ, Cài đặt).

Mọi component tương tác: vùng chạm ≥44×44px, `:focus-visible` rõ (tương phản ≥3:1), nhãn cho screen reader.

### 6.5 Logo và icon (`scripts/make-icons.mjs`, dùng `sharp`)

- Đầu vào `design/brand/logo-source.png` (1024², RGBA nhưng alpha = 255 toàn bộ; nền ca-rô `#D6D6D6`/`#F9F9F7` bị vẽ vào pixel).
- Tách nền: flood-fill từ biên ảnh, xóa các pixel gần hai màu ca-rô nối liền với biên, giữ viền trắng của logo; làm mềm mép 1px; cắt bỏ artifact lấp lánh góc dưới phải; trim + padding → `public/brand/logo-full.png` (và `.webp`).
- `public/brand/logo-mark.svg`: vẽ tay, bong bóng "L" xanh `#4CA2D1` + đuôi cam `#F37D25`, không chữ.
- Sinh từ mark: `favicon.ico` (16/32/48), `icons/favicon-16.png`, `favicon-32.png`, `apple-touch-icon.png` (180, nền `#0B1420`), `icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png` (art trong vùng an toàn 80%, nền `#0B1420`), `manifest.webmanifest`.
- `theme-color` meta riêng cho light (`#F6F8FB`) và dark (`#0B1420`).
- Script chạy tay (`pnpm icons`), output được commit.

## 7. Màn hình

### 7.1 Landing `/` (luôn theme tối)

1. **Hero** (`min-height: 100svh`): nền CSS/SVG (gradient xanh/cam + lưới mờ) đóng vai poster; video `muted autoplay loop playsinline preload="metadata"` mờ dần lên trên khi `canplay`; gradient đáy tan vào `--bg`. Navbar: logo + "LexiPath" trượt từ trái; nút "Đăng nhập" + menu trượt từ phải. Tiêu đề Barlow Condensed: "HỌC THÔNG MINH" (trắng, từ trái) / "NHỚ LÂU HƠN" (xanh, căn phải, từ phải), delay 0 / 0.13s, 0.85s expo-out. Dòng phụ Be Vietnam Pro. `ArrowCTA` "Bắt đầu miễn phí" → `/dang-ky`.
   - Video: biến `VITE_HERO_VIDEO_URL` (tùy chọn); trống hoặc bật Save-Data / reduced-motion → chỉ hiện nền CSS/SVG. Không dùng video của các mẫu tham khảo.
2. **Lộ trình**: tiêu đề "MỘT LỘ TRÌNH" + phụ đề; `RouteLine` hai nhánh trên nền gradient xanh→cam nhạt: EN (Nền tảng → A1 → B1 → C1) và KO (Hangul → TOPIK I → TOPIK II); điểm mốc pop-in; 3 icon nổi (sách, tai nghe, bong bóng chat) dao động y vô hạn 2.5–3.3s.
3. **Phương pháp**: 3 `GlassCard` — Nhớ lại chủ động, Ôn tập ngắt quãng, Phản hồi có giải thích; blur-reveal lệch nhịp.
4. **Con số sản phẩm**: `CountUp` + gradient-fade numerals — "2 ngôn ngữ", "6 kỹ năng theo dõi" (từ vựng, ngữ pháp, đọc, nghe, viết, nói — PRD 5.3), "12 cấp độ mục tiêu" (CEFR A1–C2 + TOPIK 1–6). Chỉ số mô tả sản phẩm; **không** số người dùng/kết quả giả.
5. **Trưng bày thiết bị** (chỉ ≥900px): khung iPhone CSS (tỉ lệ 393:852, Dynamic Island, home indicator) chứa ảnh chụp màn hình app; ẩn dưới 900px.
6. **CTA cuối + footer**: "Bắt đầu lộ trình của bạn" + `ArrowCTA`; liên kết Quyền riêng tư, Điều khoản (`/quyen-rieng-tu`, `/dieu-khoan` — trang tạm ghi rõ "bản nháp"); © 2026 LexiPath.

### 7.2 Xác thực (theme theo cài đặt; nền gradient tĩnh xanh→cam độ mờ thấp)

- `/dang-ky`: tên hiển thị (tùy chọn), email, mật khẩu (≥8 ký tự, hiện chỉ dẫn), nút Google → màn "Kiểm tra email".
- `/dang-nhap`: email, mật khẩu, "Quên mật khẩu?", nút Google; hỗ trợ `?next=` để quay lại trang cũ (chỉ chấp nhận đường dẫn nội bộ).
- `/quen-mat-khau` → gửi email đặt lại; luôn hiện thông báo trung tính (không lộ email có tồn tại hay không).
- `/dat-lai-mat-khau`: nhập mật khẩu mới (sau khi vào từ link email).
- `/auth/callback`: `exchangeCodeForSession` → chuyển về `next` hoặc `/app`.
- Đã đăng nhập mà vào trang auth → chuyển `/app`.

### 7.3 Khung app `/app/*` (cần đăng nhập; chưa đăng nhập → `/dang-nhap?next=…`)

- `/app` Trang chủ: lời chào theo `display_name`; `EmptyState` "Bắt đầu lộ trình đầu tiên" (CTA vô hiệu kèm nhãn "Sắp ra mắt"); không hiển thị số tiến độ.
- `/app/hoc-tap`, `/app/on-tap`, `/app/gia-su`, `/app/luyen-thi`, `/app/tien-do`: `EmptyState` "Sắp ra mắt".
- `/app/cai-dat`: tên hiển thị, múi giờ (mặc định từ `Intl`), giao diện Sáng/Tối/Hệ thống, Giảm chuyển động, Đăng xuất. Lưu qua supabase-js; thành công → Toast; lỗi → giữ giá trị đã nhập + nút thử lại.
- `LanguagePill` ở spec này chỉ hiển thị "EN" và mở menu với mục "Tiếng Hàn — sắp ra mắt" (logic chuyển lộ trình ở spec 1).
- Route không tồn tại → trang 404 có nút về trang chủ.

## 8. Dữ liệu (Supabase)

Migration `supabase/migrations/<ts>_foundation.sql`:

- `public.profiles`: `id uuid pk references auth.users on delete cascade`, `display_name text check (char_length <= 60)`, `locale text default 'vi'`, `timezone text default 'Asia/Ho_Chi_Minh'`, `created_at`, `updated_at timestamptz default now()`.
- `public.user_preferences`: `user_id uuid pk references auth.users on delete cascade`, `theme text check in ('light','dark','system') default 'system'`, `reduce_motion boolean default false`, `updated_at`.
- Trigger `on_auth_user_created` (security definer, `search_path = ''`): tạo `profiles` (lấy `display_name` từ `raw_user_meta_data`) + `user_preferences`.
- Trigger `set_updated_at` cho hai bảng.
- RLS bật cho cả hai bảng; policy `select` và `update` với `auth.uid() = id` / `auth.uid() = user_id`; không cho `insert`/`delete` từ client (trigger và cascade lo).
- `supabase/tests/foundation.test.sql` (pgTAP): trigger tạo đủ bản ghi; user A không select/update được bản ghi user B; anon không đọc được gì.
- `config.toml`: auth local (site_url `http://localhost:5173`, redirect `http://localhost:5173/**`), Google provider đọc từ `env()` và `enabled = false` mặc định ở local.
- Types: `supabase gen types typescript --local > packages/shared/src/database.types.ts`.

## 9. Tương thích mobile (bắt buộc)

- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">`; không tắt zoom.
- `env(safe-area-inset-top/bottom/left/right)` cho AppBar, BottomNav, hero navbar, MoreSheet và khi xoay ngang.
- Chiều cao: hero `min-height: 100vh; min-height: 100svh`; khung app `height: 100vh; height: 100dvh`.
- Input font-size ≥16px; `autocomplete`, `inputmode`, `enterkeyhint` đúng; `lib/viewport.ts` dùng `visualViewport` để cuộn ô đang focus vào tầm nhìn khi bàn phím iOS mở.
- Vùng chạm ≥44×44px, khoảng cách ≥8px; `-webkit-tap-highlight-color: transparent` + trạng thái pressed riêng.
- `backdrop-filter` + `-webkit-backdrop-filter`, `@supports not` → nền đặc; ≤3 lớp blur/màn hình, blur ≤16px, không animate blur.
- `overscroll-behavior: contain` cho sheet.
- Không có chiều cao cố định trên nút/thẻ chứa chữ; `text-wrap: balance` cho tiêu đề; `overflow-wrap: break-word`.
- Bề rộng tối thiểu hỗ trợ 320px; không cuộn ngang ở mọi màn hình.
- Container queries chỉ dùng như cải tiến (có fallback media query).

## 10. Xử lý lỗi

| Tình huống | Hành vi |
|---|---|
| Thiếu `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` | Landing vẫn chạy; trang auth/app hiện "Chưa cấu hình Supabase" + hướng dẫn `docs/SETUP.md` |
| Lỗi Auth | `features/auth/error-map.ts` map mã lỗi Supabase → câu tiếng Việt; mã lạ → thông báo chung + mã lỗi |
| Submit nhiều lần | Nút khóa khi đang gửi |
| Mất mạng | `OfflineBanner` (sự kiện `online`/`offline`); thao tác lưu thất bại → lỗi + thử lại; không báo thành công giả |
| Lỗi render | `ErrorBoundary` theo route, nút tải lại |
| Video/font lỗi | Poster; animation chạy sau timeout 5s |
| Google chưa cấu hình | Ẩn nút khi `VITE_AUTH_GOOGLE_ENABLED !== 'true'` |
| Phiên hết hạn | supabase-js tự refresh; thất bại → về `/dang-nhap?next=…` |

## 11. CI/CD (GitHub Actions)

### `ci.yml` — `pull_request`, `workflow_dispatch`, `workflow_call`; concurrency hủy run cũ của PR

- **web**: checkout → pnpm (`pnpm/action-setup`) + Node 22 (cache pnpm) → `pnpm install --frozen-lockfile` → `node scripts/check-public-env.mjs` → lint (ESLint) → typecheck (`tsc -b`) → Vitest → build.
- **e2e**: build → Playwright (`vite preview`) với projects: iPhone SE, iPhone 15 Pro, iPhone 15 Pro Max, Pixel 7, Galaxy S9+ (360px), iPhone 15 Pro landscape; trình duyệt WebKit + Chromium. Upload report khi lỗi.
- **database**: `supabase/setup-cli` (ghim version) → `supabase start -x studio,imgproxy,vector,logflare,edge-runtime,realtime,postgres-meta,supavisor` → `supabase db lint --fail-on error` → `supabase test db` → sinh types và `git diff --exit-code packages/shared/src/database.types.ts` → `supabase stop`.

### `deploy.yml` — `push` lên `main`, `workflow_dispatch` (input `migrate`, `functions`); concurrency `deploy-production`, không hủy

1. `verify`: gọi `ci.yml`.
2. `changes`: so `before..after` cho `supabase/migrations` và `supabase/functions` (như Note_mytasks).
3. `migrate` (nếu có migration; environment `production` có Required reviewers): `supabase link` → `db push --dry-run` → `db push --yes`. Chỉ `db push`; không bao giờ `db reset`/`config push`/seed lên hosted.
4. `functions` (nếu `supabase/functions/**` đổi, sau migrate): `supabase functions deploy`.
5. `build`: `VITE_*` từ GitHub Variables, `VITE_BASE_PATH=/${{ github.event.repository.name }}/` → `check-public-env.mjs --strict` → build → copy `404.html` → `upload-pages-artifact`.
6. `pages`: `deploy-pages`.

`dependabot.yml`: npm (thư mục gốc) + github-actions, hàng tuần.

## 12. Biến môi trường và thông tin người dùng cần cung cấp

`.env.example` (root, dùng cho `apps/web` qua `envDir`) và `docs/SETUP.md` hướng dẫn lấy từng giá trị.

| Biến | Nơi đặt | Public? | Bắt buộc spec 0 |
|---|---|---|---|
| `VITE_SUPABASE_URL` | `.env` + GitHub Variables | Có | Có |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env` + GitHub Variables | Có | Có |
| `VITE_SITE_URL` (vd `https://<user>.github.io/<repo>`) | `.env` + GitHub Variables | Có | Có |
| `VITE_AUTH_GOOGLE_ENABLED` | `.env` + GitHub Variables | Có | Không (mặc định `false`) |
| `VITE_HERO_VIDEO_URL` | `.env` + GitHub Variables | Có | Không |
| `SUPABASE_PROJECT_ID` | GitHub Variables | Có | Có |
| `SUPABASE_ACCESS_TOKEN` | GitHub Secrets (env `production`) | Không | Có |
| `SUPABASE_DB_PASSWORD` | GitHub Secrets (env `production`) | Không | Có |
| Google OAuth Client ID/Secret | Supabase Dashboard → Auth → Providers | Không | Không |
| Site URL + Redirect URLs | Supabase Dashboard → Auth → URL Configuration | — | Có |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_DAILY_USER_LIMIT=20`, `GEMINI_MAX_OUTPUT_TOKENS=1200`, `GEMINI_TIMEOUT_MS=20000` | Supabase secrets (`supabase secrets set`) | Không | Không (spec 5; khai báo sẵn trong `.env.example`, phần comment "server-only") |

`check-public-env.mjs` fail build nếu key là `sb_secret_…`/JWT role ≠ `anon`, hoặc có biến `VITE_*` chứa SECRET/PASSWORD/SERVICE_ROLE/PRIVATE/DATABASE/GEMINI.

Bước thủ công một lần (ghi trong `docs/DEPLOY.md`): tạo repo GitHub public; Settings → Pages → Source = GitHub Actions; tạo environment `production` + Required reviewers; tạo project Supabase (region Singapore); đặt Variables/Secrets; cấu hình URL Auth; (tùy chọn) Google OAuth.

## 13. Kiểm thử

- **Vitest** (`happy-dom`): `error-map`, `env` (phát hiện thiếu cấu hình), `ThemeProvider` (system/light/dark), `MotionProvider` (gộp reduced-motion), `RequireAuth` (chuyển hướng + `next` an toàn), form đăng nhập/đăng ký (validate, khóa submit), service preferences (mock supabase).
- **pgTAP**: mục 8.
- **Playwright** (mọi project ở mục 11): landing không cuộn ngang (`scrollWidth <= innerWidth`); BottomNav nằm trên safe area; font-size input ≥16px; vùng chạm ≥44px trên các nút chính; route guard; ảnh chụp landing + đăng nhập + app home ở light/dark đính kèm vào báo cáo Playwright để xem bằng mắt (không so pixel tự động vì baseline Windows/Linux khác nhau); `@axe-core/playwright` không có vi phạm mức serious/critical. Test e2e không gọi Supabase thật: build e2e dùng `VITE_SUPABASE_URL=https://e2e.invalid` + key giả dạng `sb_publishable_e2e`, và mọi request tới host đó được mock bằng `page.route`.
- **Kiểm tra tay** (`docs/MOBILE-QA.md`): iOS Safari thật, Android Chrome thật, Samsung Internet; bàn phím mở/đóng; xoay màn hình; VoiceOver/TalkBack; phóng chữ 200%; bật reduced-motion.

## 14. Tiêu chí hoàn thành

1. Push lên `main` → CI xanh → (duyệt) migration → GitHub Pages cập nhật, không thao tác tay.
2. Trên điện thoại thật: đăng ký email → xác minh → đăng nhập (hoặc Google nếu đã cấu hình) → sửa tên hiển thị + theme → tải lại vẫn giữ.
3. pgTAP RLS A/B pass; bundle không chứa secret (`check-public-env --strict` + grep bundle trong CI không thấy `sb_secret_`).
4. CI xanh cho lint, typecheck, Vitest, Playwright mobile, database.
5. `.env.example`, `docs/SETUP.md`, `docs/DEPLOY.md`, `docs/MOBILE-QA.md`, `README.md` đầy đủ và khớp với workflow.
