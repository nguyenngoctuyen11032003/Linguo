/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
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
    ],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: { port: 5173, strictPort: true },
    preview: { port: 4173, strictPort: true },
    build: { target: 'es2020', sourcemap: false },
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
