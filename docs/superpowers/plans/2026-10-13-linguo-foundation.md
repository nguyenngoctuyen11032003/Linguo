# Linguo Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Linguo foundation: a pnpm monorepo with a mobile-first React SPA (landing, auth, app shell, settings) on GitHub Pages, backed by a new Supabase project (Auth + Postgres + RLS), with CI/CD in GitHub Actions.

**Architecture:** Static SPA (Vite + React 18 + TS + Tailwind v4 + motion) talks directly to Supabase with the publishable key; Row Level Security protects data. No custom server. GitHub Actions runs lint/typecheck/unit/e2e/database tests on PRs and, on `main`, applies migrations (after approval) and deploys to GitHub Pages. Pattern copied from `D:\Code\Tuyen\Note_mytasks`.

**Tech Stack:** pnpm 10 workspaces, Node 22, Vite, React 18.3, TypeScript (strict), Tailwind CSS v4 (`@tailwindcss/vite`), `motion` (`motion/react`), `lucide-react`, `react-router` v7, `@supabase/supabase-js` v2, `zod`, Vitest + happy-dom + Testing Library, Playwright + `@axe-core/playwright`, Supabase CLI 2.120.0 + pgTAP, `sharp` (icon script).

**Spec:** [docs/superpowers/specs/2026-10-13-linguo-foundation-design.md](../specs/2026-10-13-linguo-foundation-design.md) — read it first.

---

## Ground rules for every task

- Repo root: `D:\Code\Tuyen\Linguo`. Work on branch `feat/foundation` (create it from `docs/foundation-spec` in Task 1). Never commit to `main`.
- Shell: use the **Bash** tool (Git Bash) for all commands below; they are POSIX.
- Commits: Conventional Commits, Vietnamese or English. **Do not add `Co-Authored-By` trailers.** Never commit `.env`.
- TypeScript uses `verbatimModuleSyntax`: import types with `import type`.
- UI text is Vietnamese. Keep diacritics exactly as written.
- Path alias: `@/` = `apps/web/src/`.
- If a command's output differs from "Expected", stop and fix before moving on.

## File map

```
.gitattributes .nvmrc .npmrc package.json pnpm-workspace.yaml tsconfig.base.json eslint.config.js
.env.example .env.e2e README.md
design/brand/logo-source.png                       (moved from logo.png)
scripts/make-icons.mjs                              logo cut-out + icon set
scripts/check-public-env.mjs (+ .test.mjs)          block secrets in VITE_*
packages/shared/  package.json tsconfig.json src/{index,constants,schemas,database.types}.ts src/schemas.test.ts
supabase/config.toml  migrations/20261013000100_foundation.sql  tests/foundation.test.sql
apps/web/
  package.json index.html vite.config.ts tsconfig.json tsconfig.node.json playwright.config.ts
  public/ favicon.ico manifest.webmanifest brand/{logo-full.png,logo-full.webp,logo-mark.svg} icons/*
  src/
    app/        main.tsx App.tsx router.tsx
    design/     global.css tokens.css motion.ts (+ motion.test.ts)
    lib/        cn.ts env.ts storage.ts asset.ts viewport.ts useOnline.ts useMediaQuery.ts useSaveData.ts supabase.ts (+ tests)
    providers/  ThemeProvider.tsx MotionProvider.tsx (+ tests)
    components/ui/      Button Spinner Input PasswordInput FormField GlassCard SolidCard EmptyState ErrorState
                        Skeleton Toast OfflineBanner CountUp RouteLine ArrowCTA LanguagePill (+ tests)
    components/layout/  nav.ts AppBar BottomNav Sidebar MoreSheet AppLayout AuthLayout RootLayout
                        NotConfigured FullScreenLoader (+ tests)
    features/auth/      AuthProvider.tsx guards.tsx error-map.ts safe-next.ts GoogleButton.tsx (+ tests)
    features/profile/   service.ts ProfileProvider.tsx (+ tests)
    features/preferences/ service.ts usePreferencesSync.ts (+ tests)
    routes/auth/        SignInPage SignUpPage CheckEmailPage ForgotPasswordPage ResetPasswordPage AuthCallbackPage (+ tests)
    routes/app/         HomePage ComingSoonPage SettingsPage (+ tests)
    routes/landing/     LandingPage LandingNav HeroSection HeroBackdrop useHeroReady RouteSection MethodSection
                        StatsSection ShowcaseSection FinalCtaSection (+ tests)
    routes/             LegalPage NotFoundPage RouteError
  tests/unit/  setup.ts render.tsx fake-supabase.ts
  tests/e2e/   fixtures.ts layout.spec.ts forms.spec.ts guard.spec.ts a11y.spec.ts screenshots.spec.ts
.github/workflows/ci.yml deploy.yml   .github/dependabot.yml
docs/SETUP.md docs/DEPLOY.md docs/MOBILE-QA.md
```

---

## Phase A — Workspace

### Task 1: Root workspace and tooling

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `.npmrc`, `.nvmrc`, `.gitattributes`, `tsconfig.base.json`, `eslint.config.js`
- Modify: `.gitignore`
- Move: `logo.png` → `design/brand/logo-source.png`

- [ ] **Step 1: Create the branch**

```bash
cd /d/Code/Tuyen/Linguo
git checkout docs/foundation-spec
git checkout -b feat/foundation
```

- [ ] **Step 2: Write root config files**

`package.json`:
```json
{
  "name": "linguo",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.34.6",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "pnpm --filter @linguo/web dev",
    "build": "pnpm --filter @linguo/web build",
    "preview": "pnpm --filter @linguo/web preview",
    "lint": "eslint .",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "e2e": "pnpm --filter @linguo/web e2e",
    "icons": "node scripts/make-icons.mjs",
    "check-env": "node scripts/check-public-env.mjs",
    "db:start": "supabase start",
    "db:stop": "supabase stop",
    "db:reset": "supabase db reset",
    "db:test": "supabase test db",
    "db:lint": "supabase db lint --fail-on error",
    "db:types": "supabase gen types typescript --local --schema public > packages/shared/src/database.types.ts"
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - apps/*
  - packages/*
onlyBuiltDependencies:
  - esbuild
  - sharp
  - supabase
```

`.npmrc`:
```
auto-install-peers=true
strict-peer-dependencies=false
```

`.nvmrc`:
```
22
```

`.gitattributes`:
```
* text=auto eol=lf
*.png binary
*.webp binary
*.ico binary
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

`eslint.config.js`:
```js
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'packages/shared/src/database.types.ts',
      'supabase/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/web/src/**/*.{ts,tsx}', 'apps/web/tests/unit/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['scripts/**/*.mjs', '**/*.config.{js,ts}', 'apps/web/tests/e2e/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
);
```

Append to `.gitignore`:
```
!.env.e2e
```

- [ ] **Step 3: Move the logo and install root dev dependencies**

```bash
mkdir -p design/brand && git mv logo.png design/brand/logo-source.png
pnpm add -Dw typescript eslint @eslint/js globals typescript-eslint eslint-plugin-react-hooks eslint-plugin-react-refresh sharp supabase@2.120.0
```
Expected: install succeeds. If pnpm prints "Ignored build scripts", run `pnpm approve-builds` and approve `esbuild`, `sharp`, `supabase`.

- [ ] **Step 4: Verify the Supabase CLI is wired**

Run: `pnpm exec supabase --version`
Expected: `2.120.0`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: set up pnpm workspace, TypeScript base config and ESLint"
```

---

### Task 2: `packages/shared` — constants and zod schemas

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/constants.ts`, `packages/shared/src/schemas.ts`, `packages/shared/src/index.ts`
- Test: `packages/shared/src/schemas.test.ts`

- [ ] **Step 1: Package scaffolding**

`packages/shared/package.json`:
```json
{
  "name": "@linguo/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

`packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true, "types": [] },
  "include": ["src"]
}
```

```bash
pnpm --filter @linguo/shared add zod
pnpm --filter @linguo/shared add -D vitest typescript
```

- [ ] **Step 2: Write the failing test** — `packages/shared/src/schemas.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import {
  fieldErrors,
  isValidTimeZone,
  preferencesUpdateSchema,
  profileUpdateSchema,
  signInSchema,
  signUpSchema,
} from './schemas';
import { LANGUAGES, SKILLS } from './constants';

describe('signUpSchema', () => {
  it('accepts a valid sign-up and trims fields', () => {
    const r = signUpSchema.parse({ displayName: '  Minh Anh ', email: ' a@b.vn ', password: 'matkhau123' });
    expect(r).toEqual({ displayName: 'Minh Anh', email: 'a@b.vn', password: 'matkhau123' });
  });

  it('rejects short passwords and bad emails with Vietnamese messages', () => {
    const r = signUpSchema.safeParse({ displayName: '', email: 'khong-phai-email', password: '123' });
    expect(r.success).toBe(false);
    if (r.success) return;
    const errors = fieldErrors(r.error);
    expect(errors.email).toBe('Email không hợp lệ.');
    expect(errors.password).toBe('Mật khẩu cần ít nhất 8 ký tự.');
  });

  it('rejects display names longer than 60 characters', () => {
    const r = signUpSchema.safeParse({ displayName: 'a'.repeat(61), email: 'a@b.vn', password: 'matkhau123' });
    expect(r.success).toBe(false);
  });
});

describe('signInSchema', () => {
  it('requires a password', () => {
    const r = signInSchema.safeParse({ email: 'a@b.vn', password: '' });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(fieldErrors(r.error).password).toBe('Vui lòng nhập mật khẩu.');
  });
});

describe('profile and preferences', () => {
  it('validates IANA time zones', () => {
    expect(isValidTimeZone('Asia/Ho_Chi_Minh')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(profileUpdateSchema.safeParse({ displayName: 'An', timezone: 'Mars/Olympus' }).success).toBe(false);
  });

  it('accepts only known themes', () => {
    expect(preferencesUpdateSchema.safeParse({ theme: 'dark', reduceMotion: true }).success).toBe(true);
    expect(preferencesUpdateSchema.safeParse({ theme: 'blue', reduceMotion: true }).success).toBe(false);
  });
});

describe('constants', () => {
  it('has six skills and Korean marked as not yet available', () => {
    expect(SKILLS).toHaveLength(6);
    expect(LANGUAGES.en.available).toBe(true);
    expect(LANGUAGES.ko.available).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @linguo/shared test`
Expected: FAIL — cannot resolve `./schemas`.

- [ ] **Step 4: Implement**

`packages/shared/src/constants.ts`:
```ts
export const LANGUAGE_CODES = ['en', 'ko'] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];

export interface LanguageInfo {
  code: LanguageCode;
  short: string;
  nameVi: string;
  nativeName: string;
  available: boolean;
}

export const LANGUAGES: Record<LanguageCode, LanguageInfo> = {
  en: { code: 'en', short: 'EN', nameVi: 'Tiếng Anh', nativeName: 'English', available: true },
  ko: { code: 'ko', short: 'KO', nameVi: 'Tiếng Hàn', nativeName: '한국어', available: false },
};

export const THEMES = ['light', 'dark', 'system'] as const;
export type ThemePreference = (typeof THEMES)[number];

/** PRD 5.3: vocabulary, grammar, reading, listening, writing, speaking/pronunciation. */
export const SKILLS = ['vocabulary', 'grammar', 'reading', 'listening', 'writing', 'speaking'] as const;
export type Skill = (typeof SKILLS)[number];

export const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';
export const DISPLAY_NAME_MAX = 60;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;
```

`packages/shared/src/schemas.ts`:
```ts
import { z } from 'zod';
import { DISPLAY_NAME_MAX, PASSWORD_MAX, PASSWORD_MIN, THEMES } from './constants';

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const emailSchema = z
  .string()
  .trim()
  .min(1, { message: 'Vui lòng nhập email.' })
  .email({ message: 'Email không hợp lệ.' });

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, { message: `Mật khẩu cần ít nhất ${PASSWORD_MIN} ký tự.` })
  .max(PASSWORD_MAX, { message: `Mật khẩu tối đa ${PASSWORD_MAX} ký tự.` });

export const displayNameSchema = z
  .string()
  .trim()
  .max(DISPLAY_NAME_MAX, { message: `Tên hiển thị tối đa ${DISPLAY_NAME_MAX} ký tự.` });

export const timezoneSchema = z
  .string()
  .min(1, { message: 'Vui lòng chọn múi giờ.' })
  .max(64)
  .refine(isValidTimeZone, { message: 'Múi giờ không hợp lệ.' });

export const themeSchema = z.enum(THEMES);

export const signUpSchema = z.object({
  displayName: displayNameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { message: 'Vui lòng nhập mật khẩu.' }),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: 'Mật khẩu nhập lại không khớp.', path: ['confirm'] });

export const profileUpdateSchema = z.object({
  displayName: displayNameSchema,
  timezone: timezoneSchema,
});

export const preferencesUpdateSchema = z.object({
  theme: themeSchema,
  reduceMotion: z.boolean(),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type PreferencesUpdateInput = z.infer<typeof preferencesUpdateSchema>;

/** First message per top-level field, e.g. `{ email: 'Email không hợp lệ.' }`. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_form');
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
```

`packages/shared/src/index.ts`:
```ts
export * from './constants';
export * from './schemas';
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @linguo/shared test && pnpm --filter @linguo/shared typecheck`
Expected: all tests PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/shared pnpm-lock.yaml
git commit -m "feat(shared): add language constants and zod validation schemas"
```

---

### Task 3: `apps/web` scaffold (Vite + React + Tailwind + Vitest)

**Files:**
- Create: `apps/web/package.json`, `apps/web/index.html`, `apps/web/vite.config.ts`, `apps/web/tsconfig.json`, `apps/web/tsconfig.node.json`, `apps/web/src/app/main.tsx`, `apps/web/src/vite-env.d.ts`, `apps/web/tests/unit/setup.ts`, `apps/web/tests/unit/match-media.ts`

- [ ] **Step 1: Package and dependencies**

`apps/web/package.json`:
```json
{
  "name": "@linguo/web",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "build:e2e": "vite build --mode e2e",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json && tsc -p tsconfig.node.json",
    "e2e": "playwright test"
  }
}
```

```bash
pnpm --filter @linguo/web add react@^18.3.1 react-dom@^18.3.1 react-router@^7 motion@^12 lucide-react @supabase/supabase-js@^2 zod "@linguo/shared@workspace:*"
pnpm --filter @linguo/web add -D vite @vitejs/plugin-react tailwindcss @tailwindcss/vite typescript @types/react@^18 @types/react-dom@^18 @types/node vitest happy-dom @testing-library/react @testing-library/dom @testing-library/user-event @testing-library/jest-dom @playwright/test @axe-core/playwright
```

- [ ] **Step 2: TypeScript configs**

`apps/web/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "noEmit": true,
    "types": ["vite/client", "vitest/globals", "@testing-library/jest-dom"],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src", "tests/unit"]
}
```

`apps/web/tsconfig.node.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true, "types": ["node"], "lib": ["ES2022", "DOM"] },
  "include": ["vite.config.ts", "playwright.config.ts", "tests/e2e"]
}
```

`apps/web/src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_SITE_URL?: string;
  readonly VITE_AUTH_GOOGLE_ENABLED?: string;
  readonly VITE_HERO_VIDEO_URL?: string;
  readonly VITE_BASE_PATH?: string;
}
```

- [ ] **Step 3: Vite config** — `apps/web/vite.config.ts`

```ts
/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const rootDir = fileURLToPath(new URL('../..', import.meta.url));

/** GitHub Pages serves 404.html for unknown paths; make it the SPA shell so deep links work. */
function spaFallback(): Plugin {
  let outDir = 'dist';
  return {
    name: 'linguo-spa-fallback',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      copyFileSync(resolve(outDir, 'index.html'), resolve(outDir, '404.html'));
    },
  };
}

function normalizeBase(value: string | undefined): string {
  if (!value) return '/';
  let base = value.trim();
  if (!base.startsWith('/')) base = `/${base}`;
  if (!base.endsWith('/')) base = `${base}/`;
  return base;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, 'VITE_');
  return {
    base: normalizeBase(env.VITE_BASE_PATH),
    envDir: rootDir,
    plugins: [react(), tailwindcss(), spaFallback()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: { port: 5173, strictPort: true },
    preview: { port: 4173, strictPort: true },
    build: { target: 'es2020', sourcemap: false },
    test: {
      environment: 'happy-dom',
      globals: true,
      setupFiles: ['./tests/unit/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: false,
    },
  };
});
```

- [ ] **Step 4: HTML shell** — `apps/web/index.html`

```html
<!doctype html>
<html lang="vi" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content"
    />
    <title>Linguo — Học tiếng Anh & tiếng Hàn thông minh</title>
    <meta
      name="description"
      content="Lộ trình tiếng Anh và tiếng Hàn cá nhân hoá cho người Việt: nhớ lại chủ động, ôn tập ngắt quãng, phản hồi có giải thích."
    />
    <meta name="color-scheme" content="light dark" />
    <meta name="theme-color" content="#F6F8FB" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#0B1420" media="(prefers-color-scheme: dark)" />
    <meta name="format-detection" content="telephone=no" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@800&family=Be+Vietnam+Pro:wght@400;500;600;700;800&family=Newsreader:ital,opsz,wght@1,6..72,400&family=Noto+Sans+KR:wght@400;600;700&display=swap"
    />
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
    />
    <script>
      (function () {
        try {
          var p = localStorage.getItem('lp-theme');
          var dark = p === 'dark' || ((!p || p === 'system') && matchMedia('(prefers-color-scheme: dark)').matches);
          document.documentElement.dataset.theme = dark ? 'dark' : 'light';
          if (localStorage.getItem('lp-reduce-motion') === 'true') document.documentElement.dataset.reduceMotion = 'true';
        } catch (e) {}
      })();
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/app/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Temporary entry + test setup**

`apps/web/src/app/main.tsx` (replaced in Task 18):
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <p>Linguo</p>
  </StrictMode>,
);
```

`apps/web/tests/unit/match-media.ts`:
```ts
/** Replace window.matchMedia so `query` matches when `matches(query)` is true. */
export function stubMatchMedia(matches: (query: string) => boolean): void {
  window.matchMedia = (query: string) =>
    ({
      matches: matches(query),
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
```

`apps/web/tests/unit/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { stubMatchMedia } from './match-media';

beforeEach(() => stubMatchMedia(() => false));

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.reduceMotion;
});

class NoopIntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: number[] = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
if (!('IntersectionObserver' in globalThis)) {
  Object.assign(globalThis, { IntersectionObserver: NoopIntersectionObserver });
}
```

- [ ] **Step 6: Verify build, typecheck, lint**

Run: `pnpm --filter @linguo/web build && pnpm --filter @linguo/web typecheck && pnpm lint`
Expected: build writes `apps/web/dist/index.html` and `apps/web/dist/404.html`; typecheck and lint exit 0.

Run: `ls apps/web/dist`
Expected: `404.html  assets  index.html`

- [ ] **Step 7: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): scaffold Vite React app with Tailwind v4, Vitest and SPA 404 fallback"
```

---

## Phase B — Design system

### Task 4: Design tokens and global CSS

**Files:**
- Create: `apps/web/src/design/tokens.css`, `apps/web/src/design/global.css`
- Modify: `apps/web/src/app/main.tsx` (import CSS)

- [ ] **Step 1: Tokens** — `apps/web/src/design/tokens.css`

```css
:root,
[data-theme='light'] {
  color-scheme: light;
  --bg: #f6f8fb;
  --surface: #ffffff;
  --surface-solid: #ffffff;
  --border: #e3e8ef;
  --text: #0f1c2b;
  --muted: #5b6b7c;
  --primary: #276fa0;
  --primary-strong: #1f5c86;
  --on-primary: #ffffff;
  --accent: #f37d25;
  --accent-text: #c2560f;
  --on-accent: #1a0e05;
  --gold: #b07d1e;
  --success: #1f7a50;
  --warn: #c98a0b;
  --error: #d2453b;
  --glass-blur: 0px;
  --shadow-card: 0 1px 2px rgb(15 28 43 / 0.06), 0 8px 24px rgb(15 28 43 / 0.06);
  --focus-ring: #276fa0;
}

[data-theme='dark'] {
  color-scheme: dark;
  --bg: #0b1420;
  --surface: rgb(18 26 38 / 0.78);
  --surface-solid: #121c29;
  --border: rgb(255 255 255 / 0.1);
  --text: #eef3f8;
  --muted: #9aa9b8;
  --primary: #4ca2d1;
  --primary-strong: #3380b6;
  --on-primary: #06121c;
  --accent: #f37d25;
  --accent-text: #f37d25;
  --on-accent: #1a0e05;
  --gold: #d9a13b;
  --success: #3fb67f;
  --warn: #e0a526;
  --error: #ef6a5f;
  --glass-blur: 16px;
  --shadow-card: 0 12px 40px rgb(0 0 0 / 0.35);
  --focus-ring: #7cc0e6;
}

@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  [data-theme='dark'] {
    --surface: #121c29;
  }
}
```

- [ ] **Step 2: Global stylesheet** — `apps/web/src/design/global.css`

```css
@import 'tailwindcss';
@import './tokens.css';

@custom-variant dark (&:where([data-theme='dark'], [data-theme='dark'] *));

@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-surface-solid: var(--surface-solid);
  --color-border: var(--border);
  --color-text: var(--text);
  --color-muted: var(--muted);
  --color-primary: var(--primary);
  --color-primary-strong: var(--primary-strong);
  --color-on-primary: var(--on-primary);
  --color-accent: var(--accent);
  --color-accent-text: var(--accent-text);
  --color-on-accent: var(--on-accent);
  --color-gold: var(--gold);
  --color-success: var(--success);
  --color-warn: var(--warn);
  --color-error: var(--error);
  --font-sans: 'Be Vietnam Pro', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --font-display: 'Barlow Condensed', 'Be Vietnam Pro', system-ui, sans-serif;
  --font-serif: 'Newsreader', Georgia, serif;
  --ease-expo: cubic-bezier(0.16, 1, 0.3, 1);
}

@layer base {
  html {
    -webkit-text-size-adjust: 100%;
    text-size-adjust: 100%;
  }
  body {
    margin: 0;
    min-height: 100vh;
    min-height: 100dvh;
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
    -webkit-tap-highlight-color: transparent;
    overflow-wrap: break-word;
  }
  h1,
  h2,
  h3 {
    text-wrap: balance;
  }
  :lang(ko) {
    font-family: 'Pretendard Variable', Pretendard, 'Noto Sans KR', var(--font-sans);
    word-break: keep-all;
    overflow-wrap: anywhere;
  }
  :focus-visible {
    outline: 3px solid var(--focus-ring);
    outline-offset: 2px;
  }
  input,
  textarea,
  select {
    font-size: max(16px, 1rem);
  }
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
  [data-reduce-motion='true'] *,
  [data-reduce-motion='true'] *::before,
  [data-reduce-motion='true'] *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

@utility glass {
  background: var(--surface);
  border: 1px solid var(--border);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(1.2);
  backdrop-filter: blur(var(--glass-blur)) saturate(1.2);
}
@utility pt-safe {
  padding-top: env(safe-area-inset-top, 0px);
}
@utility pb-safe {
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
@utility px-safe {
  padding-left: max(1.25rem, env(safe-area-inset-left, 0px));
  padding-right: max(1.25rem, env(safe-area-inset-right, 0px));
}
@utility min-h-hero {
  min-height: 100vh;
  min-height: 100svh;
}
@utility h-app {
  height: 100vh;
  height: 100dvh;
}
@utility text-gradient-fade {
  background-image: linear-gradient(to bottom, var(--text) 0%, color-mix(in srgb, var(--text) 45%, transparent) 60%, transparent 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
```

- [ ] **Step 3: Import the CSS** — replace `apps/web/src/app/main.tsx`

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/design/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <p className="glass m-6 rounded-3xl p-6 font-display text-5xl uppercase text-primary">Linguo</p>
  </StrictMode>,
);
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @linguo/web build`
Expected: build succeeds; `grep -c "backdrop-filter" apps/web/dist/assets/*.css` prints a number ≥ 1.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): add Glass Path design tokens, Tailwind theme and safe-area utilities"
```

---

### Task 5: Core lib helpers (`cn`, `env`, `storage`, `asset`, `viewport`, hooks)

**Files:**
- Create: `apps/web/src/lib/cn.ts`, `env.ts`, `storage.ts`, `asset.ts`, `viewport.ts`, `useOnline.ts`, `useMediaQuery.ts`, `useSaveData.ts`
- Test: `apps/web/src/lib/env.test.ts`, `apps/web/src/lib/viewport.test.ts`, `apps/web/src/lib/storage.test.ts`

- [ ] **Step 1: Write failing tests**

`apps/web/src/lib/env.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { readEnv } from './env';

describe('readEnv', () => {
  it('is unconfigured when Supabase vars are missing', () => {
    const env = readEnv({ BASE_URL: '/' }, 'http://localhost:5173');
    expect(env.isSupabaseConfigured).toBe(false);
    expect(env.siteUrl).toBe('http://localhost:5173');
    expect(env.googleEnabled).toBe(false);
    expect(env.heroVideoUrl).toBeNull();
  });

  it('reads and normalizes configured values', () => {
    const env = readEnv(
      {
        BASE_URL: '/Linguo/',
        VITE_SUPABASE_URL: ' https://abc.supabase.co/ ',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
        VITE_AUTH_GOOGLE_ENABLED: 'true',
        VITE_HERO_VIDEO_URL: 'https://cdn.example.com/hero.mp4',
      },
      'https://user.github.io',
    );
    expect(env.isSupabaseConfigured).toBe(true);
    expect(env.supabaseUrl).toBe('https://abc.supabase.co');
    expect(env.siteUrl).toBe('https://user.github.io/Linguo');
    expect(env.googleEnabled).toBe(true);
    expect(env.heroVideoUrl).toBe('https://cdn.example.com/hero.mp4');
  });

  it('prefers VITE_SITE_URL and strips trailing slashes', () => {
    const env = readEnv({ BASE_URL: '/', VITE_SITE_URL: 'https://linguo.vn/' }, 'http://x');
    expect(env.siteUrl).toBe('https://linguo.vn');
  });
});
```

`apps/web/src/lib/storage.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { readBool, readString, writeBool, writeString } from './storage';

describe('storage', () => {
  it('round-trips strings and booleans', () => {
    writeString('k', 'v');
    writeBool('b', true);
    expect(readString('k')).toBe('v');
    expect(readBool('b')).toBe(true);
    expect(readBool('missing')).toBe(false);
    expect(readString('missing')).toBeNull();
  });
});
```

`apps/web/src/lib/viewport.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installKeyboardAwareness } from './viewport';

describe('installKeyboardAwareness', () => {
  afterEach(() => {
    Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true });
  });

  it('scrolls the focused input into view when the visual viewport resizes', () => {
    const vv = new EventTarget();
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    const spy = vi.fn();
    input.scrollIntoView = spy;

    const uninstall = installKeyboardAwareness(window);
    vv.dispatchEvent(new Event('resize'));
    expect(spy).toHaveBeenCalledWith({ block: 'center' });

    uninstall();
    vv.dispatchEvent(new Event('resize'));
    expect(spy).toHaveBeenCalledTimes(1);
    input.remove();
  });

  it('is a no-op without visualViewport', () => {
    expect(() => installKeyboardAwareness(window)()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @linguo/web test`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`apps/web/src/lib/cn.ts`:
```ts
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
```

`apps/web/src/lib/env.ts`:
```ts
export interface AppEnv {
  supabaseUrl: string;
  supabaseKey: string;
  siteUrl: string;
  googleEnabled: boolean;
  heroVideoUrl: string | null;
  isSupabaseConfigured: boolean;
}

type RawEnv = Record<string, string | boolean | undefined>;

export function readEnv(raw: RawEnv, origin: string): AppEnv {
  const str = (key: string): string => {
    const value = raw[key];
    return typeof value === 'string' ? value.trim() : '';
  };
  const supabaseUrl = str('VITE_SUPABASE_URL').replace(/\/+$/, '');
  const supabaseKey = str('VITE_SUPABASE_PUBLISHABLE_KEY');
  const base = (str('BASE_URL') || '/').replace(/\/+$/, '');
  const siteUrl = (str('VITE_SITE_URL') || `${origin}${base}`).replace(/\/+$/, '');
  return {
    supabaseUrl,
    supabaseKey,
    siteUrl,
    googleEnabled: str('VITE_AUTH_GOOGLE_ENABLED') === 'true',
    heroVideoUrl: str('VITE_HERO_VIDEO_URL') || null,
    isSupabaseConfigured: /^https?:\/\/.+/.test(supabaseUrl) && supabaseKey.length > 0,
  };
}

export const env: AppEnv = readEnv(
  import.meta.env as unknown as RawEnv,
  typeof window === 'undefined' ? 'http://localhost:5173' : window.location.origin,
);
```

`apps/web/src/lib/storage.ts`:
```ts
/** localStorage can throw (private mode, blocked storage); never let that break the UI. */
export function readString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Preference simply won't persist on this device.
  }
}

