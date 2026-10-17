/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { VitePWA } from 'vite-plugin-pwa';
import { cspPlugin } from './build/csp.ts';

const rootDir = fileURLToPath(new URL('../..', import.meta.url));

/** GitHub Pages serves 404.html for unknown paths; make it the SPA shell so deep links work. */
function spaFallback(): Plugin {
  return {
    name: 'linguo-spa-fallback',
    apply: 'build',
    // writeBundle only runs after a successful write (closeBundle also runs after build errors).
    writeBundle(options) {
      const outDir = resolve(options.dir ?? 'dist');
      copyFileSync(resolve(outDir, 'index.html'), resolve(outDir, '404.html'));
    },
  };
}

function normalizeBase(value: string | undefined): string {
  if (!value) return '/';
  let base = value.trim();
  // Relative ('./') and absolute URL bases are passed through untouched (apart from a trailing slash).
  if (base.startsWith('./') || base.startsWith('http')) return base.endsWith('/') ? base : `${base}/`;
  base = base.replace(/\/{2,}/g, '/');
  if (!base.startsWith('/')) base = `/${base}`;
  if (!base.endsWith('/')) base = `${base}/`;
  return base;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, 'VITE_');
  return {
    base: normalizeBase(env.VITE_BASE_PATH),
    envDir: rootDir,
    plugins: [
      react(),
      tailwindcss(),
      cspPlugin({ supabaseUrl: env.VITE_SUPABASE_URL, heroVideoUrl: env.VITE_HERO_VIDEO_URL }),
      spaFallback(),
      // Spec 10 §4: src/sw.ts → dist/sw.js with the precache manifest injected. Registration is manual
      // (src/features/pwa/register.ts) and the manifest is the static public/manifest.webmanifest.
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        injectRegister: false,
        manifest: false,
        devOptions: { enabled: false },
        injectManifest: {
          rollupFormat: 'iife',
          sourcemap: false,
          minify: true,
          // App shell + the 21 self-hosted font subsets (440 KB: offline launches must render with the real fonts).
          // 404.html is a copy of index.html (GitHub Pages deep links), big brand art is landing-only.
          globPatterns: ['**/*.{html,js,css,woff,woff2,ico,png,svg,webmanifest}'],
          globIgnores: ['404.html', 'brand/*.{png,webp}'],
          // The main chunk must never be skipped silently (workbox drops files over the limit with a warning).
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        },
      }),
    ],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: { port: 5173, strictPort: true },
    preview: { port: 4173, strictPort: true },
    build: {
      target: 'es2020',
      sourcemap: false,
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              { name: 'v-react', test: /node_modules[\\/](\.pnpm[\\/][^\\/]*[\\/]node_modules[\\/])?(react|react-dom|scheduler)[\\/]/, priority: 10 },
              { name: 'v-router', test: /node_modules[\\/].*react-router/, priority: 9 },
              { name: 'v-supabase', test: /node_modules[\\/].*@supabase/, priority: 9 },
              // Lazy: only route chunks and the app services (app/app-services.ts) build schemas. zod-config.ts sets
              // zod's global jitless config from the entry chunk before zod loads (see its header), so it is not here.
              { name: 'v-zod', test: /node_modules[\\/].*[\\/]zod[\\/]/, priority: 9 },
              { name: 'v-lucide', test: /node_modules[\\/].*lucide/, tags: ['$initial'], priority: 9 },
              { name: 'v-lucide-app', test: /node_modules[\\/].*lucide/, priority: 8 },
            ],
          },
        },
      },
    },
    test: {
      environment: 'happy-dom',
      globals: true,
      setupFiles: ['./tests/unit/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}', 'build/**/*.test.ts'],
      css: false,
      passWithNoTests: true,
    },
  };
});