export function readBool(key: string): boolean {
  return readString(key) === 'true';
}

export function writeBool(key: string, value: boolean): void {
  writeString(key, String(value));
}
```

`apps/web/src/lib/asset.ts`:
```ts
/** URL for a file in `public/`, respecting the GitHub Pages base path. */
export function asset(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
}
```

`apps/web/src/lib/viewport.ts`:
```ts
const FIELD = 'input, textarea, select, [contenteditable="true"]';

/** iOS Safari ignores `interactive-widget`; keep the focused field visible when the keyboard opens. */
export function installKeyboardAwareness(win: Window = window): () => void {
  const vv = win.visualViewport;
  if (!vv) return () => {};
  const onResize = () => {
    const el = win.document.activeElement;
    if (el instanceof HTMLElement && el.matches(FIELD)) el.scrollIntoView({ block: 'center' });
  };
  vv.addEventListener('resize', onResize);
  return () => vv.removeEventListener('resize', onResize);
}
```

`apps/web/src/lib/useOnline.ts`:
```ts
import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}
```

`apps/web/src/lib/useMediaQuery.ts`:
```ts
import { useCallback, useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}
```

`apps/web/src/lib/useSaveData.ts`:
```ts
interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

/** True when the user asked the browser to save data or the connection is very slow. */
export function useSaveData(): boolean {
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  if (!connection) return false;
  return connection.saveData === true || connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g';
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @linguo/web test`
Expected: PASS (env, storage, viewport).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib
git commit -m "feat(web): add env reader, safe storage, keyboard-aware viewport and media hooks"
```

---

### Task 6: Motion presets, `ThemeProvider`, `MotionProvider`

**Files:**
- Create: `apps/web/src/design/motion.ts`, `apps/web/src/providers/ThemeProvider.tsx`, `apps/web/src/providers/MotionProvider.tsx`
- Test: `apps/web/src/design/motion.test.ts`, `apps/web/src/providers/ThemeProvider.test.tsx`, `apps/web/src/providers/MotionProvider.test.tsx`

- [ ] **Step 1: Write failing tests**

`apps/web/src/design/motion.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { reveal } from './motion';

describe('reveal', () => {
  it('uses transforms when motion is allowed', () => {
    const v = reveal('slideLeft', false);
    expect(v.hidden).toMatchObject({ opacity: 0, x: -400 });
    expect(v.shown).toMatchObject({ opacity: 1, x: 0 });
  });

  it('collapses to opacity only when motion is reduced', () => {
    for (const kind of ['slideLeft', 'slideRight', 'blurUp', 'fadeUp', 'speed', 'pop', 'drop'] as const) {
      const v = reveal(kind, true);
      expect(Object.keys(v.hidden as object)).toEqual(['opacity']);
    }
  });
});
```

`apps/web/src/providers/ThemeProvider.test.tsx`:
```tsx
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { stubMatchMedia } from '../../tests/unit/match-media';
import { resolveTheme, ThemeProvider, useTheme } from './ThemeProvider';

function Probe() {
  const { preference, resolved, setPreference } = useTheme();
  return (
    <div>
      <span data-testid="state">{`${preference}:${resolved}`}</span>
      <button onClick={() => setPreference('dark')}>dark</button>
    </div>
  );
}

describe('resolveTheme', () => {
  it('follows the system for "system"', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
  });
});

describe('ThemeProvider', () => {
  it('applies the resolved theme to <html> and persists changes', () => {
    stubMatchMedia(() => false);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('state')).toHaveTextContent('system:light');
    expect(document.documentElement.dataset.theme).toBe('light');

    act(() => screen.getByText('dark').click());
    expect(screen.getByTestId('state')).toHaveTextContent('dark:dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('lp-theme')).toBe('dark');
  });
});
```

`apps/web/src/providers/MotionProvider.test.tsx`:
```tsx
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { stubMatchMedia } from '../../tests/unit/match-media';
import { MotionProvider, useMotionPrefs } from './MotionProvider';

function Probe() {
  const { reduceMotion, setUserReduceMotion } = useMotionPrefs();
  return (
    <button onClick={() => setUserReduceMotion(true)} data-testid="probe">
      {String(reduceMotion)}
    </button>
  );
}

describe('MotionProvider', () => {
  it('reduces motion when the user opts in', () => {
    stubMatchMedia(() => false);
    render(
      <MotionProvider>
        <Probe />
      </MotionProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('false');
    act(() => screen.getByTestId('probe').click());
    expect(screen.getByTestId('probe')).toHaveTextContent('true');
    expect(document.documentElement.dataset.reduceMotion).toBe('true');
    expect(localStorage.getItem('lp-reduce-motion')).toBe('true');
  });

  it('honours prefers-reduced-motion', () => {
    stubMatchMedia((q) => q.includes('prefers-reduced-motion'));
    render(
      <MotionProvider>
        <Probe />
      </MotionProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('true');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @linguo/web test`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`apps/web/src/design/motion.ts`:
```ts
import type { Transition, Variants } from 'motion/react';

export const EXPO_OUT = [0.16, 1, 0.3, 1] as const;
export const EASE_OUT = [0.25, 0.46, 0.45, 0.94] as const;
export const SPRING_POP = [0.34, 1.56, 0.64, 1] as const;
export const DUR = { fast: 0.18, base: 0.22, slow: 0.85 } as const;

/** `useInView` options for scroll reveals: fire once, slightly before the element is fully in view. */
export const VIEWPORT_ONCE = { once: true, margin: '0px 0px -60px 0px' } as const;

export type RevealKind = 'slideLeft' | 'slideRight' | 'blurUp' | 'fadeUp' | 'speed' | 'pop' | 'drop';

/**
 * Variants with `hidden` / `shown` states. Expressive tier (landing, celebrations).
 * When `reduce` is true every kind becomes a short opacity fade.
 */
export function reveal(kind: RevealKind, reduce: boolean, delay = 0): Variants {
  if (reduce) {
    return { hidden: { opacity: 0 }, shown: { opacity: 1, transition: { duration: DUR.fast } } };
  }
  const t = (duration: number, ease: Transition['ease'] = EXPO_OUT): Transition => ({ duration, ease, delay });
  switch (kind) {
    case 'slideLeft':
      return { hidden: { opacity: 0, x: -400 }, shown: { opacity: 1, x: 0, transition: t(DUR.slow) } };
    case 'slideRight':
      return { hidden: { opacity: 0, x: 400 }, shown: { opacity: 1, x: 0, transition: t(DUR.slow) } };
    case 'blurUp':
      return {
        hidden: { opacity: 0, y: 26, scale: 0.985, filter: 'blur(7px)' },
        shown: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', transition: t(0.9) },
      };
    case 'fadeUp':
      return { hidden: { opacity: 0, y: 16 }, shown: { opacity: 1, y: 0, transition: t(0.7) } };
    case 'speed':
      return {
        hidden: { opacity: 0, x: '-60%', skewX: -8, filter: 'blur(8px)' },
        shown: { opacity: 1, x: '0%', skewX: 0, filter: 'blur(0px)', transition: t(0.8) },
      };
    case 'pop':
      return { hidden: { opacity: 0, y: 8, scale: 0.78 }, shown: { opacity: 1, y: 0, scale: 1, transition: t(0.7, SPRING_POP) } };
    case 'drop':
      return { hidden: { opacity: 0, y: -16, scale: 0.9 }, shown: { opacity: 1, y: 0, scale: 1, transition: t(0.9) } };
  }
}

/** Functional tier (in-app): short, transform/opacity only. */
export const functionalTransition: Transition = { duration: DUR.base, ease: EASE_OUT };
```

`apps/web/src/providers/ThemeProvider.tsx`:
```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { THEMES, type ThemePreference } from '@linguo/shared';
import { readString, writeString } from '@/lib/storage';
import { useMediaQuery } from '@/lib/useMediaQuery';

export type ResolvedTheme = 'light' | 'dark';
const STORAGE_KEY = 'lp-theme';

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemDark ? 'dark' : 'light';
  return preference;
}

function readPreference(): ThemePreference {
  const stored = readString(STORAGE_KEY);
  return (THEMES as readonly string[]).includes(stored ?? '') ? (stored as ThemePreference) : 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const resolved = resolveTheme(preference, systemDark);

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    writeString(STORAGE_KEY, next);
  }, []);

  const value = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved, setPreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
```

`apps/web/src/providers/MotionProvider.tsx`:
```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { MotionConfig } from 'motion/react';
import { readBool, writeBool } from '@/lib/storage';
import { useMediaQuery } from '@/lib/useMediaQuery';

const STORAGE_KEY = 'lp-reduce-motion';

interface MotionPrefs {
  /** Effective value: system preference OR the in-app toggle. */
  reduceMotion: boolean;
  /** The in-app toggle only (shown in Settings). */
  userReduceMotion: boolean;
  setUserReduceMotion: (value: boolean) => void;
}

const MotionContext = createContext<MotionPrefs | null>(null);

export function MotionProvider({ children }: { children: ReactNode }) {
  const system = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [user, setUser] = useState(() => readBool(STORAGE_KEY));
  const reduceMotion = system || user;

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(reduceMotion);
  }, [reduceMotion]);

  const setUserReduceMotion = useCallback((value: boolean) => {
    setUser(value);
    writeBool(STORAGE_KEY, value);
  }, []);

  const value = useMemo(
    () => ({ reduceMotion, userReduceMotion: user, setUserReduceMotion }),
    [reduceMotion, user, setUserReduceMotion],
  );

  return (
    <MotionContext.Provider value={value}>
      <MotionConfig reducedMotion={reduceMotion ? 'always' : 'never'}>{children}</MotionConfig>
    </MotionContext.Provider>
  );
}

export function useMotionPrefs(): MotionPrefs {
  const ctx = useContext(MotionContext);
  if (!ctx) throw new Error('useMotionPrefs must be used inside <MotionProvider>');
  return ctx;
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @linguo/web test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): add motion presets with reduced-motion tier, theme and motion providers"
```

---

### Task 7: Form primitives (`Button`, `Spinner`, `Input`, `PasswordInput`, `FormField`)

**Files:**
- Create: `apps/web/src/components/ui/Spinner.tsx`, `Button.tsx`, `Input.tsx`, `PasswordInput.tsx`, `FormField.tsx`
- Test: `apps/web/src/components/ui/form.test.tsx`

- [ ] **Step 1: Write the failing test** — `apps/web/src/components/ui/form.test.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { FormField } from './FormField';
import { Input } from './Input';
import { PasswordInput } from './PasswordInput';

describe('Button', () => {
  it('is disabled and busy while loading', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Lưu
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Lưu' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('defaults to type="button"', () => {
    render(<Button>OK</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });
});

describe('FormField', () => {
  it('links label, hint and error to the control', () => {
    render(
      <FormField label="Email" hint="Dùng email bạn hay kiểm tra." error="Email không hợp lệ.">
        {(a11y) => <Input {...a11y} />}
      </FormField>,
    );
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Dùng email bạn hay kiểm tra. Email không hợp lệ.');
    expect(screen.getByRole('alert')).toHaveTextContent('Email không hợp lệ.');
  });
});

describe('PasswordInput', () => {
  it('toggles visibility', async () => {
    render(
      <FormField label="Mật khẩu">{(a11y) => <PasswordInput {...a11y} defaultValue="bimat123" />}</FormField>,
    );
    const input = screen.getByLabelText('Mật khẩu');
    expect(input).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Ẩn mật khẩu' })).toHaveAttribute('aria-pressed', 'true');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @linguo/web test -- form`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`apps/web/src/components/ui/Spinner.tsx`:
```tsx
import { cn } from '@/lib/cn';

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent', className)}
    />
  );
}
```

`apps/web/src/components/ui/Button.tsx`:
```tsx
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'accent' | 'ghost' | 'glass' | 'danger';
export type ButtonSize = 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  block?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary enabled:hover:bg-primary-strong',
  accent: 'bg-accent text-on-accent enabled:hover:brightness-110',
  ghost: 'border border-border bg-transparent text-text enabled:hover:bg-text/5',
  glass: 'glass text-text enabled:hover:bg-text/5',
  danger: 'border border-error/40 bg-transparent text-error enabled:hover:bg-error/10',
};

/** Shared with links that must look like buttons (e.g. `<Link className={buttonClasses('ghost')}>`). */
export const buttonClasses = (variant: ButtonVariant = 'primary', size: ButtonSize = 'md', block = false) =>
  cn(
    'inline-flex items-center justify-center gap-2 rounded-full py-2 text-center font-semibold leading-tight',
    'transition-[transform,background-color,filter] duration-200 enabled:active:scale-[0.97]',
    'disabled:cursor-not-allowed disabled:opacity-60',
    size === 'lg' ? 'min-h-13 px-6 text-[17px]' : 'min-h-11 px-5 text-[15px]',
    block && 'w-full',
    VARIANTS[variant],
  );

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, block = false, disabled, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClasses(variant, size, block), className)}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
});
```

`apps/web/src/components/ui/Input.tsx`:
```tsx
import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const inputClasses = (invalid = false) =>
  cn(
    'block w-full min-h-12 rounded-full border bg-surface-solid px-5 text-base text-text placeholder:text-muted',
    'transition-[border-color,box-shadow] duration-200 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20',
    invalid ? 'border-error' : 'border-border',
  );

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, invalid = false, ...rest }, ref) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={cn(inputClasses(invalid), className)} {...rest} />;
});
```

`apps/web/src/components/ui/PasswordInput.tsx`:
```tsx
import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input, type InputProps } from './Input';

export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputProps, 'type'>>(function PasswordInput(props, ref) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input ref={ref} {...props} type={visible ? 'text' : 'password'} className="pr-14" />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        className="absolute right-1 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:text-text"
      >
        {visible ? <EyeOff aria-hidden className="size-5" /> : <Eye aria-hidden className="size-5" />}
      </button>
    </div>
  );
});
```

`apps/web/src/components/ui/FormField.tsx`:
```tsx
import { useId, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

export interface FieldA11y {
  id: string;
  'aria-describedby'?: string;
  invalid: boolean;
}

interface FormFieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: (a11y: FieldA11y) => ReactNode;
}

export function FormField({ label, hint, error, children }: FormFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block px-1 text-sm font-medium text-text">
        {label}
      </label>
      {children({ id, 'aria-describedby': describedBy, invalid: Boolean(error) })}
      {hint && (
        <p id={hintId} className="px-1 text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="flex items-start gap-1.5 px-1 text-sm text-error">
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @linguo/web test -- form`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui
git commit -m "feat(ui): add accessible Button, Input, PasswordInput and FormField"
```

---

### Task 8: Surfaces and states (`GlassCard`, `SolidCard`, `Skeleton`, `EmptyState`, `ErrorState`, `Toast`, `OfflineBanner`)

**Files:**
- Create: `apps/web/src/components/ui/GlassCard.tsx`, `SolidCard.tsx`, `Skeleton.tsx`, `EmptyState.tsx`, `ErrorState.tsx`, `Toast.tsx`, `OfflineBanner.tsx`
- Test: `apps/web/src/components/ui/states.test.tsx`

- [ ] **Step 1: Write the failing test** — `apps/web/src/components/ui/states.test.tsx`

```tsx
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Hourglass } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { OfflineBanner } from './OfflineBanner';
import { ToastProvider, useToast } from './Toast';

describe('EmptyState / ErrorState', () => {
  it('renders title, description and action', () => {
    render(<EmptyState icon={Hourglass} title="Sắp ra mắt" description="Đang xây dựng." action={<button>Về trang chủ</button>} />);
    expect(screen.getByRole('heading', { name: 'Sắp ra mắt' })).toBeInTheDocument();
    expect(screen.getByText('Đang xây dựng.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Về trang chủ' })).toBeInTheDocument();
  });

  it('calls onRetry', async () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

function ToastTrigger() {
  const toast = useToast();
  return <button onClick={() => toast.show({ tone: 'success', message: 'Đã lưu thay đổi.' })}>Hiện</button>;
}

describe('Toast', () => {
  afterEach(() => vi.useRealTimers());

  it('announces and auto-dismisses after 4 seconds', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>,
    );
    act(() => screen.getByText('Hiện').click());
    expect(screen.getByRole('status')).toHaveTextContent('Đã lưu thay đổi.');
    act(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(screen.queryByText('Đã lưu thay đổi.')).not.toBeInTheDocument();
  });
});

describe('OfflineBanner', () => {
  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
  });

  it('shows only while offline', () => {
    render(<OfflineBanner />);
    expect(screen.queryByText(/ngoại tuyến/)).not.toBeInTheDocument();
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByText(/ngoại tuyến/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @linguo/web test -- states`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`apps/web/src/components/ui/GlassCard.tsx`:
```tsx
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function GlassCard({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('glass rounded-3xl p-5 shadow-[var(--shadow-card)]', className)} {...rest} />;
}
```

`apps/web/src/components/ui/SolidCard.tsx`:
```tsx
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** Use behind long text: glass is for chrome and short labels only. */
export function SolidCard({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-3xl border border-border bg-surface-solid p-5 shadow-[var(--shadow-card)]', className)} {...rest} />
  );
}
```

`apps/web/src/components/ui/Skeleton.tsx`:
```tsx
import { cn } from '@/lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('inline-block animate-pulse rounded-xl bg-text/10', className)} />;
}
```

`apps/web/src/components/ui/EmptyState.tsx`:
```tsx
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { SolidCard } from './SolidCard';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  footnote?: ReactNode;
  headingLevel?: 'h2' | 'h3';
}

export function EmptyState({ icon: Icon, title, description, action, footnote, headingLevel = 'h2' }: EmptyStateProps) {
  const Heading = headingLevel;
  return (
    <SolidCard className="flex flex-col items-center gap-4 px-6 py-10 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
        <Icon aria-hidden className="size-7" />
      </span>
      <Heading className="text-xl font-bold tracking-[-0.02em]">{title}</Heading>
      <p className="max-w-sm text-[15px] leading-relaxed text-muted">{description}</p>
      {action}
      {footnote && <div className="text-sm text-muted">{footnote}</div>}
    </SolidCard>
  );
}
```

`apps/web/src/components/ui/ErrorState.tsx`:
```tsx
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { SolidCard } from './SolidCard';

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({
  title = 'Không tải được dữ liệu',
  description = 'Đã có lỗi xảy ra. Kiểm tra kết nối mạng rồi thử lại.',
  onRetry,
  retryLabel = 'Thử lại',
}: ErrorStateProps) {
  return (
    <SolidCard role="alert" className="flex flex-col items-center gap-3 px-6 py-8 text-center">
      <AlertTriangle aria-hidden className="size-8 text-error" />
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="max-w-sm text-[15px] text-muted">{description}</p>
      {onRetry && (
        <Button variant="ghost" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </SolidCard>
  );
}
```

`apps/web/src/components/ui/Toast.tsx`:
```tsx
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ToastTone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}
interface ToastApi {
  show: (toast: { tone: ToastTone; message: string }) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const ICONS = { success: CheckCircle2, error: XCircle, info: Info } as const;
const TONE_CLASS: Record<ToastTone, string> = { success: 'text-success', error: 'text-error', info: 'text-primary' };
const DURATION_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const show = useCallback<ToastApi['show']>(({ tone, message }) => {
    const id = nextId.current++;
    setItems((list) => [...list, { id, tone, message }]);
    window.setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), DURATION_MS);
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] z-[90] flex flex-col items-center gap-2 px-4 lg:bottom-6"
      >
        {items.map((t) => {
          const Icon = ICONS[t.tone];
          return (
            <div
              key={t.id}
              className="pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-2xl border border-border bg-surface-solid px-4 py-3 text-[15px] shadow-[var(--shadow-card)]"
            >
              <Icon aria-hidden className={cn('mt-0.5 size-5 shrink-0', TONE_CLASS[t.tone])} />
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
```

`apps/web/src/components/ui/OfflineBanner.tsx`:
```tsx
import { WifiOff } from 'lucide-react';
import { useOnline } from '@/lib/useOnline';

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[95] flex items-center justify-center gap-2 bg-warn px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top,0px))] text-sm font-medium text-[#1a1203]"
    >
      <WifiOff aria-hidden className="size-4 shrink-0" />
      Bạn đang ngoại tuyến. Một số thao tác sẽ không lưu được cho tới khi có mạng.
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @linguo/web test -- states`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui
git commit -m "feat(ui): add cards, skeleton, empty/error states, toast and offline banner"
```

---

### Task 9: Expressive components (`CountUp`, `RouteLine`, `ArrowCTA`, `LanguagePill`)

**Files:**
- Create: `apps/web/src/components/ui/CountUp.tsx`, `RouteLine.tsx`, `ArrowCTA.tsx`, `LanguagePill.tsx`
- Test: `apps/web/src/components/ui/expressive.test.tsx`

- [ ] **Step 1: Write the failing test** — `apps/web/src/components/ui/expressive.test.tsx`

```tsx
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { MotionProvider } from '@/providers/MotionProvider';
import { ArrowCTA } from './ArrowCTA';
import { CountUp } from './CountUp';
import { LanguagePill } from './LanguagePill';
import { RouteLine } from './RouteLine';

const withMotion = (ui: ReactNode) => (
  <MemoryRouter>
    <MotionProvider>{ui}</MotionProvider>
  </MemoryRouter>
);

describe('CountUp', () => {
  it('shows the final value immediately when motion is reduced and exposes it to screen readers', () => {
    localStorage.setItem('lp-reduce-motion', 'true');
    render(withMotion(<CountUp to={1200} suffix="+" />));
    expect(screen.getAllByText('1.200+')).toHaveLength(2);
  });
});

describe('RouteLine', () => {
  it('renders an accessible SVG with stop labels', () => {
    render(
      withMotion(
        <RouteLine
          title="Lộ trình tiếng Anh"
          viewBox="0 0 100 50"
          tracks={[
            {
              id: 'en',
              d: 'M0 0 C 10 10 20 10 30 0',
              color: '#4CA2D1',
              stops: [
                { x: 0, y: 0, label: 'A1' },
                { x: 30, y: 0, label: 'B1' },
              ],
            },
          ]}
        />,
      ),
    );
    expect(screen.getByRole('img', { name: 'Lộ trình tiếng Anh' })).toBeInTheDocument();
    expect(screen.getByText('A1')).toBeInTheDocument();
    expect(screen.getByText('B1')).toBeInTheDocument();
  });
});

describe('ArrowCTA', () => {
  it('is a link with the given label', () => {
    render(withMotion(<ArrowCTA to="/dang-ky">Bắt đầu miễn phí</ArrowCTA>));
    expect(screen.getByRole('link', { name: 'Bắt đầu miễn phí' })).toHaveAttribute('href', '/dang-ky');
  });
});

describe('LanguagePill', () => {
  it('shows text labels, marks Korean as coming soon and closes on Escape', async () => {
    render(withMotion(<LanguagePill />));
    const trigger = screen.getByRole('button', { name: /Ngôn ngữ đang học: Tiếng Anh/ });
    expect(trigger).toHaveTextContent('EN');
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitemradio', { name: /Tiếng Anh/ })).toHaveAttribute('aria-checked', 'true');
    const ko = screen.getByRole('menuitemradio', { name: /Tiếng Hàn/ });
    expect(ko).toBeDisabled();
    expect(ko).toHaveTextContent('Sắp ra mắt');
    await userEvent.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @linguo/web test -- expressive`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`apps/web/src/components/ui/CountUp.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react';
import { useInView } from 'motion/react';
import { VIEWPORT_ONCE } from '@/design/motion';
import { useMotionPrefs } from '@/providers/MotionProvider';

interface CountUpProps {
  to: number;
  durationMs?: number;
  delayMs?: number;
  suffix?: string;
  className?: string;
}

const format = (n: number) => n.toLocaleString('vi-VN');

/** F1-style count-up (cubic ease-out). Screen readers always get the final value. */
export function CountUp({ to, durationMs = 2200, delayMs = 0, suffix = '', className }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, VIEWPORT_ONCE);
  const { reduceMotion } = useMotionPrefs();
  const [value, setValue] = useState(reduceMotion ? to : 0);

  useEffect(() => {
    if (reduceMotion) {
      setValue(to);
      return;
    }
    if (!inView) return;
    let frame = 0;
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const p = Math.min(1, (now - start) / durationMs);
      setValue(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    const timer = window.setTimeout(() => {
      frame = requestAnimationFrame(tick);
    }, delayMs);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [inView, reduceMotion, to, durationMs, delayMs]);

  return (
    <span ref={ref} className={className}>
      <span aria-hidden="true">
        {format(value)}
        {suffix}
      </span>
      <span className="sr-only">
        {format(to)}
        {suffix}
      </span>
    </span>
  );
}
```

`apps/web/src/components/ui/RouteLine.tsx`:
```tsx
import { useId, useRef } from 'react';
import { motion, useInView } from 'motion/react';
import { EXPO_OUT, SPRING_POP, VIEWPORT_ONCE } from '@/design/motion';
import { cn } from '@/lib/cn';
import { useMotionPrefs } from '@/providers/MotionProvider';

export interface RouteStop {
  x: number;
  y: number;
  label: string;
  labelPosition?: 'top' | 'bottom' | 'left' | 'right';
}

export interface RouteTrack {
  id: string;
  d: string;
  color: string;
  stops: RouteStop[];
}

interface RouteLineProps {
  title: string;
  viewBox: string;
  tracks: RouteTrack[];
  className?: string;
}

function labelProps(stop: RouteStop) {
  switch (stop.labelPosition ?? 'top') {
    case 'bottom':
      return { x: stop.x, y: stop.y + 22, textAnchor: 'middle' as const };
    case 'left':
      return { x: stop.x - 12, y: stop.y + 4, textAnchor: 'end' as const };
    case 'right':
      return { x: stop.x + 12, y: stop.y + 4, textAnchor: 'start' as const };
    default:
      return { x: stop.x, y: stop.y - 13, textAnchor: 'middle' as const };
  }
}

/** CARGOX-style route map used as the "learning path" metaphor: lines draw in, stops pop, arrows travel. */
export function RouteLine({ title, viewBox, tracks, className }: RouteLineProps) {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, VIEWPORT_ONCE);
  const { reduceMotion } = useMotionPrefs();
  const drawn = reduceMotion || inView;
  const prefix = useId().replace(/[^a-zA-Z0-9_-]/g, '');

  return (
    <svg ref={ref} viewBox={viewBox} role="img" aria-label={title} className={cn('h-auto w-full overflow-visible', className)}>
      {tracks.map((track, ti) => {
        const pathId = `${prefix}-route-${track.id}`;
        return (
          <g key={track.id}>
            <path d={track.d} fill="none" stroke={track.color} strokeOpacity={0.18} strokeWidth={7} strokeLinecap="round" />
            <motion.path
              id={pathId}
              d={track.d}
              fill="none"
              stroke={track.color}
              strokeWidth={2.5}
              strokeLinecap="round"
              initial={{ pathLength: reduceMotion ? 1 : 0 }}
              animate={{ pathLength: drawn ? 1 : 0 }}
              transition={{ duration: reduceMotion ? 0 : 1.6, ease: EXPO_OUT, delay: ti * 0.25 }}
            />
            {!reduceMotion && drawn && (
              <polygon points="0,-4 8,0 0,4" fill={track.color}>
                <animateMotion dur={`${7 + ti}s`} begin={`${1.6 + ti * 0.25}s`} repeatCount="indefinite" rotate="auto">
                  <mpath href={`#${pathId}`} />
                </animateMotion>
              </polygon>
            )}
            {track.stops.map((stop, si) => (
              <motion.g
                key={stop.label}
                initial={{ opacity: 0, scale: reduceMotion ? 1 : 0 }}
                animate={drawn ? { opacity: 1, scale: 1 } : { opacity: 0 }}
                transition={{ duration: 0.5, ease: SPRING_POP, delay: reduceMotion ? 0 : 0.4 + ti * 0.25 + si * 0.15 }}
                style={{ transformOrigin: `${stop.x}px ${stop.y}px`, transformBox: 'view-box' }}
              >
                <circle cx={stop.x} cy={stop.y} r={7} fill={track.color} />
                <circle cx={stop.x} cy={stop.y} r={2.6} fill="var(--bg)" />
                <text {...labelProps(stop)} fill="currentColor" fontSize={11} fontWeight={600}>
                  {stop.label}
                </text>
              </motion.g>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
```

`apps/web/src/components/ui/ArrowCTA.tsx`:
```tsx
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { motion } from 'motion/react';
import { EXPO_OUT } from '@/design/motion';
import { cn } from '@/lib/cn';
import { useMotionPrefs } from '@/providers/MotionProvider';

const MotionLink = motion.create(Link);

interface ArrowCTAProps {
  to: string;
  children: ReactNode;
  className?: string;
}

/** CARGOX-style pill CTA: orange pill with a round end holding an arrow that straightens on hover. */
export function ArrowCTA({ to, children, className }: ArrowCTAProps) {
  const { reduceMotion } = useMotionPrefs();
  const pill = reduceMotion
    ? { rest: {}, hover: {}, tap: {} }
    : { rest: { scale: 1, y: 0 }, hover: { scale: 1.04, y: -2 }, tap: { scale: 0.97 } };
  const arrow = reduceMotion ? { rest: { rotate: 0 }, hover: { rotate: 0 } } : { rest: { rotate: -45 }, hover: { rotate: 0 } };

  return (
    <MotionLink
      to={to}
      variants={pill}
      initial="rest"
      animate="rest"
      whileHover="hover"
      whileTap="tap"
      transition={{ duration: 0.35, ease: EXPO_OUT }}
      className={cn(
        'inline-flex min-h-14 items-center gap-4 rounded-full bg-accent py-1.5 pl-6 pr-1.5 text-[17px] font-semibold text-on-accent',
        'shadow-[0_12px_32px_-12px_rgb(243_125_37/0.75)]',
        className,
      )}
    >
      <span>{children}</span>
      <motion.span
        aria-hidden="true"
        variants={arrow}
        transition={{ duration: 0.35, ease: EXPO_OUT }}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-[#0B1420] text-white"
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </motion.span>
    </MotionLink>
  );
}
```

`apps/web/src/components/ui/LanguagePill.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { LANGUAGE_CODES, LANGUAGES, type LanguageCode } from '@linguo/shared';

/** Current learning language as text ("EN ▾"), never a flag (PRD 12.2). Switching arrives in spec 1. */
export function LanguagePill({ current = 'en' }: { current?: LanguageCode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const lang = LANGUAGES[current];

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Ngôn ngữ đang học: ${lang.nameVi}. Đổi ngôn ngữ`}
        onClick={() => setOpen((v) => !v)}
        className="glass inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold"
      >
        {lang.short}
        <ChevronDown aria-hidden className="size-4" />
      </button>
      {open && (
        <ul
          role="menu"
          aria-label="Chọn ngôn ngữ học"
          className="absolute right-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-surface-solid p-1.5 shadow-[var(--shadow-card)]"
        >
          {LANGUAGE_CODES.map((code) => {
            const item = LANGUAGES[code];
            const active = code === current;
            return (
              <li key={code} role="none">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  disabled={!item.available}
                  onClick={() => setOpen(false)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm enabled:hover:bg-text/5 disabled:opacity-60"
                >
                  <span>
                    <span className="font-semibold">{item.short}</span> · {item.nameVi}{' '}
                    <span lang={code}>({item.nativeName})</span>
                  </span>
                  {active ? (
                    <Check aria-hidden className="size-4 shrink-0 text-primary" />
                  ) : (
                    !item.available && <span className="shrink-0 text-xs text-muted">Sắp ra mắt</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @linguo/web test -- expressive && pnpm --filter @linguo/web typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui
git commit -m "feat(ui): add CountUp, RouteLine route map, ArrowCTA and LanguagePill"
```

---

### Task 10: Brand assets — logo cut-out, mark SVG, icon set, manifest

**Files:**
- Create: `apps/web/public/brand/logo-mark.svg`, `scripts/make-icons.mjs`, `apps/web/public/manifest.webmanifest`
- Generated (commit them): `apps/web/public/brand/logo-full.png`, `logo-full.webp`, `apps/web/public/favicon.ico`, `apps/web/public/icons/*.png`
- Modify: `apps/web/index.html` (icon + manifest links)

- [ ] **Step 1: Hand-drawn mark** — `apps/web/public/brand/logo-mark.svg`

A blue speech bubble holding a script "L" with an orange tail and a small sparkle; no text, legible at 16px.
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Linguo">
  <path d="M32 5C17.1 5 5 15.9 5 29.3c0 7.6 3.9 14.4 10 18.9L12.6 58l11.6-6.3c2.5.6 5.1.9 7.8.9 14.9 0 27-10.9 27-24.3S46.9 5 32 5Z" fill="#4CA2D1"/>
  <path d="M27.5 16.5c2.6-2.6 6.3-1.6 6.1 2.2-.3 5.2-6.4 10.4-7.6 17.4-.6 3.3.9 5.4 4.2 5.4h12.3" fill="none" stroke="#fff" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M42.5 41.5c4.3 0 7.8 2.6 9.5 6.5 1 2.3 3 3.8 5.5 4" fill="none" stroke="#F37D25" stroke-width="4.2" stroke-linecap="round"/>
  <path d="M47 13.5l1.3 3.2 3.2 1.3-3.2 1.3-1.3 3.2-1.3-3.2-3.2-1.3 3.2-1.3z" fill="#fff"/>
</svg>
```

- [ ] **Step 2: Icon script** — `scripts/make-icons.mjs`

```js
#!/usr/bin/env node
// Builds brand + PWA/iOS icons.  Run: pnpm icons
//
// design/brand/logo-source.png is 1024² RGBA but fully opaque: the grey/white
// checkerboard (≈#D6D6D6 / #F9F9F7) is painted into the pixels. We flood-fill from
// the image border through neutral light pixels, so the logo's own white outline
// (enclosed by colour) survives, then drop stray specks, feather 1px and trim.
// Small icons come from the hand-drawn apps/web/public/brand/logo-mark.svg, because
// the full logo (3 bubbles + EN/KO/VN text) is unreadable at 16–48px.
import sharp from 'sharp';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'design', 'brand', 'logo-source.png');
const PUB = join(root, 'apps', 'web', 'public');
const BRAND = join(PUB, 'brand');
const ICONS = join(PUB, 'icons');
const MARK_SVG = readFileSync(join(BRAND, 'logo-mark.svg'));
const NAVY = '#0B1420';
const NEUTRAL_MAX_SPREAD = 14; // max(r,g,b) - min(r,g,b)
const NEUTRAL_MIN_LEVEL = 196; // min(r,g,b)
mkdirSync(ICONS, { recursive: true });

// ---- 1. Full logo cut-out -------------------------------------------------
const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const isBackdrop = (p) => {
  const i = p * 4;
  const r = data[i], g = data[i + 1], b = data[i + 2];
  return Math.max(r, g, b) - Math.min(r, g, b) <= NEUTRAL_MAX_SPREAD && Math.min(r, g, b) >= NEUTRAL_MIN_LEVEL;
};

const bg = new Uint8Array(W * H);
const stack = [];
for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
while (stack.length) {
  const p = stack.pop();
  if (bg[p] || !isBackdrop(p)) continue;
  bg[p] = 1;
  const x = p % W, y = (p / W) | 0;
  if (x > 0) stack.push(p - 1);
  if (x < W - 1) stack.push(p + 1);
  if (y > 0) stack.push(p - W);
  if (y < H - 1) stack.push(p + W);
}

// Label the remaining (logo) pixels into connected components and keep only the
// largest one: drops the sparkle artefact near the bottom-right corner.
const label = new Int32Array(W * H).fill(-1);
let best = -1, bestSize = 0, next = 0;
for (let p = 0; p < W * H; p++) {
  if (bg[p] || label[p] !== -1) continue;
  const id = next++;
  let size = 0;
  const queue = [p];
  label[p] = id;
  while (queue.length) {
    const q = queue.pop();
    size++;
    const x = q % W, y = (q / W) | 0;
    for (const n of [x > 0 ? q - 1 : -1, x < W - 1 ? q + 1 : -1, y > 0 ? q - W : -1, y < H - 1 ? q + W : -1]) {
      if (n >= 0 && !bg[n] && label[n] === -1) {
        label[n] = id;
        queue.push(n);
      }
    }
  }
  if (size > bestSize) {
    bestSize = size;
    best = id;
  }
}

const out = Buffer.from(data);
let x0 = W, y0 = H, x1 = 0, y1 = 0;
for (let p = 0; p < W * H; p++) {
  const i = p * 4;
  if (bg[p] || label[p] !== best) {
    out[i + 3] = 0;
    continue;
  }
  const x = p % W, y = (p / W) | 0;
  const edge = (x > 0 && bg[p - 1]) || (x < W - 1 && bg[p + 1]) || (y > 0 && bg[p - W]) || (y < H - 1 && bg[p + W]);
  if (edge) out[i + 3] = 170; // 1px feather
  if (x < x0) x0 = x;
  if (x > x1) x1 = x;
  if (y < y0) y0 = y;
  if (y > y1) y1 = y;
}
const pad = 8;
const left = Math.max(0, x0 - pad), top = Math.max(0, y0 - pad);
const fullPng = await sharp(out, { raw: { width: W, height: H, channels: 4 } })
  .extract({ left, top, width: Math.min(W, x1 + pad + 1) - left, height: Math.min(H, y1 + pad + 1) - top })
  .png()
  .toBuffer();
writeFileSync(join(BRAND, 'logo-full.png'), await sharp(fullPng).resize({ height: 512 }).png({ compressionLevel: 9 }).toBuffer());
writeFileSync(join(BRAND, 'logo-full.webp'), await sharp(fullPng).resize({ height: 512 }).webp({ quality: 90 }).toBuffer());

// ---- 2. Icons from the mark ------------------------------------------------
const markAt = (size) => sharp(MARK_SVG, { density: 384 }).resize(size, size).png().toBuffer();
async function onTile(size, frac) {
  const inner = Math.round(size * frac);
  const mark = await markAt(inner);
  const off = Math.round((size - inner) / 2);
  return sharp({ create: { width: size, height: size, channels: 4, background: NAVY } })
    .composite([{ input: mark, left: off, top: off }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}
writeFileSync(join(ICONS, 'icon-192.png'), await markAt(192));
writeFileSync(join(ICONS, 'icon-512.png'), await markAt(512));
writeFileSync(join(ICONS, 'icon-maskable-192.png'), await onTile(192, 0.62)); // inside the 80% safe circle
writeFileSync(join(ICONS, 'icon-maskable-512.png'), await onTile(512, 0.62));
writeFileSync(join(ICONS, 'apple-touch-icon.png'), await onTile(180, 0.72)); // iOS needs an opaque square
const f16 = await markAt(16), f32 = await markAt(32), f48 = await markAt(48);
writeFileSync(join(ICONS, 'favicon-16.png'), f16);
writeFileSync(join(ICONS, 'favicon-32.png'), f32);

// favicon.ico holding PNG-encoded 16/32/48 entries.
const imgs = [[16, f16], [32, f32], [48, f48]];
const head = Buffer.alloc(6);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(imgs.length, 4);
const dir = Buffer.alloc(16 * imgs.length);
let offset = head.length + dir.length;
imgs.forEach(([s, b], k) => {
  const o = k * 16;
  dir[o] = s;
  dir[o + 1] = s;
  dir.writeUInt16LE(1, o + 4);
  dir.writeUInt16LE(32, o + 6);
  dir.writeUInt32LE(b.length, o + 8);
  dir.writeUInt32LE(offset, o + 12);
  offset += b.length;
});
writeFileSync(join(PUB, 'favicon.ico'), Buffer.concat([head, dir, ...imgs.map(([, b]) => b)]));
console.log('Brand assets written to apps/web/public/{brand,icons} and favicon.ico');
```

- [ ] **Step 3: Run it**

Run: `pnpm icons && ls apps/web/public/brand apps/web/public/icons`
Expected: `logo-full.png logo-full.webp logo-mark.svg` and `apple-touch-icon.png favicon-16.png favicon-32.png icon-192.png icon-512.png icon-maskable-192.png icon-maskable-512.png`.

- [ ] **Step 4: Inspect the cut-out visually**

Use the Read tool on `apps/web/public/brand/logo-full.png` and on `apps/web/public/icons/apple-touch-icon.png`. Expected: the three bubbles with their white outline on a transparent background and **no grey checkerboard squares**, including inside gaps between bubbles. Fixes if not:
- Checkerboard left inside enclosed gaps (not reachable from the border): after the border flood-fill, also flood-fill from every pixel that `isBackdrop` and whose 9×9 neighbourhood contains both a pixel within ±10 of `#D6D6D6` and one within ±10 of `#F9F9F7`; re-run.
- The logo's white outline was eaten: raise `NEUTRAL_MIN_LEVEL` to `205`; re-run.
Re-inspect until clean.

- [ ] **Step 5: Manifest** — `apps/web/public/manifest.webmanifest`

```json
{
  "name": "Linguo — Học tiếng Anh & tiếng Hàn",
  "short_name": "Linguo",
  "lang": "vi",
  "start_url": "./app",
  "scope": "./",
  "display": "standalone",
  "background_color": "#0B1420",
  "theme_color": "#0B1420",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 6: Link icons in `apps/web/index.html`** — insert directly after the `format-detection` meta tag:

```html
    <link rel="icon" href="%BASE_URL%favicon.ico" sizes="48x48" />
    <link rel="icon" href="%BASE_URL%brand/logo-mark.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="%BASE_URL%icons/apple-touch-icon.png" />
    <link rel="manifest" href="%BASE_URL%manifest.webmanifest" />
```

- [ ] **Step 7: Verify the build resolves the paths with a base path**

Run: `VITE_BASE_PATH=/Linguo/ pnpm --filter @linguo/web build && grep -o 'href="/Linguo/[^"]*"' apps/web/dist/index.html`
Expected: includes `href="/Linguo/favicon.ico"`, `href="/Linguo/brand/logo-mark.svg"`, `href="/Linguo/manifest.webmanifest"`.

- [ ] **Step 8: Commit**

```bash
git add scripts/make-icons.mjs apps/web/public apps/web/index.html
git commit -m "feat(brand): cut out logo background, add mark SVG, icon set and web manifest"
```

---

## Phase C — Supabase and auth

### Task 11: Supabase project files, foundation migration, pgTAP tests, generated types

**Prerequisite:** Docker Desktop running.

**Files:**
- Create: `supabase/config.toml` (via `supabase init`), `supabase/migrations/20261013000100_foundation.sql`, `supabase/tests/foundation.test.sql`
- Generated: `packages/shared/src/database.types.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Initialise Supabase**

Run: `pnpm exec supabase init` — answer **N** to the VS Code / IntelliJ Deno settings prompts.
Expected: `supabase/config.toml` created.

- [ ] **Step 2: Edit `supabase/config.toml`** — change these keys only (leave the rest as generated):

```toml
project_id = "linguo"

[auth]
site_url = "http://localhost:5173"
additional_redirect_urls = ["http://localhost:5173/**", "http://localhost:4173/**"]
```

Note in `docs/DEPLOY.md` (Task 22): auth settings in `config.toml` are for local only; hosted Auth URLs are set in the dashboard. CI never runs `supabase config push`.

- [ ] **Step 3: Write the failing pgTAP test** — `supabase/tests/foundation.test.sql`

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'a@test.dev', '{"display_name": "  An  "}'),
  ('22222222-2222-4222-8222-222222222222', 'b@test.dev', '{"full_name": "Bình (Google)"}'),
  ('33333333-3333-4333-8333-333333333333', 'c@test.dev', '{}');

-- Trigger creates profile + preferences
select is((select display_name from public.profiles where id = '11111111-1111-4111-8111-111111111111'), 'An', 'display_name copied and trimmed');
select is((select display_name from public.profiles where id = '22222222-2222-4222-8222-222222222222'), 'Bình (Google)', 'falls back to OAuth full_name');
select is((select display_name from public.profiles where id = '33333333-3333-4333-8333-333333333333'), null, 'no name -> null');
select is((select theme from public.user_preferences where user_id = '33333333-3333-4333-8333-333333333333'), 'system', 'default theme is system');
select is((select timezone from public.profiles where id = '33333333-3333-4333-8333-333333333333'), 'Asia/Ho_Chi_Minh', 'default timezone');

-- As user A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);
select is((select count(*) from public.profiles)::int, 1, 'A sees only own profile');
select is((select count(*) from public.user_preferences)::int, 1, 'A sees only own preferences');
update public.profiles set display_name = 'hacked' where id = '22222222-2222-4222-8222-222222222222';
update public.profiles set display_name = 'An Nguyễn' where id = '11111111-1111-4111-8111-111111111111';
select throws_ok(
  $$insert into public.profiles (id) values ('44444444-4444-4444-8444-444444444444')$$,
  '42501', null, 'A cannot insert profiles'
);
select throws_ok(
  $$update public.user_preferences set theme = 'neon' where user_id = '11111111-1111-4111-8111-111111111111'$$,
  '23514', null, 'theme check constraint'
);

-- As anon
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select is((select count(*) from public.profiles)::int, 0, 'anon sees no profiles');

-- Verify as owner
reset role;
select is((select display_name from public.profiles where id = '22222222-2222-4222-8222-222222222222'), 'Bình (Google)', 'B untouched by A');
select is((select display_name from public.profiles where id = '11111111-1111-4111-8111-111111111111'), 'An Nguyễn', 'A updated own profile');

select * from finish();
rollback;
```

- [ ] **Step 4: Start the stack and watch the test fail**

Run: `pnpm db:start` (first run pulls Docker images; can take several minutes)
Run: `pnpm db:test`
Expected: FAIL — `relation "public.profiles" does not exist`.

- [ ] **Step 5: Write the migration** — `supabase/migrations/20261013000100_foundation.sql`

```sql
-- Linguo foundation: profiles + user_preferences, created by trigger on sign-up, protected by RLS.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 60),
  locale text not null default 'vi' check (locale in ('vi')),
  timezone text not null default 'Asia/Ho_Chi_Minh' check (char_length(timezone) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  reduce_motion boolean not null default false,
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per auth user; created by on_auth_user_created.';
comment on table public.user_preferences is 'UI preferences synced across devices.';

-- updated_at maintenance
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- Create profile + preferences for every new auth user (email or OAuth).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw_name text := coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', '');
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(left(btrim(raw_name), 60), ''));
  insert into public.user_preferences (user_id) values (new.id);
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row Level Security: a user may read and update only their own rows.
-- No insert/delete policies: rows are created by the trigger and removed by cascade.
alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;

create policy "profiles: read own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: update own" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "preferences: read own" on public.user_preferences
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "preferences: update own" on public.user_preferences
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
```

- [ ] **Step 6: Apply and test**

Run: `pnpm db:reset && pnpm db:test && pnpm db:lint`
Expected: `foundation.test.sql .. ok`, `All tests successful.`; lint prints no errors.

- [ ] **Step 7: Generate types and export them**

Run: `pnpm db:types && head -5 packages/shared/src/database.types.ts`
Expected: file starts with `export type Json =`.

Append to `packages/shared/src/index.ts`:
```ts
export type { Database, Json } from './database.types';
```

Run: `pnpm --filter @linguo/shared typecheck`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add supabase packages/shared
git commit -m "feat(db): add profiles and user_preferences with sign-up trigger, RLS and pgTAP tests"
```

---

### Task 12: Supabase client, `AuthProvider`, auth error map, safe redirects, route guards

**Files:**
- Create: `apps/web/src/lib/supabase.ts`, `apps/web/src/features/auth/error-map.ts`, `safe-next.ts`, `AuthProvider.tsx`, `guards.tsx`, `apps/web/src/components/layout/NotConfigured.tsx`, `FullScreenLoader.tsx`
- Test: `apps/web/src/features/auth/auth.test.tsx`

- [ ] **Step 1: Write the failing test** — `apps/web/src/features/auth/auth.test.tsx`

```tsx
import { act, render, screen } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { AppSupabaseClient } from '@/lib/supabase';
import { AuthContext, AuthProvider, useAuth, type AuthState } from './AuthProvider';
import { authErrorMessage } from './error-map';
import { RedirectIfAuthed, RequireAuth } from './guards';
import { safeNext } from './safe-next';

describe('authErrorMessage', () => {
  it('maps known Supabase codes to Vietnamese', () => {
    expect(authErrorMessage({ code: 'invalid_credentials' })).toBe('Email hoặc mật khẩu không đúng.');
    expect(authErrorMessage({ name: 'AuthRetryableFetchError', status: 0 })).toBe(
      'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.',
    );
    expect(authErrorMessage({ name: 'AuthPKCECodeVerifierMissingError' })).toMatch(/cùng trình duyệt/);
    expect(authErrorMessage({ code: 'something_new' })).toBe('Đã có lỗi xảy ra (mã: something_new). Vui lòng thử lại.');
    expect(authErrorMessage(undefined)).toBe('Đã có lỗi xảy ra. Vui lòng thử lại.');
  });
});

describe('safeNext', () => {
  it('only allows internal paths', () => {
    expect(safeNext('/app/cai-dat')).toBe('/app/cai-dat');
    expect(safeNext('https://evil.com')).toBe('/app');
    expect(safeNext('//evil.com')).toBe('/app');
    expect(safeNext('/\\evil.com')).toBe('/app');
    expect(safeNext(null)).toBe('/app');
  });
});

describe('AuthProvider', () => {
  it('moves from loading to signed-in and reacts to auth changes', async () => {
    let listener: ((event: string, session: Session | null) => void) | undefined;
    const session = { user: { id: 'u1', email: 'a@b.vn' } } as unknown as Session;
    const client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session } }),
        onAuthStateChange: vi.fn((cb) => {
          listener = cb;
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        }),
      },
    } as unknown as AppSupabaseClient;

    function Probe() {
      const auth = useAuth();
      return <span data-testid="status">{`${auth.status}:${auth.user?.id ?? '-'}`}</span>;
    }
    render(
      <AuthProvider client={client}>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByTestId('status')).toHaveTextContent('loading:-');
    expect(await screen.findByText('signed-in:u1')).toBeInTheDocument();
    act(() => listener?.('SIGNED_OUT', null));
    expect(screen.getByTestId('status')).toHaveTextContent('signed-out:-');
  });

  it('is "unconfigured" without a client', () => {
    function Probe() {
      return <span>{useAuth().status}</span>;
    }
    render(
      <AuthProvider client={null}>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByText('unconfigured')).toBeInTheDocument();
  });
});

function renderGuarded(state: AuthState, entry: string) {
  return render(
    <AuthContext.Provider value={state}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/app" element={<RequireAuth><p>Khu vực học</p></RequireAuth>} />
          <Route path="/dang-nhap" element={<RedirectIfAuthed><p>Trang đăng nhập</p></RedirectIfAuthed>} />
          <Route path="/app/cai-dat" element={<p>Cài đặt</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('guards', () => {
  const signedOut: AuthState = { status: 'signed-out', session: null, user: null };
  const signedIn = { status: 'signed-in', session: null, user: { id: 'u1' } } as unknown as AuthState;

  it('RequireAuth sends signed-out users to sign in', () => {
    renderGuarded(signedOut, '/app');
    expect(screen.getByText('Trang đăng nhập')).toBeInTheDocument();
  });

  it('RedirectIfAuthed sends signed-in users to a safe next', () => {
    renderGuarded(signedIn, '/dang-nhap?next=%2Fapp%2Fcai-dat');
    expect(screen.getByText('Cài đặt')).toBeInTheDocument();
  });

  it('shows the not-configured screen', () => {
    renderGuarded({ status: 'unconfigured', session: null, user: null }, '/app');
    expect(screen.getByRole('heading', { name: 'Chưa cấu hình Supabase' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @linguo/web test -- auth.test`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`apps/web/src/lib/supabase.ts`:
```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@linguo/shared';
import { env } from './env';

export type AppSupabaseClient = SupabaseClient<Database>;

let client: AppSupabaseClient | null = null;

/** Null when VITE_SUPABASE_* are missing; the UI then shows <NotConfigured />. */
export function getSupabase(): AppSupabaseClient | null {
  if (!env.isSupabaseConfigured) return null;
  client ??= createClient<Database>(env.supabaseUrl, env.supabaseKey, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      // /auth/callback exchanges the code explicitly; auto-detection would exchange it twice.
      detectSessionInUrl: false,
    },
  });
  return client;
}

export function requireSupabase(): AppSupabaseClient {
  const c = getSupabase();
  if (!c) throw new Error('Supabase chưa được cấu hình');
  return c;
}

/** Absolute URL for auth redirects (email links, OAuth), including the GitHub Pages base path. */
export function authRedirect(path: string): string {
  return `${env.siteUrl}${path}`;
}
```

`apps/web/src/features/auth/error-map.ts`:
```ts
const BY_CODE: Record<string, string> = {
  invalid_credentials: 'Email hoặc mật khẩu không đúng.',
  email_not_confirmed: 'Email chưa được xác minh. Hãy mở liên kết trong email chúng tôi đã gửi.',
  user_already_exists: 'Email này đã được đăng ký. Hãy đăng nhập hoặc dùng "Quên mật khẩu".',
  email_exists: 'Email này đã được đăng ký. Hãy đăng nhập hoặc dùng "Quên mật khẩu".',
  weak_password: 'Mật khẩu quá yếu. Hãy dùng ít nhất 8 ký tự, kết hợp chữ và số.',
  same_password: 'Mật khẩu mới phải khác mật khẩu cũ.',
  over_email_send_rate_limit: 'Bạn đã yêu cầu gửi email quá nhiều lần. Vui lòng thử lại sau ít phút.',
  over_request_rate_limit: 'Quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.',
  email_address_invalid: 'Email không hợp lệ.',
  signup_disabled: 'Đăng ký tạm thời bị tắt.',
  provider_disabled: 'Phương thức đăng nhập này chưa được bật.',
  flow_state_expired: 'Liên kết đã hết hạn. Vui lòng yêu cầu liên kết mới.',
  flow_state_not_found: 'Liên kết không hợp lệ hoặc đã được dùng. Vui lòng yêu cầu liên kết mới.',
  otp_expired: 'Liên kết đã hết hạn. Vui lòng yêu cầu liên kết mới.',
  session_not_found: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
};

const BY_NAME: Record<string, string> = {
  AuthPKCECodeVerifierMissingError:
    'Hãy mở liên kết trên cùng trình duyệt bạn đã dùng để đăng ký hoặc đăng nhập. Nếu đó là email xác minh, tài khoản có thể đã được xác minh — hãy thử đăng nhập.',
  AuthRetryableFetchError: 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.',
};

export function authErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const e = error as { code?: unknown; name?: unknown; status?: unknown };
    if (typeof e.code === 'string') {
      const byCode = BY_CODE[e.code];
      if (byCode) return byCode;
    }
    if (typeof e.name === 'string') {
      const byName = BY_NAME[e.name];
      if (byName) return byName;
    }
    if (e.status === 0 || error instanceof TypeError) return 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.';
    if (typeof e.code === 'string') return `Đã có lỗi xảy ra (mã: ${e.code}). Vui lòng thử lại.`;
  }
  return 'Đã có lỗi xảy ra. Vui lòng thử lại.';
}
```

`apps/web/src/features/auth/safe-next.ts`:
```ts
/** Only same-app paths: blocks open redirects like `//evil.com` or `https://…`. */
export function safeNext(next: string | null | undefined, fallback = '/app'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}
```

`apps/web/src/features/auth/AuthProvider.tsx`:
```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabase, type AppSupabaseClient } from '@/lib/supabase';

export interface AuthState {
  status: 'loading' | 'signed-out' | 'signed-in' | 'unconfigured';
  session: Session | null;
  user: User | null;
}

export const AuthContext = createContext<AuthState | null>(null);

const fromSession = (session: Session | null): AuthState =>
  session ? { status: 'signed-in', session, user: session.user } : { status: 'signed-out', session: null, user: null };

interface AuthProviderProps {
  children: ReactNode;
  /** Injected in tests; defaults to the app client (null when unconfigured). */
  client?: AppSupabaseClient | null;
}

export function AuthProvider({ children, client = getSupabase() }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>(() =>
    client ? { status: 'loading', session: null, user: null } : { status: 'unconfigured', session: null, user: null },
  );

  useEffect(() => {
    if (!client) return;
    let active = true;
    client.auth.getSession().then(({ data }) => {
      if (active) setState(fromSession(data.session));
    });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (active) setState(fromSession(session));
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
```

`apps/web/src/components/layout/FullScreenLoader.tsx`:
```tsx
import { Spinner } from '@/components/ui/Spinner';

export function FullScreenLoader({ label = 'Đang tải…' }: { label?: string }) {
  return (
    <div role="status" className="flex min-h-hero items-center justify-center gap-3 text-muted">
      <Spinner className="size-6 text-primary" />
      <span>{label}</span>
    </div>
  );
}
```

`apps/web/src/components/layout/NotConfigured.tsx`:
```tsx
import { Settings2 } from 'lucide-react';
import { Link } from 'react-router';
import { SolidCard } from '@/components/ui/SolidCard';

/** Shown instead of auth/app screens when VITE_SUPABASE_* are not set. The landing page still works. */
export function NotConfigured() {
  return (
    <div className="flex min-h-hero items-center justify-center px-safe py-10">
      <SolidCard className="max-w-md space-y-4 text-center">
        <Settings2 aria-hidden className="mx-auto size-10 text-warn" />
        <h1 className="text-xl font-bold">Chưa cấu hình Supabase</h1>
        <p className="text-[15px] leading-relaxed text-muted">
          Thiếu <code>VITE_SUPABASE_URL</code> hoặc <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>. Làm theo hướng dẫn trong{' '}
          <code>docs/SETUP.md</code> rồi chạy lại.
        </p>
        <Link to="/" className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
          Về trang giới thiệu
        </Link>
      </SolidCard>
    </div>
  );
}
```

`apps/web/src/features/auth/guards.tsx`:
```tsx
import type { ReactNode } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router';
import { FullScreenLoader } from '@/components/layout/FullScreenLoader';
import { NotConfigured } from '@/components/layout/NotConfigured';
import { useAuth } from './AuthProvider';
import { safeNext } from './safe-next';

export function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.status === 'unconfigured') return <NotConfigured />;
  if (auth.status === 'loading') return <FullScreenLoader />;
  if (auth.status === 'signed-out') {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/dang-nhap?next=${next}`} replace />;
  }
  return <>{children}</>;
}

export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [params] = useSearchParams();
  if (auth.status === 'unconfigured') return <NotConfigured />;
  if (auth.status === 'loading') return <FullScreenLoader />;
  if (auth.status === 'signed-in') return <Navigate to={safeNext(params.get('next'))} replace />;
  return <>{children}</>;
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @linguo/web test -- auth.test && pnpm --filter @linguo/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(auth): add Supabase client, auth provider, Vietnamese error map and route guards"
```

---

### Task 13: Profile & preferences services, `ProfileProvider`, preference sync, test helpers

**Files:**
- Create: `apps/web/src/features/profile/service.ts`, `ProfileProvider.tsx`, `apps/web/src/features/preferences/service.ts`, `usePreferencesSync.ts`, `apps/web/tests/unit/fake-supabase.ts`, `apps/web/tests/unit/render.tsx`
- Test: `apps/web/src/features/profile/profile.test.tsx`

- [ ] **Step 1: Test helpers**

`apps/web/tests/unit/fake-supabase.ts`:
```ts
import type { AppSupabaseClient } from '@/lib/supabase';

export interface FakeQuery {
  calls: Array<[string, unknown[]]>;
  builder: Record<string, unknown>;
}

/** Chainable, awaitable stand-in for a PostgREST query builder. */
export function fakeQuery(result: { data: unknown; error: unknown }): FakeQuery {
  const calls: FakeQuery['calls'] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'update', 'single', 'maybeSingle']) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return { calls, builder };
}

export function fakeClient(tables: Record<string, FakeQuery>): AppSupabaseClient {
  return {
    from: (table: string) => {
      const q = tables[table];
      if (!q) throw new Error(`No fake for table ${table}`);
      return q.builder;
    },
  } as unknown as AppSupabaseClient;
}
```

`apps/web/tests/unit/render.tsx`:
```tsx
import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import { MemoryRouter, useLocation } from 'react-router';
import { vi } from 'vitest';
import { DEFAULT_TIMEZONE } from '@linguo/shared';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthContext, type AuthState } from '@/features/auth/AuthProvider';
import { ProfileContext, type ProfileContextValue } from '@/features/profile/ProfileProvider';
import { MotionProvider } from '@/providers/MotionProvider';
import { ThemeProvider } from '@/providers/ThemeProvider';

export const TEST_USER_ID = '11111111-1111-4111-8111-111111111111';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

interface Options {
  route?: string;
  auth?: Partial<AuthState>;
  profile?: Partial<ProfileContextValue>;
}

/** Renders `ui` inside every app provider with a signed-in user by default. */
export function renderWithProviders(ui: ReactElement, { route = '/', auth, profile }: Options = {}) {
  const authValue: AuthState = {
    status: 'signed-in',
    session: null,
    user: { id: TEST_USER_ID, email: 'minhanh@example.com' } as User,
    ...auth,
  };
  const profileValue: ProfileContextValue = {
    status: 'ready',
    profile: { id: TEST_USER_ID, displayName: 'Minh Anh', timezone: DEFAULT_TIMEZONE },
    error: null,
    reload: vi.fn(),
    setProfile: vi.fn(),
    ...profile,
  };
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ThemeProvider>
        <MotionProvider>
          <ToastProvider>
            <AuthContext.Provider value={authValue}>
              <ProfileContext.Provider value={profileValue}>
                {ui}
                <LocationProbe />
              </ProfileContext.Provider>
            </AuthContext.Provider>
          </ToastProvider>
        </MotionProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}
```

- [ ] **Step 2: Write the failing test** — `apps/web/src/features/profile/profile.test.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { fakeClient, fakeQuery } from '../../../tests/unit/fake-supabase';
import { AuthContext } from '../auth/AuthProvider';
import { fetchPreferences, updatePreferences } from '../preferences/service';
import { ProfileProvider, useProfile } from './ProfileProvider';
import { fetchProfile, updateProfile } from './service';

const mocks = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client }));

describe('profile service', () => {
  it('maps the row to a Profile', async () => {
    const q = fakeQuery({ data: { id: 'u1', display_name: null, timezone: 'Asia/Ho_Chi_Minh' }, error: null });
    const profile = await fetchProfile(fakeClient({ profiles: q }), 'u1');
    expect(profile).toEqual({ id: 'u1', displayName: '', timezone: 'Asia/Ho_Chi_Minh' });
    expect(q.calls).toContainEqual(['eq', ['id', 'u1']]);
  });

  it('stores an empty display name as null and throws on errors', async () => {
    const ok = fakeQuery({ data: null, error: null });
    await updateProfile(fakeClient({ profiles: ok }), 'u1', { displayName: '', timezone: 'UTC' });
    expect(ok.calls[0]).toEqual(['update', [{ display_name: null, timezone: 'UTC' }]]);

    const failing = fakeQuery({ data: null, error: { message: 'boom' } });
    await expect(updateProfile(fakeClient({ profiles: failing }), 'u1', { displayName: 'A', timezone: 'UTC' })).rejects.toEqual({
      message: 'boom',
    });
  });
});

describe('preferences service', () => {
  it('reads and writes camelCase preferences', async () => {
    const read = fakeQuery({ data: { theme: 'dark', reduce_motion: true }, error: null });
    expect(await fetchPreferences(fakeClient({ user_preferences: read }), 'u1')).toEqual({ theme: 'dark', reduceMotion: true });

    const write = fakeQuery({ data: null, error: null });
    await updatePreferences(fakeClient({ user_preferences: write }), 'u1', { theme: 'light', reduceMotion: false });
    expect(write.calls[0]).toEqual(['update', [{ theme: 'light', reduce_motion: false }]]);
  });
});

describe('ProfileProvider', () => {
  it('loads the signed-in user profile', async () => {
    mocks.client = fakeClient({
      profiles: fakeQuery({ data: { id: 'u1', display_name: 'Minh Anh', timezone: 'Asia/Ho_Chi_Minh' }, error: null }),
    });
    function Probe() {
      const { status, profile } = useProfile();
      return <span>{`${status}:${profile?.displayName ?? ''}`}</span>;
    }
    render(
      <AuthContext.Provider value={{ status: 'signed-in', session: null, user: { id: 'u1' } as User }}>
        <ProfileProvider>
          <Probe />
        </ProfileProvider>
      </AuthContext.Provider>,
    );
    expect(screen.getByText('loading:')).toBeInTheDocument();
    expect(await screen.findByText('ready:Minh Anh')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @linguo/web test -- profile.test`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement**

`apps/web/src/features/profile/service.ts`:
```ts
import type { ProfileUpdateInput } from '@linguo/shared';
import type { AppSupabaseClient } from '@/lib/supabase';

export interface Profile {
  id: string;
  displayName: string;
  timezone: string;
}

export async function fetchProfile(client: AppSupabaseClient, userId: string): Promise<Profile> {
  const { data, error } = await client.from('profiles').select('id, display_name, timezone').eq('id', userId).single();
  if (error) throw error;
  return { id: data.id, displayName: data.display_name ?? '', timezone: data.timezone };
}

export async function updateProfile(client: AppSupabaseClient, userId: string, input: ProfileUpdateInput): Promise<void> {
  const { error } = await client
    .from('profiles')
    .update({ display_name: input.displayName || null, timezone: input.timezone })
    .eq('id', userId);
  if (error) throw error;
}
```

`apps/web/src/features/preferences/service.ts`:
```ts
import type { PreferencesUpdateInput, ThemePreference } from '@linguo/shared';
import type { AppSupabaseClient } from '@/lib/supabase';

export interface Preferences {
  theme: ThemePreference;
  reduceMotion: boolean;
}

export async function fetchPreferences(client: AppSupabaseClient, userId: string): Promise<Preferences> {
  const { data, error } = await client.from('user_preferences').select('theme, reduce_motion').eq('user_id', userId).single();
  if (error) throw error;
  return { theme: data.theme as ThemePreference, reduceMotion: data.reduce_motion };
}

export async function updatePreferences(client: AppSupabaseClient, userId: string, input: PreferencesUpdateInput): Promise<void> {
  const { error } = await client
    .from('user_preferences')
    .update({ theme: input.theme, reduce_motion: input.reduceMotion })
    .eq('user_id', userId);
  if (error) throw error;
}
```

`apps/web/src/features/profile/ProfileProvider.tsx`:
```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/AuthProvider';
import { fetchProfile, type Profile } from './service';

export interface ProfileContextValue {
  status: 'loading' | 'ready' | 'error';
  profile: Profile | null;
  error: unknown;
  reload: () => void;
  setProfile: (profile: Profile) => void;
}

export const ProfileContext = createContext<ProfileContextValue | null>(null);

interface State {
  status: ProfileContextValue['status'];
  profile: Profile | null;
  error: unknown;
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [state, setState] = useState<State>({ status: 'loading', profile: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const client = getSupabase();
    if (!client || !userId) return;
    let active = true;
    setState((s) => ({ ...s, status: 'loading', error: null }));
    fetchProfile(client, userId)
      .then((profile) => {
        if (active) setState({ status: 'ready', profile, error: null });
      })
      .catch((error: unknown) => {
        if (active) setState({ status: 'error', profile: null, error });
      });
    return () => {
      active = false;
    };
  }, [userId, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const setProfile = useCallback((profile: Profile) => setState({ status: 'ready', profile, error: null }), []);
  const value = useMemo(() => ({ ...state, reload, setProfile }), [state, reload, setProfile]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used inside <ProfileProvider>');
  return ctx;
}
```

`apps/web/src/features/preferences/usePreferencesSync.ts`:
```ts
import { useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/AuthProvider';
import { useMotionPrefs } from '@/providers/MotionProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { fetchPreferences } from './service';

/** After sign-in, adopt the preferences saved on the server (other devices may have changed them). */
export function usePreferencesSync(): void {
  const { user } = useAuth();
  const { setPreference } = useTheme();
  const { setUserReduceMotion } = useMotionPrefs();
  const userId = user?.id;

  useEffect(() => {
    const client = getSupabase();
    if (!client || !userId) return;
    let active = true;
    fetchPreferences(client, userId)
      .then((prefs) => {
        if (!active) return;
        setPreference(prefs.theme);
        setUserReduceMotion(prefs.reduceMotion);
      })
      .catch(() => {
        // Keep the device-local preferences; Settings surfaces save errors.
      });
    return () => {
      active = false;
    };
  }, [userId, setPreference, setUserReduceMotion]);
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @linguo/web test && pnpm --filter @linguo/web typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src apps/web/tests
git commit -m "feat(profile): add profile/preferences services, ProfileProvider, preference sync and test helpers"
```

---

### Task 14: Auth screens (`AuthLayout`, sign in, sign up, check email, forgot/reset password, callback)

**Files:**
- Create: `apps/web/src/components/layout/AuthLayout.tsx`, `apps/web/src/routes/auth/AuthCard.tsx`, `GoogleButton.tsx`, `SignInPage.tsx`, `SignUpPage.tsx`, `CheckEmailPage.tsx`, `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx`, `AuthCallbackPage.tsx`
- Test: `apps/web/src/routes/auth/auth-pages.test.tsx`

- [ ] **Step 1: Write the failing test** — `apps/web/src/routes/auth/auth-pages.test.tsx`

```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../tests/unit/render';
import type { ReactElement } from 'react';
import { AuthCallbackPage } from './AuthCallbackPage';
import { ForgotPasswordPage } from './ForgotPasswordPage';
import { SignInPage } from './SignInPage';
import { SignUpPage } from './SignUpPage';

const mocks = vi.hoisted(() => ({
  auth: {
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    exchangeCodeForSession: vi.fn(),
    resend: vi.fn(),
    updateUser: vi.fn(),
    signInWithOAuth: vi.fn(),
  },
}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ auth: mocks.auth }),
  requireSupabase: () => ({ auth: mocks.auth }),
  authRedirect: (path: string) => `http://localhost:5173${path}`,
}));

const signedOut = { auth: { status: 'signed-out' as const, session: null, user: null } };

function at(route: string, path: string, element: ReactElement) {
  return renderWithProviders(
    <Routes>
      <Route path={path} element={element} />
      <Route path="*" element={null} />
    </Routes>,
    { route, ...signedOut },
  );
}

beforeEach(() => {
  for (const fn of Object.values(mocks.auth)) fn.mockReset();
});

describe('SignInPage', () => {
  it('validates before calling Supabase', async () => {
    at('/dang-nhap', '/dang-nhap', <SignInPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(screen.getByText('Vui lòng nhập email.')).toBeInTheDocument();
    expect(mocks.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('signs in and goes to the safe next path', async () => {
    mocks.auth.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    at('/dang-nhap?next=%2Fapp%2Fcai-dat', '/dang-nhap', <SignInPage />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.vn');
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'matkhau123');
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/app/cai-dat'));
    expect(mocks.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.vn', password: 'matkhau123' });
  });

  it('shows a Vietnamese error on bad credentials', async () => {
    mocks.auth.signInWithPassword.mockResolvedValue({ data: {}, error: { code: 'invalid_credentials' } });
    at('/dang-nhap', '/dang-nhap', <SignInPage />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.vn');
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'sai');
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByText('Email hoặc mật khẩu không đúng.')).toBeInTheDocument();
  });
});

describe('SignUpPage', () => {
  it('sends the display name and goes to the check-email screen', async () => {
    mocks.auth.signUp.mockResolvedValue({ data: { session: null, user: { id: 'u1' } }, error: null });
    at('/dang-ky', '/dang-ky', <SignUpPage />);
    await userEvent.type(screen.getByLabelText('Tên hiển thị (không bắt buộc)'), 'Minh Anh');
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.vn');
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'matkhau123');
    await userEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/kiem-tra-email'));
    expect(mocks.auth.signUp).toHaveBeenCalledWith({
      email: 'a@b.vn',
      password: 'matkhau123',
      options: { emailRedirectTo: 'http://localhost:5173/auth/callback', data: { display_name: 'Minh Anh' } },
    });
  });
});

describe('ForgotPasswordPage', () => {
  it('always shows a neutral confirmation', async () => {
    mocks.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    at('/quen-mat-khau', '/quen-mat-khau', <ForgotPasswordPage />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.vn');
    await userEvent.click(screen.getByRole('button', { name: 'Gửi liên kết đặt lại' }));
    expect(await screen.findByText(/Nếu email này có tài khoản/)).toBeInTheDocument();
    expect(mocks.auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.vn', {
      redirectTo: 'http://localhost:5173/auth/callback?next=%2Fdat-lai-mat-khau',
    });
  });
});

describe('AuthCallbackPage', () => {
  it('exchanges the code and redirects', async () => {
    mocks.auth.exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
    at('/auth/callback?code=abc&next=%2Fdat-lai-mat-khau', '/auth/callback', <AuthCallbackPage />);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/dat-lai-mat-khau'));
    expect(mocks.auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(mocks.auth.exchangeCodeForSession).toHaveBeenCalledWith('abc');
  });

  it('shows provider errors', async () => {
    at('/auth/callback?error=access_denied&error_description=Link%20het%20han', '/auth/callback', <AuthCallbackPage />);
    expect(await screen.findByRole('heading', { name: 'Không hoàn tất được đăng nhập' })).toBeInTheDocument();
    expect(screen.getByText('Link het han')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @linguo/web test -- auth-pages`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement layout and shared pieces**

`apps/web/src/components/layout/AuthLayout.tsx`:
```tsx
import { Link, Outlet } from 'react-router';
import { asset } from '@/lib/asset';

export function AuthLayout() {
  return (
    <div className="relative min-h-hero overflow-x-clip bg-bg">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_55%_at_10%_0%,rgb(76_162_209/0.25),transparent_65%),radial-gradient(ellipse_70%_50%_at_100%_100%,rgb(243_125_37/0.18),transparent_65%)]"
      />
      <div className="relative mx-auto flex min-h-hero w-full max-w-md flex-col px-safe pb-safe pt-safe">
        <header className="flex items-center py-3">
          <Link to="/" className="inline-flex min-h-11 items-center gap-2 text-lg font-bold tracking-[-0.02em]">
            <img src={asset('brand/logo-mark.svg')} alt="" width={32} height={32} className="size-8" />
            Linguo
          </Link>
        </header>
        <main id="main" className="flex flex-1 flex-col justify-center py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

`apps/web/src/routes/auth/AuthCard.tsx`:
```tsx
import type { ReactNode } from 'react';
import { SolidCard } from '@/components/ui/SolidCard';

interface AuthCardProps {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">{title}</h1>
        {subtitle && <p className="text-[15px] leading-relaxed text-muted">{subtitle}</p>}
      </div>
      <SolidCard className="space-y-5 p-6">{children}</SolidCard>
      {footer && <div className="text-center text-[15px] text-muted">{footer}</div>}
    </div>
  );
}

export function FormAlert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-2xl border border-error/30 bg-error/10 px-4 py-3 text-[15px] text-error">
      {children}
    </p>
  );
}

export const textLinkClass = 'inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline';
```

`apps/web/src/routes/auth/GoogleButton.tsx`:
```tsx
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { authErrorMessage } from '@/features/auth/error-map';
import { env } from '@/lib/env';
import { authRedirect, requireSupabase } from '@/lib/supabase';

/** Hidden unless VITE_AUTH_GOOGLE_ENABLED=true (Google provider configured in the Supabase dashboard). */
export function GoogleButton({ next, onError }: { next: string; onError: (message: string) => void }) {
  const [loading, setLoading] = useState(false);
  if (!env.googleEnabled) return null;

  async function onClick() {
    setLoading(true);
    const { error } = await requireSupabase().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: authRedirect(`/auth/callback?next=${encodeURIComponent(next)}`) },
    });
    if (error) {
      setLoading(false);
      onError(authErrorMessage(error));
    }
  }

  return (
    <>
      <Button variant="ghost" size="lg" block loading={loading} onClick={onClick}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5">
          <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8Z" />
          <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
          <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z" />
          <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
        </svg>
        Tiếp tục với Google
      </Button>
      <div className="flex items-center gap-3 text-sm text-muted">
        <span className="h-px flex-1 bg-border" />
        hoặc
        <span className="h-px flex-1 bg-border" />
      </div>
    </>
  );
}
```

- [ ] **Step 4: Implement the pages**

`apps/web/src/routes/auth/SignInPage.tsx`:
```tsx
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { fieldErrors, signInSchema } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { authErrorMessage } from '@/features/auth/error-map';
import { safeNext } from '@/features/auth/safe-next';
import { requireSupabase } from '@/lib/supabase';
import { AuthCard, FormAlert, textLinkClass } from './AuthCard';
import { GoogleButton } from './GoogleButton';

export function SignInPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setFormError(null);
    setLoading(true);
    try {
      const { error } = await requireSupabase().auth.signInWithPassword(parsed.data);
      if (error) {
        setFormError(authErrorMessage(error));
        return;
      }
      navigate(next, { replace: true });
    } catch (error) {
      setFormError(authErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Chào mừng trở lại"
      subtitle="Đăng nhập để tiếp tục lộ trình của bạn."
      footer={
        <>
          Chưa có tài khoản?{' '}
          <Link to="/dang-ky" className={textLinkClass}>
            Đăng ký miễn phí
          </Link>
        </>
      }
    >
      <GoogleButton next={next} onError={setFormError} />
      <form noValidate onSubmit={onSubmit} className="space-y-4">
        {formError && <FormAlert>{formError}</FormAlert>}
        <FormField label="Email" error={errors.email}>
          {({ invalid, ...a11y }) => (
            <Input
              {...a11y}
              invalid={invalid}
              type="email"
              inputMode="email"
              autoComplete="email"
              enterKeyHint="next"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </FormField>
        <FormField label="Mật khẩu" error={errors.password}>
          {({ invalid, ...a11y }) => (
            <PasswordInput
              {...a11y}
              invalid={invalid}
              autoComplete="current-password"
              enterKeyHint="go"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </FormField>
        <div className="flex justify-end">
          <Link to="/quen-mat-khau" className={textLinkClass}>
            Quên mật khẩu?
          </Link>
        </div>
        <Button type="submit" variant="accent" size="lg" block loading={loading}>
          Đăng nhập
        </Button>
      </form>
    </AuthCard>
  );
}
```

`apps/web/src/routes/auth/SignUpPage.tsx`:
```tsx
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { fieldErrors, signUpSchema } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { authErrorMessage } from '@/features/auth/error-map';
import { authRedirect, requireSupabase } from '@/lib/supabase';
import { AuthCard, FormAlert, textLinkClass } from './AuthCard';
import { GoogleButton } from './GoogleButton';

export function SignUpPage() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    const parsed = signUpSchema.safeParse({ displayName, email, password });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setFormError(null);
    setLoading(true);
    try {
      const { data, error } = await requireSupabase().auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: { emailRedirectTo: authRedirect('/auth/callback'), data: { display_name: parsed.data.displayName } },
      });
      if (error) {
        setFormError(authErrorMessage(error));
        return;
      }
      // With email confirmation on, there is no session yet (also when the email already exists — Supabase hides that).
      if (data.session) navigate('/app', { replace: true });
      else navigate('/kiem-tra-email', { replace: true, state: { email: parsed.data.email } });
    } catch (error) {
      setFormError(authErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Tạo tài khoản"
      subtitle="Miễn phí. Bạn có thể học tiếng Anh và tiếng Hàn trên cùng một tài khoản."
      footer={
        <>
          Đã có tài khoản?{' '}
          <Link to="/dang-nhap" className={textLinkClass}>
            Đăng nhập
          </Link>
        </>
      }
    >
      <GoogleButton next="/app" onError={setFormError} />
      <form noValidate onSubmit={onSubmit} className="space-y-4">
        {formError && <FormAlert>{formError}</FormAlert>}
        <FormField label="Tên hiển thị (không bắt buộc)" error={errors.displayName}>
          {({ invalid, ...a11y }) => (
            <Input
              {...a11y}
              invalid={invalid}
              autoComplete="nickname"
              enterKeyHint="next"
              maxLength={60}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          )}
        </FormField>
        <FormField label="Email" error={errors.email}>
          {({ invalid, ...a11y }) => (
            <Input
              {...a11y}
              invalid={invalid}
              type="email"
              inputMode="email"
              autoComplete="email"
              enterKeyHint="next"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </FormField>
        <FormField label="Mật khẩu" hint="Ít nhất 8 ký tự." error={errors.password}>
          {({ invalid, ...a11y }) => (
            <PasswordInput
              {...a11y}
              invalid={invalid}
              autoComplete="new-password"
              enterKeyHint="go"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </FormField>
        <Button type="submit" variant="accent" size="lg" block loading={loading}>
          Tạo tài khoản
        </Button>
        <p className="text-center text-sm text-muted">
          Khi tạo tài khoản, bạn đồng ý với{' '}
          <Link to="/dieu-khoan" className={textLinkClass}>
            Điều khoản
          </Link>{' '}
          và{' '}
          <Link to="/quyen-rieng-tu" className={textLinkClass}>
            Quyền riêng tư
          </Link>
          .
        </p>
      </form>
    </AuthCard>
  );
}
```

`apps/web/src/routes/auth/CheckEmailPage.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { MailCheck } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { Button } from '@/components/ui/Button';
import { authErrorMessage } from '@/features/auth/error-map';
import { authRedirect, requireSupabase } from '@/lib/supabase';
import { AuthCard, FormAlert, textLinkClass } from './AuthCard';

const COOLDOWN_S = 60;

export function CheckEmailPage() {
  const location = useLocation();
  const email = (location.state as { email?: string } | null)?.email;
  const [cooldown, setCooldown] = useState(COOLDOWN_S);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  async function resend() {
    if (!email) return;
    setLoading(true);
    const { error } = await requireSupabase().auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: authRedirect('/auth/callback') },
    });
    setLoading(false);
    if (error) setMessage({ tone: 'error', text: authErrorMessage(error) });
    else {
      setMessage({ tone: 'ok', text: 'Đã gửi lại email xác minh.' });
      setCooldown(COOLDOWN_S);
    }
  }

  return (
    <AuthCard
      title="Kiểm tra email của bạn"
      subtitle={
        email ? (
          <>
            Chúng tôi đã gửi liên kết xác minh tới <strong className="text-text">{email}</strong>. Mở liên kết trên{' '}
            <strong className="text-text">cùng trình duyệt này</strong> để hoàn tất.
          </>
        ) : (
          'Mở liên kết xác minh trong email để hoàn tất đăng ký.'
        )
      }
      footer={
        <Link to="/dang-nhap" className={textLinkClass}>
          Quay lại đăng nhập
        </Link>
      }
    >
      <MailCheck aria-hidden className="mx-auto size-12 text-primary" />
      <p className="text-center text-[15px] text-muted">Không thấy email? Kiểm tra mục Spam hoặc Quảng cáo.</p>
      {message?.tone === 'error' && <FormAlert>{message.text}</FormAlert>}
      {message?.tone === 'ok' && (
        <p role="status" className="text-center text-[15px] text-success">
          {message.text}
        </p>
      )}
      {email && (
        <Button variant="ghost" block loading={loading} disabled={cooldown > 0} onClick={resend}>
          {cooldown > 0 ? `Gửi lại sau ${cooldown}s` : 'Gửi lại email'}
        </Button>
      )}
    </AuthCard>
  );
}
```

`apps/web/src/routes/auth/ForgotPasswordPage.tsx`:
```tsx
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { fieldErrors, forgotPasswordSchema } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { authErrorMessage } from '@/features/auth/error-map';
import { authRedirect, requireSupabase } from '@/lib/supabase';
import { AuthCard, FormAlert, textLinkClass } from './AuthCard';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError(fieldErrors(parsed.error).email);
      return;
    }
    setError(undefined);
    setFormError(null);
    setLoading(true);
    try {
      const { error: authError } = await requireSupabase().auth.resetPasswordForEmail(parsed.data.email, {
        redirectTo: authRedirect(`/auth/callback?next=${encodeURIComponent('/dat-lai-mat-khau')}`),
      });
      // Never reveal whether the email exists: only network / rate-limit problems are shown.
      if (authError && (authError.status === 0 || authError.status === 429)) setFormError(authErrorMessage(authError));
      else setSent(true);
    } catch (err) {
      setFormError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Quên mật khẩu"
      subtitle="Nhập email đã đăng ký. Chúng tôi sẽ gửi liên kết để đặt mật khẩu mới."
      footer={
        <Link to="/dang-nhap" className={textLinkClass}>
          Quay lại đăng nhập
        </Link>
      }
    >
      {sent ? (
        <p role="status" className="text-[15px] leading-relaxed">
          Nếu email này có tài khoản, liên kết đặt lại mật khẩu sẽ đến trong vài phút. Hãy mở liên kết trên cùng trình duyệt
          này.
        </p>
      ) : (
        <form noValidate onSubmit={onSubmit} className="space-y-4">
          {formError && <FormAlert>{formError}</FormAlert>}
          <FormField label="Email" error={error}>
            {({ invalid, ...a11y }) => (
              <Input
                {...a11y}
                invalid={invalid}
                type="email"
                inputMode="email"
                autoComplete="email"
                enterKeyHint="send"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </FormField>
          <Button type="submit" variant="accent" size="lg" block loading={loading}>
            Gửi liên kết đặt lại
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
```

`apps/web/src/routes/auth/ResetPasswordPage.tsx`:
```tsx
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { fieldErrors, resetPasswordSchema } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { useToast } from '@/components/ui/Toast';
import { authErrorMessage } from '@/features/auth/error-map';
import { requireSupabase } from '@/lib/supabase';
import { AuthCard, FormAlert } from './AuthCard';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    const parsed = resetPasswordSchema.safeParse({ password, confirm });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setFormError(null);
    setLoading(true);
    try {
      const { error } = await requireSupabase().auth.updateUser({ password: parsed.data.password });
      if (error) {
        setFormError(authErrorMessage(error));
        return;
      }
      toast.show({ tone: 'success', message: 'Đã đặt mật khẩu mới.' });
      navigate('/app', { replace: true });
    } catch (error) {
      setFormError(authErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Đặt mật khẩu mới" subtitle="Chọn mật khẩu mới cho tài khoản của bạn.">
      <form noValidate onSubmit={onSubmit} className="space-y-4">
        {formError && <FormAlert>{formError}</FormAlert>}
        <FormField label="Mật khẩu mới" hint="Ít nhất 8 ký tự." error={errors.password}>
          {({ invalid, ...a11y }) => (
            <PasswordInput {...a11y} invalid={invalid} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
        </FormField>
        <FormField label="Nhập lại mật khẩu mới" error={errors.confirm}>
          {({ invalid, ...a11y }) => (
            <PasswordInput
              {...a11y}
              invalid={invalid}
              autoComplete="new-password"
              enterKeyHint="go"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          )}
        </FormField>
        <Button type="submit" variant="accent" size="lg" block loading={loading}>
          Lưu mật khẩu mới
        </Button>
      </form>
    </AuthCard>
  );
}
```

`apps/web/src/routes/auth/AuthCallbackPage.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { FullScreenLoader } from '@/components/layout/FullScreenLoader';
import { buttonClasses } from '@/components/ui/Button';
import { authErrorMessage } from '@/features/auth/error-map';
import { safeNext } from '@/features/auth/safe-next';
import { requireSupabase } from '@/lib/supabase';
import { AuthCard } from './AuthCard';

export function AuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const started = useRef(false);
  const providerError = params.get('error_description') ?? params.get('error');
  const [error, setError] = useState<string | null>(providerError);

  useEffect(() => {
    if (started.current || providerError) return;
    started.current = true; // StrictMode runs effects twice; a code can be exchanged only once.
    const code = params.get('code');
    if (!code) {
      navigate('/dang-nhap', { replace: true });
      return;
    }
    requireSupabase()
      .auth.exchangeCodeForSession(code)
      .then(({ error: exchangeError }) => {
        if (exchangeError) setError(authErrorMessage(exchangeError));
        else navigate(safeNext(params.get('next')), { replace: true });
      })
      .catch((err: unknown) => setError(authErrorMessage(err)));
  }, [params, navigate, providerError]);

  if (!error) return <FullScreenLoader label="Đang hoàn tất đăng nhập…" />;

  return (
    <AuthCard title="Không hoàn tất được đăng nhập" subtitle={error}>
      <Link to="/dang-nhap" className={buttonClasses('accent', 'lg', true)}>
        Đến trang đăng nhập
      </Link>
    </AuthCard>
  );
}
```

- [ ] **Step 5: Run tests, typecheck, lint**

Run: `pnpm --filter @linguo/web test -- auth-pages && pnpm --filter @linguo/web typecheck && pnpm lint`
Expected: PASS, exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src
git commit -m "feat(auth): add sign in, sign up, check email, password reset and OAuth callback screens"
```

---

## Phase D — Screens

### Task 15: App shell (`AppBar`, `BottomNav`, `Sidebar`, `MoreSheet`, `AppLayout`) + Home + Coming soon

**Files:**
- Create: `apps/web/src/components/layout/nav.ts`, `AppBar.tsx`, `BottomNav.tsx`, `Sidebar.tsx`, `MoreSheet.tsx`, `AppLayout.tsx`, `apps/web/src/routes/app/HomePage.tsx`, `ComingSoonPage.tsx`
- Test: `apps/web/src/components/layout/shell.test.tsx`

- [ ] **Step 1: Write the failing test** — `apps/web/src/components/layout/shell.test.tsx`

```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../tests/unit/render';
import { ComingSoonPage } from '@/routes/app/ComingSoonPage';
import { HomePage } from '@/routes/app/HomePage';
import { AppBar } from './AppBar';
import { BottomNav } from './BottomNav';
import { MoreSheet } from './MoreSheet';

vi.mock('@/lib/supabase', () => ({ getSupabase: () => null, requireSupabase: () => ({}) }));

describe('BottomNav', () => {
  it('has five tabs and marks the current one', () => {
    renderWithProviders(<BottomNav onMore={() => {}} />, { route: '/app/on-tap' });
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    expect(nav.querySelectorAll('li')).toHaveLength(5);
    expect(screen.getByRole('link', { name: 'Ôn tập' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Trang chủ' })).not.toHaveAttribute('aria-current');
  });

  it('opens "Thêm"', async () => {
    const onMore = vi.fn();
    renderWithProviders(<BottomNav onMore={onMore} />, { route: '/app' });
    await userEvent.click(screen.getByRole('button', { name: 'Thêm' }));
    expect(onMore).toHaveBeenCalledOnce();
  });
});

describe('MoreSheet', () => {
  it('lists secondary destinations and closes on Escape', async () => {
    localStorage.setItem('lp-reduce-motion', 'true');
    const onClose = vi.fn();
    renderWithProviders(<MoreSheet open onClose={onClose} />, { route: '/app' });
    const dialog = screen.getByRole('dialog', { name: 'Thêm' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Luyện thi/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Tiến độ/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Cài đặt/ })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe('AppBar', () => {
  it('shows the language pill and an avatar link to settings', () => {
    renderWithProviders(<AppBar />, { route: '/app' });
    expect(screen.getByRole('button', { name: /Ngôn ngữ đang học/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tài khoản và cài đặt' })).toHaveTextContent('M');
  });
});

describe('HomePage', () => {
  it('greets by display name and shows the onboarding empty state without fake numbers', () => {
    renderWithProviders(<HomePage />, { route: '/app' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chào Minh Anh');
    expect(screen.getByRole('heading', { name: 'Bắt đầu lộ trình đầu tiên' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tạo lộ trình' })).toBeDisabled();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('falls back to "bạn" without a name', () => {
    renderWithProviders(<HomePage />, {
      route: '/app',
      profile: { profile: { id: 'u', displayName: '', timezone: 'Asia/Ho_Chi_Minh' } },
    });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chào bạn');
  });
});

describe('ComingSoonPage', () => {
  it('names the feature', () => {
    renderWithProviders(<ComingSoonPage title="Ôn tập" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Ôn tập' })).toBeInTheDocument();
    expect(screen.getByText(/Tính năng Ôn tập đang được xây dựng/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @linguo/web test -- shell`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement navigation config and components**

`apps/web/src/components/layout/nav.ts`:
```ts
import { BookOpen, GraduationCap, House, RotateCcw, Settings, Sparkles, TrendingUp, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

/** Bottom bar (mobile) shows these 4 + "Thêm". Sidebar (desktop ≥1024px) shows all 7 (PRD 12.2). */
export const PRIMARY_NAV: NavItem[] = [
  { to: '/app', label: 'Trang chủ', icon: House, end: true },
  { to: '/app/hoc-tap', label: 'Học tập', icon: BookOpen },
  { to: '/app/on-tap', label: 'Ôn tập', icon: RotateCcw },
  { to: '/app/gia-su', label: 'Gia sư AI', icon: Sparkles },
];

export const MORE_NAV: NavItem[] = [
  { to: '/app/luyen-thi', label: 'Luyện thi', icon: GraduationCap },
  { to: '/app/tien-do', label: 'Tiến độ', icon: TrendingUp },
  { to: '/app/cai-dat', label: 'Cài đặt', icon: Settings },
];
```

`apps/web/src/components/layout/BottomNav.tsx`:
```tsx
import { LayoutGrid } from 'lucide-react';
import { NavLink, useLocation } from 'react-router';
import { cn } from '@/lib/cn';
import { MORE_NAV, PRIMARY_NAV } from './nav';

const TAB = 'flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium leading-tight transition-colors';

export function BottomNav({ onMore, className }: { onMore: () => void; className?: string }) {
  const { pathname } = useLocation();
  const moreActive = MORE_NAV.some((item) => pathname.startsWith(item.to));
  return (
    <nav
      aria-label="Điều hướng chính"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface-solid/90 pb-safe backdrop-blur-md',
        className,
      )}
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {PRIMARY_NAV.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} end={item.end} className={({ isActive }) => cn(TAB, isActive ? 'text-primary' : 'text-muted')}>
              {({ isActive }) => (
                <>
                  <item.icon aria-hidden className="size-6" strokeWidth={isActive ? 2.4 : 1.8} />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
        <li>
          <button type="button" onClick={onMore} aria-haspopup="dialog" className={cn(TAB, moreActive ? 'text-primary' : 'text-muted')}>
            <LayoutGrid aria-hidden className="size-6" strokeWidth={moreActive ? 2.4 : 1.8} />
            <span>Thêm</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
```

`apps/web/src/components/layout/MoreSheet.tsx`:
```tsx
import { useEffect, useId, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight, X } from 'lucide-react';
import { NavLink } from 'react-router';
import { functionalTransition } from '@/design/motion';
import { cn } from '@/lib/cn';
import { useMotionPrefs } from '@/providers/MotionProvider';
import { MORE_NAV } from './nav';

export function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { reduceMotion } = useMotionPrefs();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector<HTMLElement>('button, a')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [open, onClose]);

  const offscreen = reduceMotion ? { opacity: 0 } : { y: '100%' };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={functionalTransition}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={offscreen}
            animate={{ y: 0, opacity: 1 }}
            exit={offscreen}
            transition={{ ...functionalTransition, duration: 0.28 }}
            className="absolute inset-x-0 bottom-0 overscroll-contain rounded-t-[28px] border-t border-border bg-surface-solid px-safe pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-3"
          >
            <div aria-hidden="true" className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-text/20" />
            <div className="flex items-center justify-between">
              <h2 id={titleId} className="text-lg font-bold">
                Thêm
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Đóng"
                className="inline-flex size-11 items-center justify-center rounded-full text-muted hover:bg-text/5 hover:text-text"
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>
            <ul className="mt-2 space-y-1">
              {MORE_NAV.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={onClose}
                    className={({ isActive }) =>
                      cn('flex min-h-13 items-center gap-3 rounded-2xl px-3 text-[16px] font-medium', isActive ? 'bg-primary/12 text-primary' : 'hover:bg-text/5')
                    }
                  >
                    <item.icon aria-hidden className="size-5" />
                    <span className="flex-1">{item.label}</span>
                    <ChevronRight aria-hidden className="size-4 text-muted" />
                  </NavLink>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
```

`apps/web/src/components/layout/Sidebar.tsx`:
```tsx
import { Link, NavLink } from 'react-router';
import { asset } from '@/lib/asset';
import { cn } from '@/lib/cn';
import { MORE_NAV, PRIMARY_NAV } from './nav';

export function Sidebar({ className }: { className?: string }) {
  return (
    <aside className={cn('sticky top-0 h-app flex-col gap-6 border-r border-border bg-surface-solid px-4 py-6', className)}>
      <Link to="/app" className="inline-flex min-h-11 items-center gap-2 px-2 text-lg font-bold tracking-[-0.02em]">
        <img src={asset('brand/logo-mark.svg')} alt="" width={32} height={32} className="size-8" />
        Linguo
      </Link>
      <nav aria-label="Điều hướng chính (máy tính)">
        <ul className="space-y-1">
          {[...PRIMARY_NAV, ...MORE_NAV].map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn('flex min-h-11 items-center gap-3 rounded-2xl px-3 text-[15px] font-medium', isActive ? 'bg-primary/12 text-primary' : 'text-muted hover:bg-text/5 hover:text-text')
                }
              >
                <item.icon aria-hidden className="size-5" />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
```

`apps/web/src/components/layout/AppBar.tsx`:
```tsx
import { Link } from 'react-router';
import { LanguagePill } from '@/components/ui/LanguagePill';
import { useAuth } from '@/features/auth/AuthProvider';
import { useProfile } from '@/features/profile/ProfileProvider';
import { asset } from '@/lib/asset';

export function AppBar() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const initial = (profile?.displayName || user?.email || '?').trim().charAt(0).toUpperCase();
  return (
    <header className="glass sticky top-0 z-30 border-x-0 border-t-0 pt-safe">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-safe">
        <Link to="/app" className="inline-flex min-h-11 items-center gap-2 font-bold tracking-[-0.02em] lg:invisible">
          <img src={asset('brand/logo-mark.svg')} alt="" width={28} height={28} className="size-7" />
          <span>Linguo</span>
        </Link>
        <div className="flex items-center gap-2">
          <LanguagePill />
          <Link
            to="/app/cai-dat"
            aria-label="Tài khoản và cài đặt"
            className="inline-flex size-11 items-center justify-center rounded-full bg-primary/15 text-[15px] font-bold text-primary"
          >
            {initial}
          </Link>
        </div>
      </div>
    </header>
  );
}
```

`apps/web/src/components/layout/AppLayout.tsx`:
```tsx
import { useCallback, useState } from 'react';
import { Outlet } from 'react-router';
import { usePreferencesSync } from '@/features/preferences/usePreferencesSync';
import { AppBar } from './AppBar';
import { BottomNav } from './BottomNav';
import { MoreSheet } from './MoreSheet';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  const [moreOpen, setMoreOpen] = useState(false);
  const closeMore = useCallback(() => setMoreOpen(false), []);
  usePreferencesSync();

  return (
    <div className="min-h-hero bg-bg lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <a href="#main" className="sr-only z-[100] rounded-full bg-primary px-4 py-2 text-on-primary focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Bỏ qua tới nội dung
      </a>
      <Sidebar className="hidden lg:flex" />
      <div className="flex min-h-hero min-w-0 flex-col">
        <AppBar />
        <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-safe pb-[calc(6rem+env(safe-area-inset-bottom,0px))] pt-5 lg:pb-12">
          <Outlet />
        </main>
      </div>
      <BottomNav className="lg:hidden" onMore={() => setMoreOpen(true)} />
      <MoreSheet open={moreOpen} onClose={closeMore} />
    </div>
  );
}
```

`apps/web/src/routes/app/HomePage.tsx`:
```tsx
import { Route } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useProfile } from '@/features/profile/ProfileProvider';

const todayLabel = () => new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

export function HomePage() {
  const { status, profile, reload } = useProfile();
  const name = profile?.displayName.trim();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-sm capitalize text-muted">{todayLabel()}</p>
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">
          {status === 'loading' ? <Skeleton className="h-8 w-52 align-middle" /> : `Chào ${name || 'bạn'}`}
        </h1>
      </header>

      {status === 'error' && <ErrorState title="Không tải được hồ sơ" onRetry={reload} />}

      <EmptyState
        icon={Route}
        title="Bắt đầu lộ trình đầu tiên"
        description="Chọn ngôn ngữ, mục tiêu và thời gian học mỗi ngày. Linguo sẽ lập kế hoạch và điều chỉnh theo kết quả thật của bạn."
        action={
          <Button variant="accent" size="lg" disabled aria-describedby="onboarding-soon">
            Tạo lộ trình
          </Button>
        }
        footnote={<span id="onboarding-soon">Sắp ra mắt trong bản cập nhật tới.</span>}
      />
    </div>
  );
}
```

`apps/web/src/routes/app/ComingSoonPage.tsx`:
```tsx
import { Hourglass } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';

export function ComingSoonPage({ title }: { title: string }) {
  return (
    <div className="space-y-6">
      <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">{title}</h1>
      <EmptyState
        icon={Hourglass}
        title="Sắp ra mắt"
        description={`Tính năng ${title} đang được xây dựng và sẽ có trong các bản cập nhật tới.`}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @linguo/web test -- shell && pnpm --filter @linguo/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(app): add app shell with bottom nav, more sheet, sidebar, home and coming-soon pages"
```

---

### Task 16: Settings page

**Files:**
- Create: `apps/web/src/routes/app/SettingsPage.tsx`
- Test: `apps/web/src/routes/app/settings.test.tsx`

- [ ] **Step 1: Write the failing test** — `apps/web/src/routes/app/settings.test.tsx`

```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, TEST_USER_ID } from '../../../tests/unit/render';
import { SettingsPage } from './SettingsPage';

const mocks = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  updatePreferences: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('@/features/profile/service', () => ({ updateProfile: mocks.updateProfile }));
vi.mock('@/features/preferences/service', () => ({ updatePreferences: mocks.updatePreferences }));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ auth: { signOut: mocks.signOut } }),
  requireSupabase: () => ({ auth: { signOut: mocks.signOut } }),
}));

beforeEach(() => {
  mocks.updateProfile.mockReset().mockResolvedValue(undefined);
  mocks.updatePreferences.mockReset().mockResolvedValue(undefined);
  mocks.signOut.mockReset().mockResolvedValue({ error: null });
});

describe('SettingsPage', () => {
  it('pre-fills the profile and saves a trimmed display name', async () => {
    const setProfile = vi.fn();
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat', profile: { setProfile } });
    const name = screen.getByLabelText('Tên hiển thị');
    expect(name).toHaveValue('Minh Anh');
    await userEvent.clear(name);
    await userEvent.type(name, '  An  ');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu hồ sơ' }));
    await waitFor(() =>
      expect(mocks.updateProfile).toHaveBeenCalledWith(expect.anything(), TEST_USER_ID, { displayName: 'An', timezone: 'Asia/Ho_Chi_Minh' }),
    );
    expect(setProfile).toHaveBeenCalledWith({ id: TEST_USER_ID, displayName: 'An', timezone: 'Asia/Ho_Chi_Minh' });
    expect(await screen.findByText('Đã lưu hồ sơ.')).toBeInTheDocument();
  });

  it('rejects names longer than 60 characters', async () => {
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat' });
    const name = screen.getByLabelText('Tên hiển thị');
    await userEvent.clear(name);
    await userEvent.type(name, 'a'.repeat(61));
    await userEvent.click(screen.getByRole('button', { name: 'Lưu hồ sơ' }));
    expect(screen.getByText('Tên hiển thị tối đa 60 ký tự.')).toBeInTheDocument();
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it('applies the theme immediately and persists it', async () => {
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat' });
    await userEvent.click(screen.getByRole('radio', { name: 'Tối' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    await waitFor(() =>
      expect(mocks.updatePreferences).toHaveBeenCalledWith(expect.anything(), TEST_USER_ID, { theme: 'dark', reduceMotion: false }),
    );
  });

  it('toggles reduced motion', async () => {
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat' });
    const toggle = screen.getByRole('switch', { name: 'Giảm chuyển động' });
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement.dataset.reduceMotion).toBe('true');
  });

  it('signs out and returns to the landing page', async () => {
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat' });
    await userEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
    expect(mocks.signOut).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @linguo/web test -- settings`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `apps/web/src/routes/app/SettingsPage.tsx`

```tsx
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { LogOut, Monitor, Moon, Sun } from 'lucide-react';
import { useNavigate } from 'react-router';
import { DEFAULT_TIMEZONE, fieldErrors, profileUpdateSchema, type ThemePreference } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { FormField } from '@/components/ui/FormField';
import { Input, inputClasses } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { SolidCard } from '@/components/ui/SolidCard';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthProvider';
import { updatePreferences } from '@/features/preferences/service';
import { useProfile } from '@/features/profile/ProfileProvider';
import { updateProfile } from '@/features/profile/service';
import { cn } from '@/lib/cn';
import { requireSupabase } from '@/lib/supabase';
import { useMotionPrefs } from '@/providers/MotionProvider';
import { useTheme } from '@/providers/ThemeProvider';

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Sáng', icon: Sun },
  { value: 'dark', label: 'Tối', icon: Moon },
  { value: 'system', label: 'Theo hệ thống', icon: Monitor },
];

function timeZones(current: string): string[] {
  const all = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [DEFAULT_TIMEZONE, 'UTC'];
  return all.includes(current) ? all : [current, ...all];
}

export function SettingsPage() {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const { status, profile, reload, setProfile } = useProfile();
  const theme = useTheme();
  const motionPrefs = useMotionPrefs();
  const toast = useToast();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState('');
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const zones = useMemo(() => timeZones(timezone), [timezone]);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName);
      setTimezone(profile.timezone);
    }
  }, [profile]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const parsed = profileUpdateSchema.safeParse({ displayName, timezone });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await updateProfile(requireSupabase(), userId, parsed.data);
      setProfile({ id: userId, ...parsed.data });
      setDisplayName(parsed.data.displayName);
      toast.show({ tone: 'success', message: 'Đã lưu hồ sơ.' });
    } catch {
      toast.show({ tone: 'error', message: 'Chưa lưu được hồ sơ. Kiểm tra mạng rồi thử lại.' });
    } finally {
      setSaving(false);
    }
  }

  async function persistPreferences(next: { theme: ThemePreference; reduceMotion: boolean }) {
    try {
      await updatePreferences(requireSupabase(), userId, next);
    } catch {
      toast.show({ tone: 'error', message: 'Chưa đồng bộ được tuỳ chọn lên máy chủ. Thay đổi vẫn áp dụng trên thiết bị này.' });
    }
  }

  function chooseTheme(value: ThemePreference) {
    theme.setPreference(value);
    void persistPreferences({ theme: value, reduceMotion: motionPrefs.userReduceMotion });
  }

  function toggleMotion() {
    const value = !motionPrefs.userReduceMotion;
    motionPrefs.setUserReduceMotion(value);
    void persistPreferences({ theme: theme.preference, reduceMotion: value });
  }

  async function signOut() {
    setSigningOut(true);
    try {
      await requireSupabase().auth.signOut();
    } finally {
      setSigningOut(false);
      navigate('/', { replace: true });
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">Cài đặt</h1>

      <section aria-labelledby="profile-heading">
        <SolidCard className="space-y-4">
          <h2 id="profile-heading" className="text-lg font-bold">
            Hồ sơ
          </h2>
          {status === 'loading' && (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full rounded-full" />
              <Skeleton className="h-12 w-full rounded-full" />
            </div>
          )}
          {status === 'error' && <ErrorState title="Không tải được hồ sơ" onRetry={reload} />}
          {status === 'ready' && (
            <form noValidate onSubmit={saveProfile} className="space-y-4">
              <p className="text-sm text-muted">
                Email: <span className="text-text">{user?.email}</span>
              </p>
              <FormField label="Tên hiển thị" error={errors.displayName}>
                {({ invalid, ...a11y }) => (
                  <Input {...a11y} invalid={invalid} autoComplete="nickname" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                )}
              </FormField>
              <FormField label="Múi giờ" hint="Dùng để tính lịch ôn tập theo ngày của bạn." error={errors.timezone}>
                {({ invalid, ...a11y }) => (
                  <select
                    {...a11y}
                    aria-invalid={invalid || undefined}
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className={cn(inputClasses(invalid), 'appearance-none')}
                  >
                    {zones.map((zone) => (
                      <option key={zone} value={zone}>
                        {zone.replaceAll('_', ' ')}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
              <Button type="submit" variant="primary" loading={saving}>
                Lưu hồ sơ
              </Button>
            </form>
          )}
        </SolidCard>
      </section>

      <section aria-labelledby="display-heading">
        <SolidCard className="space-y-5">
          <h2 id="display-heading" className="text-lg font-bold">
            Giao diện
          </h2>
          <div role="radiogroup" aria-label="Chủ đề màu" className="grid grid-cols-3 gap-2">
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
              const checked = theme.preference === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => chooseTheme(value)}
                  className={cn(
                    'flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-2 text-center text-sm font-medium',
                    checked ? 'border-primary bg-primary/12 text-primary' : 'border-border hover:bg-text/5',
                  )}
                >
                  <Icon aria-hidden className="size-5" />
                  {label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p id="motion-label" className="font-medium">
                Giảm chuyển động
              </p>
              <p id="motion-desc" className="text-sm text-muted">
                Tắt hiệu ứng trượt, mờ và số đếm. Luôn bật nếu hệ điều hành yêu cầu.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={motionPrefs.userReduceMotion}
              aria-labelledby="motion-label"
              aria-describedby="motion-desc"
              onClick={toggleMotion}
              className={cn(
                'relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border border-border transition-colors',
                motionPrefs.userReduceMotion ? 'bg-primary' : 'bg-text/15',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'inline-block size-6 rounded-full bg-white shadow transition-transform',
                  motionPrefs.userReduceMotion ? 'translate-x-7' : 'translate-x-1',
                )}
              />
            </button>
          </div>
        </SolidCard>
      </section>

      <Button variant="danger" block loading={signingOut} onClick={signOut}>
        <LogOut aria-hidden className="size-5" />
        Đăng xuất
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @linguo/web test -- settings && pnpm --filter @linguo/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/app
git commit -m "feat(app): add settings page for profile, theme, reduced motion and sign out"
```

---

### Task 17: Landing page

**Files:**
- Create: `apps/web/src/routes/landing/LandingPage.tsx`, `LandingNav.tsx`, `HeroSection.tsx`, `HeroBackdrop.tsx`, `useHeroReady.ts`, `RouteSection.tsx`, `MethodSection.tsx`, `StatsSection.tsx`, `ShowcaseSection.tsx`, `FinalCtaSection.tsx`
- Test: `apps/web/src/routes/landing/landing.test.tsx`

- [ ] **Step 1: Write the failing test** — `apps/web/src/routes/landing/landing.test.tsx`

```tsx
import { act, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../tests/unit/render';
import { LandingPage } from './LandingPage';
import { useHeroReady } from './useHeroReady';

describe('useHeroReady', () => {
  afterEach(() => vi.useRealTimers());

  it('becomes ready after fonts when there is no video', async () => {
    Object.defineProperty(document, 'fonts', { value: { ready: Promise.resolve() }, configurable: true });
    const { result } = renderHook(() => useHeroReady(null));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBe(true);
  });

  it('waits for the video, but never longer than the safety timeout', () => {
    vi.useFakeTimers();
    const video = document.createElement('video');
    const ref = { current: video };
    const { result } = renderHook(() => useHeroReady(ref, 5000));
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(true);
  });
});

describe('LandingPage', () => {
  it('renders the hero, learning route, method and CTA', () => {
    localStorage.setItem('lp-reduce-motion', 'true');
    renderWithProviders(<LandingPage />, { auth: { status: 'signed-out', session: null, user: null } });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Học thông minh/i);
    expect(screen.getAllByRole('link', { name: 'Bắt đầu miễn phí' })[0]).toHaveAttribute('href', '/dang-ky');
    expect(screen.getByRole('img', { name: /Lộ trình tiếng Anh và tiếng Hàn/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nhớ lại chủ động' })).toBeInTheDocument();
    expect(screen.getByText(/không hứa “thành thạo siêu tốc”/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Quyền riêng tư' })).toHaveAttribute('href', '/quyen-rieng-tu');
  });

  it('opens and closes the menu overlay', async () => {
    localStorage.setItem('lp-reduce-motion', 'true');
    renderWithProviders(<LandingPage />, { auth: { status: 'signed-out', session: null, user: null } });
    await userEvent.click(screen.getByRole('button', { name: 'Mở menu' }));
    const dialog = screen.getByRole('dialog', { name: 'Menu' });
    expect(dialog).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Mở menu' })).toHaveAttribute('aria-expanded', 'false');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @linguo/web test -- landing`
Expected: FAIL — modules not found.

- [ ] **Step 3: Hero readiness gate** — `apps/web/src/routes/landing/useHeroReady.ts`

```ts
import { useEffect, useState, type RefObject } from 'react';

/**
 * Places/Unlock-Pro style gate: start entrance animations only once the hero video can play
 * (when there is one) and web fonts are ready — or after `timeoutMs`, whichever comes first.
 */
export function useHeroReady(videoRef: RefObject<HTMLVideoElement | null> | null, timeoutMs = 5000): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let done = false;
    let videoOk = !videoRef;
    let fontsOk = false;
    const finish = () => {
      if (done) return;
      done = true;
      setReady(true);
    };
    const check = () => {
      if (videoOk && fontsOk) finish();
    };
    const video = videoRef?.current ?? null;
    const onVideo = () => {
      videoOk = true;
      check();
    };
    if (video) {
      if (video.readyState >= 3) videoOk = true;
      video.addEventListener('canplay', onVideo);
      video.addEventListener('error', onVideo);
    }
    const fontsReady: Promise<unknown> = document.fonts?.ready ?? Promise.resolve();
    fontsReady.then(() => {
      fontsOk = true;
      check();
    });
    const timer = window.setTimeout(finish, timeoutMs);
    return () => {
      done = true;
      window.clearTimeout(timer);
      video?.removeEventListener('canplay', onVideo);
      video?.removeEventListener('error', onVideo);
    };
  }, [videoRef, timeoutMs]);

  return ready;
}
```

- [ ] **Step 4: Navigation with full-screen menu** — `apps/web/src/routes/landing/LandingNav.tsx`

```tsx
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Menu, X } from 'lucide-react';
import { Link } from 'react-router';
import { EXPO_OUT, reveal } from '@/design/motion';
import { asset } from '@/lib/asset';
import { useMotionPrefs } from '@/providers/MotionProvider';

const MENU = [
  { href: '#lo-trinh', label: 'Lộ trình' },
  { href: '#phuong-phap', label: 'Phương pháp' },
];

export function LandingNav({ ready }: { ready: boolean }) {
  const { reduceMotion } = useMotionPrefs();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const state = ready ? 'shown' : 'hidden';

  return (
    <>
      <header className="absolute inset-x-0 top-0 z-20 pt-safe">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-safe">
          <motion.div variants={reveal('slideLeft', reduceMotion)} initial="hidden" animate={state}>
            <Link to="/" className="inline-flex min-h-11 items-center gap-2" aria-label="Linguo — trang chủ">
              <img src={asset('brand/logo-mark.svg')} alt="" width={34} height={34} className="size-[34px]" />
              <span className="font-display text-[clamp(22px,6vw,30px)] uppercase leading-none tracking-wide">
                Lexi<span className="text-primary">Path</span>
              </span>
            </Link>
          </motion.div>
          <motion.div className="flex items-center gap-1" variants={reveal('slideRight', reduceMotion)} initial="hidden" animate={state}>
            <Link to="/dang-nhap" className="hidden min-h-11 items-center rounded-full px-4 text-[15px] font-semibold min-[380px]:inline-flex">
              Đăng nhập
            </Link>
            <button
              type="button"
              aria-label="Mở menu"
              aria-expanded={open}
              aria-haspopup="dialog"
              onClick={() => setOpen(true)}
              className="inline-flex size-11 items-center justify-center rounded-full"
            >
              <Menu aria-hidden className="size-7" />
            </button>
          </motion.div>
        </div>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="fixed inset-0 z-[99] flex flex-col bg-[linear-gradient(160deg,#0B1420_0%,#12324A_45%,#2F7FB5_100%)] px-safe pb-safe pt-safe"
            initial={{ opacity: 0, scale: reduceMotion ? 1 : 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: reduceMotion ? 1 : 1.04 }}
            transition={{ duration: 0.35, ease: EXPO_OUT }}
          >
            <div className="flex h-16 items-center justify-end">
              <button
                type="button"
                aria-label="Đóng menu"
                onClick={() => setOpen(false)}
                className="inline-flex size-11 items-center justify-center rounded-full"
                autoFocus
              >
                <X aria-hidden className="size-7" />
              </button>
            </div>
            <nav aria-label="Menu" className="flex flex-1 flex-col items-center justify-center gap-6">
              {[...MENU.map((m) => ({ ...m, kind: 'anchor' as const })), { href: '/dang-nhap', label: 'Đăng nhập', kind: 'route' as const }, { href: '/dang-ky', label: 'Đăng ký', kind: 'route' as const }].map(
                (item, i) => (
                  <motion.div
                    key={item.href}
                    initial={{ opacity: 0, y: reduceMotion ? 0 : 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: EXPO_OUT, delay: reduceMotion ? 0 : 0.08 + i * 0.07 }}
                  >
                    {item.kind === 'anchor' ? (
                      <a href={item.href} onClick={() => setOpen(false)} className="inline-flex min-h-12 items-center text-2xl font-semibold text-white">
                        {item.label}
                      </a>
                    ) : (
                      <Link to={item.href} onClick={() => setOpen(false)} className="inline-flex min-h-12 items-center text-2xl font-semibold text-white">
                        {item.label}
                      </Link>
                    )}
                  </motion.div>
                ),
              )}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
```

- [ ] **Step 5: Hero** — `apps/web/src/routes/landing/HeroBackdrop.tsx` and `HeroSection.tsx`

`HeroBackdrop.tsx` (the "poster": always present, video fades in on top):
```tsx
export function HeroBackdrop() {
  return (
    <div aria-hidden="true" className="absolute inset-0 -z-20 overflow-hidden bg-bg">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_20%_15%,rgb(76_162_209/0.38),transparent_65%),radial-gradient(ellipse_60%_50%_at_95%_70%,rgb(243_125_37/0.28),transparent_60%),radial-gradient(ellipse_50%_40%_at_40%_100%,rgb(217_161_59/0.18),transparent_70%)]" />
      <svg className="absolute inset-0 h-full w-full opacity-[0.07]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="hero-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M32 0H0V32" fill="none" stroke="white" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hero-grid)" />
      </svg>
    </div>
  );
}
```

`HeroSection.tsx`:
```tsx
import { useRef } from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router';
import { ArrowCTA } from '@/components/ui/ArrowCTA';
import { reveal } from '@/design/motion';
import { cn } from '@/lib/cn';
import { env } from '@/lib/env';
import { useSaveData } from '@/lib/useSaveData';
import { useMotionPrefs } from '@/providers/MotionProvider';
import { HeroBackdrop } from './HeroBackdrop';
import { LandingNav } from './LandingNav';
import { useHeroReady } from './useHeroReady';

export function HeroSection() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { reduceMotion } = useMotionPrefs();
  const saveData = useSaveData();
  const videoUrl = !reduceMotion && !saveData ? env.heroVideoUrl : null;
  const ready = useHeroReady(videoUrl ? videoRef : null);
  const state = ready ? 'shown' : 'hidden';

  return (
    <section aria-labelledby="hero-title" className="relative isolate flex min-h-hero flex-col overflow-x-clip">
      <HeroBackdrop />
      {videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
          className={cn('absolute inset-0 -z-10 h-full w-full object-cover transition-opacity duration-1000', ready ? 'opacity-55' : 'opacity-0')}
        />
      )}
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 -z-10 h-2/3 bg-gradient-to-b from-transparent to-bg" />
      <LandingNav ready={ready} />

      <div className="mx-auto mt-auto w-full max-w-5xl px-safe pb-[max(2.5rem,env(safe-area-inset-bottom,0px))] pt-28">
        <h1 id="hero-title" className="font-display text-[clamp(48px,14.5vw,124px)] uppercase leading-[0.95]">
          <motion.span className="block" variants={reveal('slideLeft', reduceMotion, 0)} initial="hidden" animate={state}>
            Học thông minh
          </motion.span>
          <motion.span className="block text-right text-primary" variants={reveal('slideRight', reduceMotion, 0.13)} initial="hidden" animate={state}>
            Nhớ lâu hơn
          </motion.span>
        </h1>
        <motion.p
          className="mt-5 max-w-md text-[17px] leading-relaxed text-muted"
          variants={reveal('blurUp', reduceMotion, 0.3)}
          initial="hidden"
          animate={state}
        >
          Lộ trình tiếng Anh và tiếng Hàn cá nhân hoá cho người Việt — học bằng{' '}
          <em className="font-serif text-[1.08em] text-text">nhớ lại chủ động</em>, ôn tập ngắt quãng và phản hồi có giải thích.
        </motion.p>
        <motion.div
          className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-3"
          variants={reveal('blurUp', reduceMotion, 0.45)}
          initial="hidden"
          animate={state}
        >
          <ArrowCTA to="/dang-ky">Bắt đầu miễn phí</ArrowCTA>
          <Link to="/dang-nhap" className="inline-flex min-h-11 items-center px-2 text-[15px] font-semibold underline-offset-4 hover:underline">
            Tôi đã có tài khoản
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Learning-route section** — `apps/web/src/routes/landing/RouteSection.tsx`

```tsx
import { useRef } from 'react';
import { motion, useInView } from 'motion/react';
import { BookOpen, Headphones, MessageCircle, type LucideIcon } from 'lucide-react';
import { RouteLine, type RouteTrack } from '@/components/ui/RouteLine';
import { reveal, VIEWPORT_ONCE } from '@/design/motion';
import { useMotionPrefs } from '@/providers/MotionProvider';

const TRACKS: RouteTrack[] = [
  {
    id: 'en',
    color: '#4CA2D1',
    d: 'M20 50 C60 10 100 90 140 60 C180 30 220 100 260 70 C285 52 295 40 304 34',
    stops: [
      { x: 20, y: 50, label: 'Nền tảng', labelPosition: 'bottom' },
      { x: 140, y: 60, label: 'A1–A2', labelPosition: 'bottom' },
      { x: 260, y: 70, label: 'B1–B2', labelPosition: 'bottom' },
      { x: 304, y: 34, label: 'C1–C2', labelPosition: 'top' },
    ],
  },
  {
    id: 'ko',
    color: '#F37D25',
    d: 'M20 190 C70 230 110 140 150 170 C190 200 230 130 270 150 C290 160 298 172 304 186',
    stops: [
      { x: 20, y: 190, label: 'Hangul', labelPosition: 'top' },
      { x: 150, y: 170, label: 'TOPIK I', labelPosition: 'bottom' },
      { x: 270, y: 150, label: 'TOPIK II', labelPosition: 'top' },
      { x: 304, y: 186, label: 'Cấp 5–6', labelPosition: 'bottom' },
    ],
  },
];

const FLOATERS: Array<{ icon: LucideIcon; label: string; left: string; top: string; duration: number }> = [
  { icon: BookOpen, label: 'Đọc', left: '30%', top: '8%', duration: 2.8 },
  { icon: Headphones, label: 'Nghe', left: '68%', top: '40%', duration: 3.3 },
  { icon: MessageCircle, label: 'Nói', left: '12%', top: '62%', duration: 2.5 },
];

export function RouteSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, VIEWPORT_ONCE);
  const { reduceMotion } = useMotionPrefs();
  const state = inView || reduceMotion ? 'shown' : 'hidden';

  return (
    <section
      id="lo-trinh"
      aria-labelledby="route-title"
      className="relative overflow-x-clip bg-[linear-gradient(180deg,#0B1420_0%,#10283C_45%,#173E5B_75%,#3A2A2A_100%)] px-safe py-[clamp(64px,12vh,120px)]"
    >
      <div ref={ref} className="mx-auto max-w-3xl">
        <motion.div variants={reveal('slideLeft', reduceMotion)} initial="hidden" animate={state}>
          <h2 id="route-title" className="font-display text-[clamp(44px,13vw,80px)] uppercase leading-[0.95] text-white">
            Một lộ trình
          </h2>
          <p className="mt-2 text-[clamp(18px,5vw,26px)] leading-snug text-[#C9D6E2]">
            rõ ràng từ điểm xuất phát
            <br />
            điều chỉnh theo kết quả thật
          </p>
        </motion.div>

        <div className="relative -mx-2 mt-10 text-white">
          <RouteLine title="Lộ trình tiếng Anh và tiếng Hàn: từ nền tảng tới C1–C2 và từ Hangul tới TOPIK II" viewBox="0 0 320 240" tracks={TRACKS} />
          {FLOATERS.map(({ icon: Icon, label, left, top, duration }, i) => (
            <motion.span
              key={label}
              aria-hidden="true"
              className="absolute inline-flex w-[13%] max-w-14 items-center justify-center rounded-full bg-white p-[3%] text-[#0B1420] shadow-[0_8px_24px_rgb(0_0_0/0.35)]"
              style={{ left, top, aspectRatio: '1 / 1' }}
              initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.5 }}
              animate={state === 'shown' ? { opacity: 1, scale: 1, y: reduceMotion ? 0 : [0, -8, 0] } : { opacity: 0 }}
              transition={{
                opacity: { duration: 0.4, delay: reduceMotion ? 0 : 0.8 + i * 0.15 },
                scale: { duration: 0.5, delay: reduceMotion ? 0 : 0.8 + i * 0.15 },
                y: { duration, repeat: Infinity, ease: 'easeInOut' },
              }}
            >
              <Icon className="size-full" />
            </motion.span>
          ))}
        </div>

        <ul className="mt-8 flex flex-wrap gap-3 text-sm font-medium text-white">
          <li className="glass inline-flex min-h-10 items-center gap-2 rounded-full px-4">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-[#4CA2D1]" />
            EN · Tiếng Anh (CEFR)
          </li>
          <li className="glass inline-flex min-h-10 items-center gap-2 rounded-full px-4">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-[#F37D25]" />
            KO · Tiếng Hàn (TOPIK)
          </li>
        </ul>
      </div>
    </section>
  );
}
```

- [ ] **Step 7: Method, stats, showcase, final CTA**

`apps/web/src/routes/landing/MethodSection.tsx`:
```tsx
import { useRef } from 'react';
import { motion, useInView } from 'motion/react';
import { BrainCircuit, CalendarClock, MessageSquareText } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { reveal, VIEWPORT_ONCE } from '@/design/motion';
import { useMotionPrefs } from '@/providers/MotionProvider';

const METHODS = [
  { icon: BrainCircuit, title: 'Nhớ lại chủ động', text: 'Tự trả lời trước khi xem đáp án — cách ghi nhớ bền hơn đọc đi đọc lại.' },
  { icon: CalendarClock, title: 'Ôn tập ngắt quãng', text: 'Lịch ôn theo khả năng nhớ của từng mục kiến thức, không nhồi nhét một lần.' },
  { icon: MessageSquareText, title: 'Phản hồi có giải thích', text: 'Chỉ đúng chỗ sai, vì sao sai và cách sửa; lỗi được lưu để học lại đúng điểm yếu.' },
];

export function MethodSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, VIEWPORT_ONCE);
  const { reduceMotion } = useMotionPrefs();
  const state = inView || reduceMotion ? 'shown' : 'hidden';

  return (
    <section id="phuong-phap" aria-labelledby="method-title" className="overflow-x-clip bg-bg px-safe py-[clamp(64px,12vh,120px)]">
      <div ref={ref} className="mx-auto max-w-5xl">
        <motion.h2
          id="method-title"
          className="max-w-2xl text-[clamp(30px,8vw,52px)] font-bold leading-[1.08] tracking-[-0.03em]"
          variants={reveal('speed', reduceMotion)}
          initial="hidden"
          animate={state}
        >
          Phương pháp có <em className="font-serif font-normal text-primary">cơ sở nghiên cứu</em>
        </motion.h2>
        <ul className="mt-10 grid gap-4 md:grid-cols-3">
          {METHODS.map(({ icon: Icon, title, text }, i) => (
            <motion.li key={title} variants={reveal('blurUp', reduceMotion, 0.1 + i * 0.1)} initial="hidden" animate={state}>
              <GlassCard className="h-full space-y-3 p-6">
                <Icon aria-hidden className="size-8 text-primary" />
                <h3 className="text-lg font-bold">{title}</h3>
                <p className="text-[15px] leading-relaxed text-muted">{text}</p>
              </GlassCard>
            </motion.li>
          ))}
        </ul>
        <p className="mt-8 max-w-2xl border-l-2 border-gold pl-4 text-[15px] leading-relaxed text-muted">
          Linguo không hứa “thành thạo siêu tốc”. Mọi dự báo tiến độ là ước lượng từ kết quả học thật của bạn và được cập nhật
          liên tục.
        </p>
      </div>
    </section>
  );
}
```

`apps/web/src/routes/landing/StatsSection.tsx`:
```tsx
import { useRef } from 'react';
import { motion, useInView } from 'motion/react';
import { CountUp } from '@/components/ui/CountUp';
import { reveal, VIEWPORT_ONCE } from '@/design/motion';
import { cn } from '@/lib/cn';
import { useMotionPrefs } from '@/providers/MotionProvider';

/** Product facts only — never user counts or outcomes we cannot back up. */
const STATS = [
  { value: 2, label: 'ngôn ngữ — tiếng Anh và tiếng Hàn', indent: false, gold: false },
  { value: 6, label: 'kỹ năng theo dõi riêng: từ vựng, ngữ pháp, đọc, nghe, viết, nói', indent: true, gold: false },
  { value: 12, label: 'cấp độ mục tiêu: CEFR A1–C2 và TOPIK 1–6', indent: false, gold: true },
];

export function StatsSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, VIEWPORT_ONCE);
  const { reduceMotion } = useMotionPrefs();
  const state = inView || reduceMotion ? 'shown' : 'hidden';

  return (
    <section aria-label="Linguo trong con số" className="overflow-x-clip bg-bg px-safe pb-[clamp(64px,12vh,120px)]">
      <div ref={ref} className="mx-auto flex max-w-3xl flex-col gap-8">
        {STATS.map((s, i) => (
          <motion.div
            key={s.value}
            className={cn('flex items-end gap-4', s.indent && 'pl-[clamp(40px,12vw,120px)]')}
            variants={reveal(i % 2 ? 'slideRight' : 'slideLeft', reduceMotion, i * 0.12)}
            initial="hidden"
            animate={state}
          >
            <CountUp
              to={s.value}
              delayMs={i * 200}
              className={cn('font-display text-[clamp(84px,26vw,160px)] leading-[0.8]', s.gold ? 'text-gold' : 'text-gradient-fade')}
            />
            <p className="max-w-[14rem] pb-2 text-[clamp(14px,3.8vw,18px)] leading-snug text-muted">{s.label}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
```

`apps/web/src/routes/landing/ShowcaseSection.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react';
import { BookOpen, House, LayoutGrid, RotateCcw, Route, Sparkles } from 'lucide-react';
import { asset } from '@/lib/asset';

const SCREEN_W = 390;

/** Static, non-interactive rendering of the real empty-state home screen (no fake progress numbers). */
function PhonePreview() {
  return (
    <div data-theme="dark" className="flex h-full flex-col bg-bg text-text">
      <div className="flex h-24 items-end justify-between px-5 pb-3">
        <span className="inline-flex items-center gap-2 font-bold">
          <img src={asset('brand/logo-mark.svg')} alt="" className="size-7" />
          Linguo
        </span>
        <span className="glass rounded-full px-4 py-2 text-sm font-semibold">EN ▾</span>
      </div>
      <div className="space-y-5 px-5">
        <p className="text-sm text-muted">Thứ Hai, 13 tháng 10</p>
        <p className="text-[28px] font-bold tracking-[-0.03em]">Chào bạn</p>
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-border bg-surface-solid px-6 py-10 text-center">
          <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <Route className="size-7" />
          </span>
          <p className="text-xl font-bold">Bắt đầu lộ trình đầu tiên</p>
          <p className="text-[15px] text-muted">Chọn ngôn ngữ, mục tiêu và thời gian học mỗi ngày.</p>
          <span className="rounded-full bg-accent px-6 py-3 font-semibold text-on-accent">Tạo lộ trình</span>
        </div>
      </div>
      <div className="mt-auto grid grid-cols-5 border-t border-border bg-surface-solid pb-8 pt-2 text-[11px] text-muted">
        {[
          [House, 'Trang chủ'],
          [BookOpen, 'Học tập'],
          [RotateCcw, 'Ôn tập'],
          [Sparkles, 'Gia sư AI'],
          [LayoutGrid, 'Thêm'],
        ].map(([Icon, label], i) => {
          const I = Icon as typeof House;
          return (
            <span key={label as string} className={`flex flex-col items-center gap-0.5 ${i === 0 ? 'text-primary' : ''}`}>
              <I className="size-6" />
              {label as string}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** iPhone 15 Pro-style frame (393:852) shown only on wide screens; phones see the real full-bleed app. */
function PhoneFrame() {
  const screenRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.8);
  useEffect(() => {
    const el = screenRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setScale(entry.contentRect.width / SCREEN_W);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="relative aspect-[393/852] w-[min(340px,30vw)] rounded-[54px] border-8 border-[#2a2a2a] bg-[#1a1a1a] shadow-[0_40px_80px_rgb(0_0_0/0.45),inset_0_0_0_1px_#3a3a3a]">
      <div ref={screenRef} className="absolute inset-0 overflow-hidden rounded-[46px]">
        <div aria-hidden="true" className="absolute left-1/2 top-[11px] z-10 h-9 w-[126px] -translate-x-1/2 rounded-[20px] bg-black" />
        <div style={{ width: SCREEN_W, height: `${100 / scale}%`, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <PhonePreview />
        </div>
        <div aria-hidden="true" className="absolute bottom-2 left-1/2 h-[5px] w-[134px] -translate-x-1/2 rounded-full bg-white/30" />
      </div>
    </div>
  );
}

export function ShowcaseSection() {
  return (
    <section aria-labelledby="showcase-title" className="hidden overflow-x-clip bg-bg px-safe pb-[clamp(64px,12vh,120px)] min-[900px]:block">
      <div className="mx-auto grid max-w-5xl grid-cols-2 items-center gap-12">
        <div className="space-y-4">
          <h2 id="showcase-title" className="text-[44px] font-bold leading-[1.08] tracking-[-0.03em]">
            Thiết kế cho điện thoại trước tiên
          </h2>
          <p className="text-[17px] leading-relaxed text-muted">
            Mở trên trình duyệt iPhone hoặc Android là học được ngay — bố cục tràn viền, chừa đúng tai thỏ và thanh điều hướng,
            chế độ sáng/tối và giảm chuyển động.
          </p>
        </div>
        <div className="flex justify-center" aria-hidden="true">
          <PhoneFrame />
        </div>
      </div>
    </section>
  );
}
```

`apps/web/src/routes/landing/FinalCtaSection.tsx`:
```tsx
import { Link } from 'react-router';
import { ArrowCTA } from '@/components/ui/ArrowCTA';

const footerLink = 'inline-flex min-h-11 items-center underline-offset-4 hover:text-text hover:underline';

export function FinalCtaSection() {
  return (
    <>
      <section aria-labelledby="final-cta" className="overflow-x-clip bg-[#0A1A28] px-safe py-[clamp(56px,10vh,96px)]">
        <div className="mx-auto max-w-3xl space-y-6">
          <h2 id="final-cta" className="font-display text-[clamp(44px,13vw,88px)] uppercase leading-[0.95] text-white">
            Bắt đầu lộ trình <span className="text-accent">của bạn</span>
          </h2>
          <p className="max-w-md text-[clamp(15px,3.8vw,18px)] text-[#B0BCC6]">
            Miễn phí. Chỉ cần 10–15 phút mỗi ngày để hình thành thói quen học đều đặn.
          </p>
          <ArrowCTA to="/dang-ky">Bắt đầu miễn phí</ArrowCTA>
        </div>
      </section>
      <footer className="bg-[#0A1A28] px-safe pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] pt-6 text-sm text-[#8C9AA6]">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <nav aria-label="Pháp lý" className="flex gap-5">
            <Link to="/quyen-rieng-tu" className={footerLink}>
              Quyền riêng tư
            </Link>
            <Link to="/dieu-khoan" className={footerLink}>
              Điều khoản
            </Link>
          </nav>
          <p>© 2026 Linguo</p>
        </div>
      </footer>
    </>
  );
}
```

`apps/web/src/routes/landing/LandingPage.tsx`:
```tsx
import { FinalCtaSection } from './FinalCtaSection';
import { HeroSection } from './HeroSection';
import { MethodSection } from './MethodSection';
import { RouteSection } from './RouteSection';
import { ShowcaseSection } from './ShowcaseSection';
import { StatsSection } from './StatsSection';

/** Marketing page: always dark, expressive motion tier. */
export function LandingPage() {
  return (
    <div data-theme="dark" className="min-h-hero bg-bg text-text">
      <a href="#main" className="sr-only z-[100] rounded-full bg-primary px-4 py-2 text-on-primary focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Bỏ qua tới nội dung
      </a>
      <HeroSection />
      <main id="main">
        <RouteSection />
        <MethodSection />
        <StatsSection />
        <ShowcaseSection />
      </main>
      <FinalCtaSection />
    </div>
  );
}
```

- [ ] **Step 8: Run tests, typecheck, lint**

Run: `pnpm --filter @linguo/web test -- landing && pnpm --filter @linguo/web typecheck && pnpm lint`
Expected: PASS, exit 0.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/routes/landing
git commit -m "feat(landing): add hero, learning route map, method, stats, device showcase and CTA"
```

---

### Task 18: Router, providers, error pages, legal pages, entry point

**Files:**
- Create: `apps/web/src/components/layout/RootLayout.tsx`, `apps/web/src/routes/RouteError.tsx`, `NotFoundPage.tsx`, `LegalPage.tsx`, `apps/web/src/app/router.tsx`, `apps/web/src/app/App.tsx`
- Modify: `apps/web/src/app/main.tsx`
- Test: `apps/web/src/app/router.test.tsx`

- [ ] **Step 1: Write the failing test** — `apps/web/src/app/router.test.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthContext, type AuthState } from '@/features/auth/AuthProvider';
import { MotionProvider } from '@/providers/MotionProvider';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { routes } from './router';

vi.mock('@/lib/supabase', () => ({ getSupabase: () => null, requireSupabase: () => ({}), authRedirect: (p: string) => p }));

function renderAt(path: string, auth: AuthState) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <ThemeProvider>
      <MotionProvider>
        <ToastProvider>
          <AuthContext.Provider value={auth}>
            <RouterProvider router={router} />
          </AuthContext.Provider>
        </ToastProvider>
      </MotionProvider>
    </ThemeProvider>,
  );
  return router;
}

const signedOut: AuthState = { status: 'signed-out', session: null, user: null };

describe('routes', () => {
  it('redirects /app to sign in when signed out', async () => {
    localStorage.setItem('lp-reduce-motion', 'true');
    const router = renderAt('/app/cai-dat', signedOut);
    expect(await screen.findByRole('heading', { name: 'Chào mừng trở lại' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/dang-nhap');
    expect(router.state.location.search).toBe('?next=%2Fapp%2Fcai-dat');
  });

  it('shows 404 for unknown paths', async () => {
    renderAt('/khong-ton-tai', signedOut);
    expect(await screen.findByRole('heading', { name: 'Không tìm thấy trang' })).toBeInTheDocument();
  });

  it('renders legal drafts', async () => {
    renderAt('/quyen-rieng-tu', signedOut);
    expect(await screen.findByRole('heading', { name: 'Quyền riêng tư' })).toBeInTheDocument();
    expect(screen.getByText(/Bản nháp/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @linguo/web test -- router`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`apps/web/src/components/layout/RootLayout.tsx`:
```tsx
import { Outlet, ScrollRestoration } from 'react-router';
import { OfflineBanner } from '@/components/ui/OfflineBanner';

export function RootLayout() {
  return (
    <>
      <OfflineBanner />
      <Outlet />
      <ScrollRestoration />
    </>
  );
}
```

`apps/web/src/routes/RouteError.tsx`:
```tsx
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { ErrorState } from '@/components/ui/ErrorState';

export function RouteError() {
  const error = useRouteError();
  if (import.meta.env.DEV) console.error(error);
  const description = isRouteErrorResponse(error)
    ? `Lỗi ${error.status}. Vui lòng tải lại trang.`
    : 'Đã có lỗi không mong muốn. Tải lại trang để tiếp tục; dữ liệu đã lưu không bị mất.';
  return (
    <div className="flex min-h-hero items-center justify-center px-safe py-10">
      <ErrorState title="Đã có lỗi xảy ra" description={description} retryLabel="Tải lại trang" onRetry={() => window.location.reload()} />
    </div>
  );
}
```

`apps/web/src/routes/NotFoundPage.tsx`:
```tsx
import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { buttonClasses } from '@/components/ui/Button';

export function NotFoundPage() {
  return (
    <main id="main" className="flex min-h-hero flex-col items-center justify-center gap-4 px-safe py-10 text-center">
      <Compass aria-hidden className="size-12 text-primary" />
      <h1 className="text-[28px] font-bold tracking-[-0.03em]">Không tìm thấy trang</h1>
      <p className="max-w-sm text-[15px] text-muted">Đường dẫn có thể đã thay đổi hoặc không còn tồn tại.</p>
      <Link to="/" className={buttonClasses('accent', 'lg')}>
        Về trang chủ
      </Link>
    </main>
  );
}
```

`apps/web/src/routes/LegalPage.tsx`:
```tsx
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';
import { SolidCard } from '@/components/ui/SolidCard';

const CONTENT = {
  privacy: {
    title: 'Quyền riêng tư',
    body: [
      'Linguo lưu email, tên hiển thị, múi giờ và tuỳ chọn giao diện để vận hành tài khoản của bạn.',
      'Dữ liệu học tập chỉ bạn xem được; chúng tôi không công khai bảng xếp hạng và không bán dữ liệu.',
      'Bạn có thể yêu cầu xuất hoặc xoá dữ liệu. Chi tiết về lưu trữ, thời hạn và AI sẽ được bổ sung trước khi ra mắt chính thức.',
    ],
  },
  terms: {
    title: 'Điều khoản sử dụng',
    body: [
      'Linguo là công cụ hỗ trợ tự học; kết quả và dự báo tiến độ là ước lượng, không phải cam kết đạt chứng chỉ.',
      'Không dùng dịch vụ để phát tán nội dung vi phạm bản quyền hoặc gây hại.',
      'Điều khoản đầy đủ sẽ được công bố trước khi ra mắt chính thức.',
    ],
  },
} as const;

export function LegalPage({ kind }: { kind: keyof typeof CONTENT }) {
  const page = CONTENT[kind];
  return (
    <main id="main" className="mx-auto max-w-2xl space-y-5 px-safe pb-[max(2rem,env(safe-area-inset-bottom,0px))] pt-[max(1.5rem,env(safe-area-inset-top,0px))]">
      <Link to="/" className="inline-flex min-h-11 items-center gap-2 font-semibold text-primary">
        <ArrowLeft aria-hidden className="size-4" />
        Trang chủ
      </Link>
      <h1 className="text-[32px] font-bold tracking-[-0.03em]">{page.title}</h1>
      <p role="note" className="rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3 text-[15px]">
        Bản nháp — nội dung sẽ được hoàn thiện và rà soát pháp lý trước khi ra mắt chính thức.
      </p>
      <SolidCard className="space-y-3 text-[16px] leading-relaxed">
        {page.body.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </SolidCard>
    </main>
  );
}
```

`apps/web/src/app/router.tsx`:
```tsx
import { createBrowserRouter, type RouteObject } from 'react-router';
import { AppLayout } from '@/components/layout/AppLayout';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { RootLayout } from '@/components/layout/RootLayout';
import { RedirectIfAuthed, RequireAuth } from '@/features/auth/guards';
import { ProfileProvider } from '@/features/profile/ProfileProvider';
import { ComingSoonPage } from '@/routes/app/ComingSoonPage';
import { HomePage } from '@/routes/app/HomePage';
import { SettingsPage } from '@/routes/app/SettingsPage';
import { AuthCallbackPage } from '@/routes/auth/AuthCallbackPage';
import { CheckEmailPage } from '@/routes/auth/CheckEmailPage';
import { ForgotPasswordPage } from '@/routes/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/routes/auth/ResetPasswordPage';
import { SignInPage } from '@/routes/auth/SignInPage';
import { SignUpPage } from '@/routes/auth/SignUpPage';
import { LandingPage } from '@/routes/landing/LandingPage';
import { LegalPage } from '@/routes/LegalPage';
import { NotFoundPage } from '@/routes/NotFoundPage';
import { RouteError } from '@/routes/RouteError';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: 'quyen-rieng-tu', element: <LegalPage kind="privacy" /> },
      { path: 'dieu-khoan', element: <LegalPage kind="terms" /> },
      {
        element: (
          <RedirectIfAuthed>
            <AuthLayout />
          </RedirectIfAuthed>
        ),
        children: [
          { path: 'dang-nhap', element: <SignInPage /> },
          { path: 'dang-ky', element: <SignUpPage /> },
          { path: 'quen-mat-khau', element: <ForgotPasswordPage /> },
          { path: 'kiem-tra-email', element: <CheckEmailPage /> },
        ],
      },
      {
        element: <AuthLayout />,
        children: [
          { path: 'auth/callback', element: <AuthCallbackPage /> },
          {
            path: 'dat-lai-mat-khau',
            element: (
              <RequireAuth>
                <ResetPasswordPage />
              </RequireAuth>
            ),
          },
        ],
      },
      {
        path: 'app',
        element: (
          <RequireAuth>
            <ProfileProvider>
              <AppLayout />
            </ProfileProvider>
          </RequireAuth>
        ),
        children: [
          { index: true, element: <HomePage /> },
          { path: 'hoc-tap', element: <ComingSoonPage title="Học tập" /> },
          { path: 'on-tap', element: <ComingSoonPage title="Ôn tập" /> },
          { path: 'gia-su', element: <ComingSoonPage title="Gia sư AI" /> },
          { path: 'luyen-thi', element: <ComingSoonPage title="Luyện thi" /> },
          { path: 'tien-do', element: <ComingSoonPage title="Tiến độ" /> },
          { path: 'cai-dat', element: <SettingsPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export function createAppRouter() {
  const basename = import.meta.env.BASE_URL.replace(/\/+$/, '') || '/';
  return createBrowserRouter(routes, { basename });
}
```

`apps/web/src/app/App.tsx`:
```tsx
import { useState } from 'react';
import { RouterProvider } from 'react-router';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { MotionProvider } from '@/providers/MotionProvider';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { createAppRouter } from './router';

export function App() {
  const [router] = useState(createAppRouter);
  return (
    <ThemeProvider>
      <MotionProvider>
        <AuthProvider>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </AuthProvider>
      </MotionProvider>
    </ThemeProvider>
  );
}
```

`apps/web/src/app/main.tsx` (replace entirely):
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/design/global.css';
import { installKeyboardAwareness } from '@/lib/viewport';
import { App } from './App';

installKeyboardAwareness();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 4: Run the full unit suite, typecheck, lint, build**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`
Expected: all PASS; build succeeds.

- [ ] **Step 5: Smoke-test in the browser**

Run: `pnpm dev` and open `http://localhost:5173/` in a browser with DevTools device emulation (iPhone SE and Pixel 7). Without a `.env`, verify: landing animates and has no horizontal scroll; `/dang-nhap` shows "Chưa cấu hình Supabase"; `/abc` shows the 404 page. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): wire router, providers, error/404/legal pages and app entry"
```

---

## Phase E — Quality gates, CI/CD, docs

### Task 19: Playwright mobile E2E (layout, forms, guards, a11y, screenshots)

**Files:**
- Create: `.env.e2e`, `apps/web/playwright.config.ts`, `apps/web/tests/e2e/fixtures.ts`, `layout.spec.ts`, `forms.spec.ts`, `guard.spec.ts`, `a11y.spec.ts`, `screenshots.spec.ts`
- Modify: `apps/web/package.json` (`e2e` script)

- [ ] **Step 1: E2E env (committed; dummy values, not secrets)** — `.env.e2e` at the repo root

```
# Used by `vite build --mode e2e`. Supabase calls go to e2e.invalid and are mocked by Playwright.
VITE_SUPABASE_URL=https://e2e.invalid
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_e2e
VITE_SITE_URL=http://localhost:4173
VITE_AUTH_GOOGLE_ENABLED=false
VITE_HERO_VIDEO_URL=
VITE_BASE_PATH=/
```

In `apps/web/package.json` change the `e2e` script to:
```json
"e2e": "vite build --mode e2e && playwright test"
```

- [ ] **Step 2: Playwright config** — `apps/web/playwright.config.ts`

```ts
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'iphone-se', use: { ...devices['iPhone SE'] } }, // 320px wide: the narrowest supported width
    { name: 'iphone-15-pro', use: { ...devices['iPhone 15 Pro'] } },
    { name: 'iphone-15-pro-max', use: { ...devices['iPhone 15 Pro Max'] } },
    { name: 'iphone-15-pro-landscape', use: { ...devices['iPhone 15 Pro landscape'] } },
    { name: 'pixel-7', use: { ...devices['Pixel 7'] } },
    { name: 'galaxy-s9', use: { ...devices['Galaxy S9+'] } }, // 360px Android
  ],
  webServer: {
    command: `pnpm exec vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
```

- [ ] **Step 3: Fixtures** — `apps/web/tests/e2e/fixtures.ts`

```ts
import { expect, type Page } from '@playwright/test';

export const SUPABASE_URL = 'https://e2e.invalid';
export const USER_ID = '11111111-1111-4111-8111-111111111111';
const STORAGE_KEY = 'sb-e2e-auth-token'; // supabase-js: sb-<first host label>-auth-token

/** Answer every Supabase request so tests never touch a real backend. */
export async function mockSupabase(page: Page, opts: { displayName?: string } = {}) {
  await page.route(`${SUPABASE_URL}/**`, async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname === '/rest/v1/profiles') {
      if (method === 'GET') {
        return route.fulfill({ json: { id: USER_ID, display_name: opts.displayName ?? 'Minh Anh', timezone: 'Asia/Ho_Chi_Minh' } });
      }
      return route.fulfill({ status: 204, body: '' });
    }
    if (url.pathname === '/rest/v1/user_preferences') {
      if (method === 'GET') return route.fulfill({ json: { theme: 'system', reduce_motion: false } });
      return route.fulfill({ status: 204, body: '' });
    }
    if (url.pathname.startsWith('/auth/v1/logout')) return route.fulfill({ status: 204, body: '' });
    return route.fulfill({ status: 404, json: { message: `not mocked: ${method} ${url.pathname}` } });
  });
}

function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.signature`;
}

/** Seed a valid-looking session in localStorage before the app boots. */
export async function signIn(page: Page) {
  const now = Math.floor(Date.now() / 1000);
  const user = {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'minhanh@example.com',
    app_metadata: { provider: 'email' },
    user_metadata: { display_name: 'Minh Anh' },
    created_at: new Date().toISOString(),
  };
  const session = {
    access_token: fakeJwt({ sub: USER_ID, role: 'authenticated', aud: 'authenticated', email: user.email, exp: now + 3600 }),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: 'e2e-refresh-token',
    user,
  };
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [STORAGE_KEY, JSON.stringify(session)] as const);
}

export async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, 'page must not scroll horizontally').toBeLessThanOrEqual(innerWidth);
}
```

- [ ] **Step 4: Specs**

`apps/web/tests/e2e/layout.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, mockSupabase, signIn } from './fixtures';

const PUBLIC_PATHS = ['/', '/dang-nhap', '/dang-ky', '/quen-mat-khau', '/quyen-rieng-tu', '/khong-ton-tai'];

test.describe('public pages fit every screen', () => {
  for (const path of PUBLIC_PATHS) {
    test(`no horizontal scroll on ${path}`, async ({ page }) => {
      await mockSupabase(page);
      await page.goto(path);
      await page.waitForTimeout(1500); // entrance animations settle (slides start off-screen)
      await expectNoHorizontalScroll(page);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1200);
      await expectNoHorizontalScroll(page);
    });
  }
});

test.describe('app shell', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);
    await signIn(page);
  });

  for (const path of ['/app', '/app/on-tap', '/app/cai-dat']) {
    test(`no horizontal scroll on ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoHorizontalScroll(page);
    });
  }

  test('bottom nav is pinned to the bottom and never covers content', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'bottom nav is mobile-only');
    await page.goto('/app/cai-dat');
    const nav = page.getByRole('navigation', { name: 'Điều hướng chính' });
    await expect(nav).toBeVisible();
    const viewport = page.viewportSize();
    const navBox = await nav.boundingBox();
    expect(viewport && navBox).toBeTruthy();
    expect(Math.round(navBox!.y + navBox!.height)).toBe(viewport!.height);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);
    const last = await page.getByRole('button', { name: 'Đăng xuất' }).boundingBox();
    expect(last!.y + last!.height).toBeLessThanOrEqual(navBox!.y);
  });
});
```

`apps/web/tests/e2e/forms.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { mockSupabase } from './fixtures';

for (const path of ['/dang-nhap', '/dang-ky', '/quen-mat-khau']) {
  test(`inputs ≥16px and touch targets ≥44px on ${path}`, async ({ page }) => {
    await mockSupabase(page);
    await page.goto(path);
    const fontSizes = await page.locator('input, select, textarea').evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
    expect(fontSizes.length).toBeGreaterThan(0);
    for (const size of fontSizes) expect(size, 'iOS zooms into inputs smaller than 16px').toBeGreaterThanOrEqual(16);

    const targets = await page.locator('main button, main a').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { w: r.width, h: r.height, label: el.getAttribute('aria-label') || el.textContent?.trim() || el.tagName };
      }),
    );
    for (const t of targets) {
      expect(t.h, `"${t.label}" height`).toBeGreaterThanOrEqual(44);
      expect(t.w, `"${t.label}" width`).toBeGreaterThanOrEqual(44);
    }
  });
}
```

`apps/web/tests/e2e/guard.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { mockSupabase, signIn } from './fixtures';

test('signed-out users are sent to sign in and keep the target', async ({ page }) => {
  await mockSupabase(page);
  await page.goto('/app/cai-dat');
  await expect(page).toHaveURL(/\/dang-nhap\?next=%2Fapp%2Fcai-dat$/);
  await expect(page.getByRole('heading', { name: 'Chào mừng trở lại' })).toBeVisible();
});

test('signed-in users see their name on home', async ({ page }) => {
  await mockSupabase(page);
  await signIn(page);
  await page.goto('/app');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chào Minh Anh');
});

test('"Thêm" opens the sheet and navigates to settings', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'bottom nav is mobile-only');
  await mockSupabase(page);
  await signIn(page);
  await page.goto('/app');
  await page.getByRole('button', { name: 'Thêm' }).click();
  await expect(page.getByRole('dialog', { name: 'Thêm' })).toBeVisible();
  await page.getByRole('link', { name: /Cài đặt/ }).click();
  await expect(page).toHaveURL(/\/app\/cai-dat$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Cài đặt' })).toBeVisible();
});

test('deep links work (SPA fallback)', async ({ page }) => {
  await mockSupabase(page);
  const response = await page.goto('/quyen-rieng-tu');
  expect(response?.ok() || response?.status() === 404).toBeTruthy();
  await expect(page.getByRole('heading', { name: 'Quyền riêng tư' })).toBeVisible();
});
```

`apps/web/tests/e2e/a11y.spec.ts`:
```ts
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockSupabase, signIn } from './fixtures';

const PAGES = [
  { path: '/', auth: false },
  { path: '/dang-nhap', auth: false },
  { path: '/dang-ky', auth: false },
  { path: '/app', auth: true },
  { path: '/app/cai-dat', auth: true },
];

for (const { path, auth } of PAGES) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`no serious a11y violations on ${path} (${colorScheme})`, async ({ page }, testInfo) => {
      test.skip(!['iphone-15-pro', 'pixel-7'].includes(testInfo.project.name), 'a11y runs on two devices');
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme });
      await mockSupabase(page);
      if (auth) await signIn(page);
      await page.goto(path);
      await page.waitForTimeout(800);
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })), null, 2)).toEqual([]);
    });
  }
}
```

`apps/web/tests/e2e/screenshots.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { mockSupabase, signIn } from './fixtures';

/** Attached to the HTML report for human review (no pixel diffing: Windows/Linux baselines differ). */
for (const colorScheme of ['light', 'dark'] as const) {
  test(`screenshots (${colorScheme})`, async ({ page }, testInfo) => {
    test.skip(!['iphone-se', 'iphone-15-pro', 'pixel-7', 'iphone-15-pro-landscape'].includes(testInfo.project.name));
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await mockSupabase(page);
    for (const [name, path] of [
      ['landing', '/'],
      ['sign-in', '/dang-nhap'],
    ] as const) {
      await page.goto(path);
      await page.waitForTimeout(800);
      await testInfo.attach(`${name}-${colorScheme}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    }
    await signIn(page);
    await page.goto('/app');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await testInfo.attach(`app-home-${colorScheme}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  });
}
```

- [ ] **Step 5: Install browsers and run**

Run: `pnpm --filter @linguo/web exec playwright install chromium webkit`
Run: `pnpm e2e`
Expected: all tests PASS (skipped ones are reported as skipped). If a layout test fails, fix the component (common causes: an element wider than the viewport — add `min-w-0`, `overflow-x-clip` on the section, or remove a fixed width) rather than loosening the test. If an axe test fails on colour contrast, adjust the token in `tokens.css`, not the test.

- [ ] **Step 6: Review screenshots**

Run: `pnpm --filter @linguo/web exec playwright show-report`
Expected: open the "screenshots" tests and check each attachment: no clipped Vietnamese diacritics in headings, no content under the bottom nav, logo without checkerboard.

- [ ] **Step 7: Commit**

```bash
git add .env.e2e apps/web/playwright.config.ts apps/web/tests/e2e apps/web/package.json
git commit -m "test(e2e): add Playwright mobile device suite for layout, forms, guards, a11y and screenshots"
```

---

### Task 20: Block secrets in public env vars

**Files:**
- Create: `scripts/check-public-env.mjs`
- Test: `scripts/check-public-env.test.mjs`

- [ ] **Step 1: Write the failing test** — `scripts/check-public-env.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPublicEnv } from './check-public-env.mjs';

const jwt = (role) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.sig`;
const ok = { VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_123' };

test('accepts publishable and anon keys', () => {
  assert.deepEqual(checkPublicEnv(ok), []);
  assert.deepEqual(checkPublicEnv({ ...ok, VITE_SUPABASE_PUBLISHABLE_KEY: jwt('anon') }), []);
});

test('rejects secret and service_role keys', () => {
  assert.match(checkPublicEnv({ ...ok, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc' })[0], /SECRET/);
  assert.match(checkPublicEnv({ ...ok, VITE_SUPABASE_PUBLISHABLE_KEY: jwt('service_role') })[0], /service_role/);
});

test('rejects secret-looking VITE_ names', () => {
  const errors = checkPublicEnv({ ...ok, VITE_GEMINI_API_KEY: 'x', VITE_DB_PASSWORD: 'y' });
  assert.equal(errors.length, 2);
});

test('strict mode requires values; non-strict allows empty', () => {
  assert.deepEqual(checkPublicEnv({}), []);
  assert.equal(checkPublicEnv({}, { strict: true }).length, 1);
});

test('rejects non-https URLs', () => {
  assert.match(checkPublicEnv({ ...ok, VITE_SUPABASE_URL: 'http://abc.supabase.co' })[0], /https/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test scripts/check-public-env.test.mjs`
Expected: FAIL — cannot find module `./check-public-env.mjs`.

- [ ] **Step 3: Implement** — `scripts/check-public-env.mjs`

```js
#!/usr/bin/env node
// Everything in VITE_* is bundled into public JavaScript. Fail if the Supabase key is not the
// publishable/anon key, or if any VITE_* variable looks like a secret.
//
// Usage: node scripts/check-public-env.mjs [--strict]
//   --strict  require VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (production deploy)
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SECRET_NAME = /SECRET|PASSWORD|SERVICE_ROLE|PRIVATE|DB_URL|DATABASE|GEMINI|ACCESS_TOKEN/i;

export function checkPublicEnv(env, { strict = false } = {}) {
  const errors = [];
  const url = (env.VITE_SUPABASE_URL || '').trim();
  const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();

  if (!url || !key) {
    if (strict) {
      errors.push(
        'VITE_SUPABASE_URL và VITE_SUPABASE_PUBLISHABLE_KEY phải được đặt trong GitHub → Settings → Secrets and variables → Actions → Variables.',
      );
    }
  } else {
    if (!/^https:\/\/[^/\s]+$/.test(url.replace(/\/$/, ''))) {
      errors.push('VITE_SUPABASE_URL phải có dạng https://<project-ref>.supabase.co');
    }
    if (key.startsWith('sb_secret_')) {
      errors.push('VITE_SUPABASE_PUBLISHABLE_KEY đang là SECRET key (sb_secret_…). Chỉ dùng publishable key.');
    } else if (key.startsWith('eyJ')) {
      let role;
      try {
        role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')).role;
      } catch {
        errors.push('VITE_SUPABASE_PUBLISHABLE_KEY không phải JWT hợp lệ.');
      }
      if (role && role !== 'anon') errors.push(`VITE_SUPABASE_PUBLISHABLE_KEY có role "${role}" (service_role?) — chỉ dùng key role "anon".`);
    } else if (!key.startsWith('sb_publishable_')) {
      errors.push('VITE_SUPABASE_PUBLISHABLE_KEY không giống publishable key (sb_publishable_…) hay anon JWT (eyJ…).');
    }
  }

  for (const name of Object.keys(env)) {
    if (name.startsWith('VITE_') && SECRET_NAME.test(name)) {
      errors.push(`${name} trông giống secret nhưng có tiền tố VITE_ → sẽ bị lộ trong bundle.`);
    }
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.CI && existsSync('.env')) process.loadEnvFile('.env');
  const errors = checkPublicEnv(process.env, { strict: process.argv.includes('--strict') });
  if (errors.length) {
    for (const e of errors) console.error(`::error::${e}`);
    process.exit(1);
  }
  console.log('Public env OK (publishable/anon key only).');
}
```

- [ ] **Step 4: Run tests**

Run: `node --test scripts/check-public-env.test.mjs && node scripts/check-public-env.mjs`
Expected: 5 tests pass; `Public env OK (publishable/anon key only).`

- [ ] **Step 5: Include the script tests in the root test command**

In the root `package.json`, change the `test` script to:
```json
"test": "pnpm -r test && node --test scripts/check-public-env.test.mjs"
```
Run: `pnpm test`
Expected: workspace tests and the 5 script tests pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/check-public-env.mjs scripts/check-public-env.test.mjs package.json
git commit -m "ci: add guard that blocks secrets from public VITE_* variables"
```

---

### Task 21: GitHub Actions — `ci.yml`, `deploy.yml`, Dependabot

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `.github/dependabot.yml`

- [ ] **Step 1: CI** — `.github/workflows/ci.yml`

```yaml
# Runs on every Pull Request and is called by deploy.yml before any deploy.
# No secrets needed: web uses public vars, e2e mocks Supabase, database runs Supabase locally in Docker.
name: CI

on:
  pull_request:
  workflow_dispatch:
  workflow_call:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  web:
    name: Lint, typecheck, unit tests, build
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    env:
      VITE_SUPABASE_URL: ${{ vars.VITE_SUPABASE_URL }}
      VITE_SUPABASE_PUBLISHABLE_KEY: ${{ vars.VITE_SUPABASE_PUBLISHABLE_KEY }}
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Chặn secret lọt vào biến VITE_*
        run: node scripts/check-public-env.mjs
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build

  e2e:
    name: Playwright (iPhone / Android)
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Install Playwright browsers
        run: pnpm --filter @linguo/web exec playwright install --with-deps chromium webkit
      - run: pnpm e2e
      - name: Upload Playwright report (screenshots for review)
        if: ${{ !cancelled() }}
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: apps/web/playwright-report
          retention-days: 14

  database:
    name: Database migrations + RLS tests (local Supabase)
    runs-on: ubuntu-24.04
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@v7
      - uses: supabase/setup-cli@v3
        with:
          version: 2.120.0
      # Must be `supabase start` (not `db start`) so Auth/REST come up too.
      - name: Apply all migrations on a fresh local stack
        run: supabase start -x studio,imgproxy,vector,logflare,edge-runtime,realtime,mailpit,supavisor
      - name: Lint database schema
        run: supabase db lint --fail-on error
      - name: RLS + trigger tests (pgTAP)
        run: supabase test db
      - name: Generated types are up to date
        run: |
          supabase gen types typescript --local --schema public > packages/shared/src/database.types.ts
          git diff --exit-code -- packages/shared/src/database.types.ts || {
            echo "::error::packages/shared/src/database.types.ts is stale. Run 'pnpm db:types' and commit."
            exit 1
          }
      - name: Stop local stack
        if: always()
        run: supabase stop --no-backup
```

- [ ] **Step 2: Deploy** — `.github/workflows/deploy.yml`

```yaml
# push main → CI → (Supabase migrations if changed, needs approval) → (Edge Functions if changed) → build → GitHub Pages.
#
# DATABASE SAFETY: only `supabase db push` (applies new migrations). Never reset / config push / seed hosted DB.
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      migrate:
        description: Run the Supabase migration step even without new migration files
        type: boolean
        default: false
      functions:
        description: Deploy all Edge Functions even if supabase/functions did not change
        type: boolean
        default: false

permissions:
  contents: read

concurrency:
  group: deploy-production
  cancel-in-progress: false

jobs:
  verify:
    name: CI
    uses: ./.github/workflows/ci.yml

  changes:
    name: Detect migration / function changes
    runs-on: ubuntu-24.04
    outputs:
      migrations: ${{ steps.diff.outputs.migrations }}
      functions: ${{ steps.diff.outputs.functions }}
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - id: diff
        env:
          EVENT: ${{ github.event_name }}
          FORCE: ${{ inputs.migrate }}
          FORCE_FUNCTIONS: ${{ inputs.functions }}
          BEFORE: ${{ github.event.before }}
          AFTER: ${{ github.sha }}
        run: |
          changed() {
            if [ -z "$BEFORE" ] || [ "$BEFORE" = "0000000000000000000000000000000000000000" ] \
               || ! git cat-file -e "$BEFORE^{commit}" 2>/dev/null; then
              echo true
            elif git diff --quiet "$BEFORE" "$AFTER" -- "$1"; then
              echo false
            else
              echo true
            fi
          }
          if [ "$EVENT" = "workflow_dispatch" ]; then
            migrations="$FORCE"; functions="$FORCE_FUNCTIONS"
          else
            migrations=$(changed supabase/migrations); functions=$(changed supabase/functions)
          fi
          echo "migrations=$migrations" >> "$GITHUB_OUTPUT"
          echo "functions=$functions" >> "$GITHUB_OUTPUT"

  migrate:
    name: Supabase db push
    needs: [verify, changes]
    if: needs.changes.outputs.migrations == 'true'
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    environment: production # enable "Required reviewers" so every DB change needs approval
    env:
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
      SUPABASE_PROJECT_ID: ${{ vars.SUPABASE_PROJECT_ID }}
    steps:
      - uses: actions/checkout@v7
      - uses: supabase/setup-cli@v3
        with:
          version: 2.120.0
      - name: Check required secrets
        run: |
          missing=0
          for v in SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD SUPABASE_PROJECT_ID; do
            if [ -z "${!v}" ]; then echo "::error::Thiếu $v (xem docs/DEPLOY.md)"; missing=1; fi
          done
          exit $missing
      - run: supabase link --project-ref "$SUPABASE_PROJECT_ID"
      - name: Preview migrations to apply
        run: supabase db push --dry-run
      - name: Apply migrations
        run: supabase db push --yes

  functions:
    name: Supabase functions deploy
    needs: [verify, changes, migrate]
    if: >-
      always() &&
      needs.verify.result == 'success' &&
      needs.changes.result == 'success' &&
      needs.changes.outputs.functions == 'true' &&
      (needs.migrate.result == 'success' || needs.migrate.result == 'skipped')
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    environment: production
    env:
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      SUPABASE_PROJECT_ID: ${{ vars.SUPABASE_PROJECT_ID }}
    steps:
      - uses: actions/checkout@v7
      - uses: supabase/setup-cli@v3
        with:
          version: 2.120.0
      - name: Deploy all Edge Functions
        run: |
          if ls supabase/functions/*/index.ts >/dev/null 2>&1; then
            supabase functions deploy --project-ref "$SUPABASE_PROJECT_ID"
          else
            echo "No Edge Functions yet."
          fi

  build:
    name: Build site
    needs: [verify, changes, migrate]
    if: >-
      always() &&
      needs.verify.result == 'success' &&
      needs.changes.result == 'success' &&
      (needs.migrate.result == 'success' || needs.migrate.result == 'skipped')
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    env:
      VITE_SUPABASE_URL: ${{ vars.VITE_SUPABASE_URL }}
      VITE_SUPABASE_PUBLISHABLE_KEY: ${{ vars.VITE_SUPABASE_PUBLISHABLE_KEY }}
      VITE_SITE_URL: ${{ vars.VITE_SITE_URL }}
      VITE_AUTH_GOOGLE_ENABLED: ${{ vars.VITE_AUTH_GOOGLE_ENABLED }}
      VITE_HERO_VIDEO_URL: ${{ vars.VITE_HERO_VIDEO_URL }}
      VITE_BASE_PATH: /${{ github.event.repository.name }}/
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Chặn secret lọt vào biến VITE_*
        run: node scripts/check-public-env.mjs --strict
      - run: pnpm build
      - name: Bundle must not contain secret keys
        run: |
          if grep -rq "sb_secret_" apps/web/dist; then
            echo "::error::Found a Supabase secret key in the built bundle"; exit 1
          fi
      - uses: actions/upload-pages-artifact@v5
        with:
          path: apps/web/dist

  pages:
    name: Deploy to GitHub Pages
    needs: build
    if: always() && needs.build.result == 'success'
    runs-on: ubuntu-24.04
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
```

- [ ] **Step 3: Dependabot** — `.github/dependabot.yml`

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    groups:
      minor-and-patch:
        update-types: [minor, patch]
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
```

- [ ] **Step 4: Validate YAML syntax locally**

Run: `node -e "for (const f of ['ci','deploy']) { const s=require('fs').readFileSync('.github/workflows/'+f+'.yml','utf8'); if (/\t/.test(s)) throw new Error(f+' has tabs'); } console.log('ok')"`
Expected: `ok`. (Full validation happens on the first PR in GitHub; if `actions/checkout@v7` / `setup-node@v7` / `upload-pages-artifact@v5` / `deploy-pages@v5` are reported as unknown versions, use the versions pinned in `D:\Code\Tuyen\Note_mytasks\.github\workflows\deploy.yml`, which is known to run.)

- [ ] **Step 5: Commit**

```bash
git add .github
git commit -m "ci: add CI (web, e2e, database) and GitHub Pages deploy with gated Supabase migrations"
```

---

### Task 22: Environment template and documentation

**Files:**
- Create: `.env.example`, `docs/SETUP.md`, `docs/DEPLOY.md`, `docs/MOBILE-QA.md`, `README.md`

- [ ] **Step 1: `.env.example`**

```
# Copy to `.env` (git-ignored). Never commit real values.

# ---- Web app (public by design: bundled into the browser JS) ----------
# Supabase Dashboard → Project Settings → API Keys. Use the PUBLISHABLE key (sb_publishable_…).
# NEVER put the secret/service_role key here. Data is protected by Row Level Security.
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=
# Optional. Defaults to the current origin + base path. Production: https://<user>.github.io/<repo>
VITE_SITE_URL=
# "true" after configuring Google in Supabase → Authentication → Providers.
VITE_AUTH_GOOGLE_ENABLED=false
# Optional MP4 (H.264, <2 MB, 720p) for the landing hero. Empty = CSS/SVG backdrop only.
VITE_HERO_VIDEO_URL=
# Set by CI to /<repo>/ for GitHub Pages. Leave empty locally.
VITE_BASE_PATH=

# ---- Server-only (spec 5: AI tutor) — NEVER prefix with VITE_ ----------
# Stored as Supabase Edge Function secrets: pnpm exec supabase secrets set GEMINI_API_KEY=...
# GEMINI_API_KEY=
# GEMINI_MODEL=
# GEMINI_DAILY_USER_LIMIT=20
# GEMINI_MAX_OUTPUT_TOKENS=1200
# GEMINI_TIMEOUT_MS=20000
```

- [ ] **Step 2: `docs/SETUP.md`** (Vietnamese; this is the "what you must provide" guide)

```markdown
# Cài đặt Linguo trên máy

## Cần có
- Node.js 22 (`node -v`), pnpm 10 (`corepack enable && corepack prepare pnpm@10.34.6 --activate`)
- Docker Desktop (chỉ cần cho test database local)

## 1. Cài phụ thuộc
    pnpm install

## 2. Tạo project Supabase (một lần)
1. supabase.com → **New project**. Tên `linguo`, region **Southeast Asia (Singapore)**. Lưu lại **Database password**.
2. **Project Settings → API Keys**: copy **Project URL** và **Publishable key** (`sb_publishable_…`).
3. **Authentication → Sign In / Providers → Email**: bật **Confirm email**.
4. **Authentication → URL Configuration**:
   - Site URL: `https://<user>.github.io/<repo>`
   - Redirect URLs: `https://<user>.github.io/<repo>/**`, `http://localhost:5173/**`, `http://localhost:4173/**`
5. Email mặc định của Supabase chỉ gửi vài email mỗi giờ. Trước khi có người dùng thật, cấu hình **Authentication → Emails → SMTP** (ví dụ Resend).

## 3. Điền `.env`
    cp .env.example .env
Điền `VITE_SUPABASE_URL` và `VITE_SUPABASE_PUBLISHABLE_KEY`. Kiểm tra: `pnpm check-env`.

## 4. Áp migration lên project (lần đầu, hoặc để CI làm)
    pnpm exec supabase login
    pnpm exec supabase link --project-ref <project-ref>
    pnpm exec supabase db push

## 5. Đăng nhập Google (tuỳ chọn)
1. console.cloud.google.com → APIs & Services → **Credentials → Create OAuth client ID → Web application**.
2. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Supabase → **Authentication → Providers → Google**: dán Client ID và Client Secret, bật.
4. Đặt `VITE_AUTH_GOOGLE_ENABLED=true` trong `.env` và trong GitHub Variables.

## 6. Chạy
    pnpm dev            # http://localhost:5173
    pnpm test           # unit tests
    pnpm e2e            # Playwright trên các thiết bị iPhone/Android giả lập
    pnpm db:start && pnpm db:test   # database local + test RLS (cần Docker)

## Thông tin bạn cần cung cấp — tóm tắt
| Giá trị | Đặt ở đâu |
|---|---|
| Project URL, Publishable key | `.env` và GitHub → Variables |
| Project ref | GitHub → Variables (`SUPABASE_PROJECT_ID`) |
| Access token (supabase.com → Account → Access Tokens) | GitHub → Environment `production` → Secrets |
| Database password | GitHub → Environment `production` → Secrets |
| Google OAuth Client ID/Secret (tuỳ chọn) | Supabase Dashboard |
| Gemini API key (spec sau) | `supabase secrets set` |
```

- [ ] **Step 3: `docs/DEPLOY.md`**

```markdown
# Deploy — GitHub Actions + GitHub Pages + Supabase

Không có server riêng. CI/CD chạy trên GitHub; Auth/Database là Supabase hosted.

    Pull Request ──► CI (.github/workflows/ci.yml)
                      ├─ web:      check-public-env → lint → typecheck → unit tests → build
                      ├─ e2e:      Playwright trên iPhone SE/15 Pro/15 Pro Max/landscape, Pixel 7, Galaxy S9+
                      └─ database: Supabase local (Docker) → áp mọi migration → db lint → pgTAP (RLS) → kiểm types

    push main ─────► Deploy (.github/workflows/deploy.yml)
                      verify (= CI) ─┐
                      changes ───────┼─► migrate (khi supabase/migrations đổi; cần bấm duyệt)
                                     ├─► functions (khi supabase/functions đổi)
                                     └─► build (VITE_* từ Variables, base /<repo>/) → GitHub Pages

## Quy tắc an toàn database
- CI chỉ chạy `supabase db push`. Không bao giờ chạy `db reset`, `config push`, `db push --include-seed` với project hosted.
- Mỗi thay đổi schema = một file migration mới (`pnpm exec supabase migration new <ten>`). Không sửa migration đã deploy.
- Thiết lập Auth trong `supabase/config.toml` chỉ áp dụng local; Auth hosted cấu hình trên Dashboard.

## Thiết lập một lần
1. **Repo public** trên GitHub (Pages cho repo private cần gói trả phí). Push nhánh `main`.
2. **Settings → Pages → Source: GitHub Actions.**
3. **Settings → Environments → New environment `production`**: bật **Required reviewers** (chọn bạn), Deployment branches = `main`. Thêm secrets:
   - `SUPABASE_ACCESS_TOKEN` — supabase.com → Account → Access Tokens
   - `SUPABASE_DB_PASSWORD` — mật khẩu database của project
4. **Settings → Secrets and variables → Actions → Variables**:
   - `SUPABASE_PROJECT_ID` — project ref
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_SITE_URL` = `https://<user>.github.io/<repo>`
   - `VITE_AUTH_GOOGLE_ENABLED` = `true` hoặc `false`
   - `VITE_HERO_VIDEO_URL` (tuỳ chọn)
5. Supabase **Authentication → URL Configuration** như `docs/SETUP.md` bước 2.

## Quy trình hằng ngày
1. Tạo nhánh → code → mở PR → CI phải xanh (xem artifact `playwright-report` để duyệt ảnh chụp mobile).
2. Merge vào `main` → Deploy tự chạy. Có migration mới thì GitHub chờ bạn **Approve** `production`, xem log `db push --dry-run`, rồi áp dụng.
3. Site: `https://<user>.github.io/<repo>/`.

## Xử lý sự cố
| Triệu chứng | Cách xử lý |
|---|---|
| Build báo thiếu `VITE_SUPABASE_URL` | Chưa tạo Variables (bước 4) |
| `migrate` báo `Thiếu SUPABASE_…` | Secrets chưa đặt trong environment `production` |
| Pages 404 ở trang chủ | Kiểm tra bước 2 (Source = GitHub Actions) |
| Link email mở sai địa chỉ | Kiểm tra Site URL / Redirect URLs trên Supabase |
| "Hãy mở liên kết trên cùng trình duyệt" | Liên kết PKCE phải mở trên trình duyệt đã gửi yêu cầu |
| App báo lỗi kết nối sau thời gian dài không dùng | Supabase Free tạm dừng project → Restore trong Dashboard |
```

- [ ] **Step 4: `docs/MOBILE-QA.md`**

```markdown
# Kiểm thử tay trên thiết bị thật

Chạy trước mỗi bản phát hành có thay đổi giao diện. Ghi kết quả vào PR.

## Thiết bị tối thiểu
- iPhone có Dynamic Island (iOS 17/18, Safari) và một iPhone nhỏ (SE/mini) nếu có
- Android Chrome (Android 13+) và Samsung Internet
- Một máy Android cấu hình thấp (~3 GB RAM) để kiểm tra hiệu năng blur/animation

## Checklist
- [ ] Landing: tiêu đề không bị cắt dấu (Ữ, Ặ); không cuộn ngang; CTA bấm được bằng ngón cái
- [ ] Tai thỏ / Dynamic Island không che logo; thanh home không che bottom nav
- [ ] Xoay ngang: nội dung không chui vào vùng tai thỏ hai bên
- [ ] Đăng ký → email → mở link trên cùng trình duyệt → vào app
- [ ] Bàn phím mở: ô đang nhập không bị che; iOS không tự zoom khi chạm ô nhập
- [ ] Bottom nav: 5 tab, "Thêm" mở sheet, vuốt/Escape/đóng hoạt động
- [ ] Cài đặt: đổi Sáng/Tối/Hệ thống áp dụng ngay; tải lại vẫn giữ
- [ ] Bật "Giảm chuyển động" (trong app và trong hệ điều hành): không còn trượt/mờ
- [ ] Tắt mạng: hiện banner ngoại tuyến; lưu hồ sơ báo lỗi, không báo thành công giả
- [ ] VoiceOver (iOS) / TalkBack (Android): đọc đúng nhãn nút, tab, ô nhập
- [ ] Phóng chữ 200%: không vỡ bố cục, chữ xuống dòng thay vì tràn
- [ ] "Thêm vào màn hình chính": icon đúng (không có ô ca-rô), mở vào /app
```

- [ ] **Step 5: `README.md`**

```markdown
# Linguo

Nền tảng học tiếng Anh và tiếng Hàn cá nhân hoá cho người Việt. Web app mobile-first trên GitHub Pages, backend Supabase (Auth + Postgres + RLS), CI/CD bằng GitHub Actions.

- Đặc tả sản phẩm: [docs/superpowers/specs/Dac_ta_Linguo_English_Korean.md](docs/superpowers/specs/Dac_ta_Linguo_English_Korean.md)
- Thiết kế spec 0 (nền móng): [docs/superpowers/specs/2026-10-13-linguo-foundation-design.md](docs/superpowers/specs/2026-10-13-linguo-foundation-design.md)
- Cài đặt local và các key cần cung cấp: [docs/SETUP.md](docs/SETUP.md)
- Deploy: [docs/DEPLOY.md](docs/DEPLOY.md) · Kiểm thử thiết bị thật: [docs/MOBILE-QA.md](docs/MOBILE-QA.md)

## Cấu trúc
    apps/web/          React + Vite + Tailwind v4 + motion (SPA)
    packages/shared/   zod schema, hằng số, types sinh từ database
    supabase/          config, migrations, pgTAP tests, (functions — spec sau)
    scripts/           make-icons (logo/icon), check-public-env (chặn lộ secret)
    .github/workflows/ ci.yml, deploy.yml

## Lệnh thường dùng
    pnpm dev | pnpm test | pnpm e2e | pnpm lint | pnpm typecheck | pnpm build
    pnpm db:start | pnpm db:test | pnpm db:types | pnpm icons
```

- [ ] **Step 6: Commit**

```bash
git add .env.example docs/SETUP.md docs/DEPLOY.md docs/MOBILE-QA.md README.md
git commit -m "docs: add env template, setup, deploy and mobile QA guides"
```

---

### Task 23: Final verification

- [ ] **Step 1: Run every gate from a clean install**

```bash
rm -rf node_modules apps/web/node_modules packages/shared/node_modules apps/web/dist
pnpm install --frozen-lockfile
node scripts/check-public-env.mjs
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm e2e
pnpm db:reset && pnpm db:test && pnpm db:lint
pnpm db:types && git diff --exit-code -- packages/shared/src/database.types.ts
VITE_BASE_PATH=/Linguo/ pnpm build && ls apps/web/dist/404.html && ! grep -rq sb_secret_ apps/web/dist && echo "bundle clean"
```
Expected: every command exits 0; last line prints `bundle clean`.

- [ ] **Step 2: Check the spec's acceptance criteria (spec §14) one by one** and note which can only be verified after the user configures GitHub/Supabase (criteria 1–2 need the real project and a real phone).

- [ ] **Step 3: Stop local Supabase**

Run: `pnpm db:stop`

- [ ] **Step 4: Report to the user — do not push**

Summarise: what was built, commands run and their results, remaining manual steps from `docs/DEPLOY.md` (create public repo settings, Pages source, `production` environment, Variables/Secrets, Supabase Auth URLs, optional Google OAuth), and ask before pushing `feat/foundation` or opening a PR.
