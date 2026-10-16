#!/usr/bin/env node
// Performance budget for the first load. Starting from apps/web/dist/index.html (entry script + modulepreload
// links) it follows static `import`s through the emitted chunks, i.e. exactly the JS the browser needs before the
// landing page or sign-in can run, and fails when
//   - the entry chunk (index-*.js) or all initial JS together exceed their gzip budget, or
//   - a chunk that must stay lazy (admin, lesson player, exams, settings, motion features...) is loaded up front
//     because somebody added a static import of it.
// Budgets sit ~15% above the measured size (see BUDGETS); raise them deliberately, with a reason in the commit.
//
// Usage: node scripts/check-bundle-size.mjs [dir]   (default: apps/web/dist)
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

/**
 * Gzip bytes (KiB). Measured 2026-10-16: entry chunk 28.2 KiB, initial JS 146.2 KiB once Supabase and zod moved out of
 * the first load (was 32.5 / 235.8; originally one 357 KiB chunk).
 */
export const BUDGETS = {
  entryChunkGzip: 33 * 1024,
  initialJsGzip: 170 * 1024,
};

/** Route chunks and heavy libraries that must never be part of the initial graph. */
export const LAZY_CHUNKS = [
  /^admin-routes-/,
  /^motion-features-/,
  // Loaded on demand by src/lib/supabase-loader.ts / lazy contract chunks; must not return to the first load.
  /^v-supabase-/,
  /^v-zod-/,
  /^(Lesson|Review|Session|Progress|Settings|Tutor|Onboarding|Home|Learn|Notifications|Diagnostic|DiagnosticReport|ExamHub|ExamRunner|ExamResult)Page-/,
];

const gz = (buf) => gzipSync(buf, { level: 9 }).length;

/** `<script type="module" src>` and `<link rel="modulepreload" href>` targets, as dist-relative paths. */
export function htmlEntries(html) {
  const out = [];
  for (const tag of html.match(/<(?:script|link)\b[^>]*>/gi) ?? []) {
    const isModule = /<script\b[^>]*\btype=["']module["']/i.test(tag) || /<link\b[^>]*\brel=["']modulepreload["']/i.test(tag);
    if (!isModule) continue;
    const href = /\b(?:src|href)=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href || /^https?:\/\//i.test(href)) continue;
    out.push(href);
  }
  return out;
}

/** Static imports of a minified ES chunk: `from"./x.js"` and `import"./x.js"` (never `import("./x.js")`). */
export function staticImports(code) {
  const out = new Set();
  for (const m of code.matchAll(/(?:\bfrom|\bimport)\s*["'](\.{1,2}\/[^"']+\.js)["']/g)) out.add(m[1]);
  return [...out];
}

/** Resolves an html reference (`/linguo/assets/x.js`, `./assets/x.js`) to a path under the dist dir. */
function distPath(dir, ref) {
  const clean = ref.split(/[?#]/)[0];
  const i = clean.indexOf('assets/');
  return i === -1 ? resolve(dir, clean.replace(/^\/+/, '')) : join(dir, clean.slice(i));
}

/** The initial JS graph of a built dist dir: [{ file, raw, gzip }] plus the entry chunk's file name. */
export function initialGraph(dir) {
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  const entryRefs = htmlEntries(html);
  const scripts = [...html.matchAll(/<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["']/gi)].map((m) => m[1]);
  if (!scripts.length) throw new Error('index.html không có <script type="module">');
  const seen = new Map();
  const visit = (file) => {
    if (seen.has(file)) return;
    const buf = readFileSync(file);
    seen.set(file, { file: relative(dir, file).replace(/\\/g, '/'), raw: buf.length, gzip: gz(buf) });
    for (const imp of staticImports(buf.toString('utf8'))) visit(resolve(dirname(file), imp));
  };
  for (const ref of entryRefs) visit(distPath(dir, ref));
  const entryFile = relative(dir, distPath(dir, scripts[0])).replace(/\\/g, '/');
  return { chunks: [...seen.values()], entryFile };
}

/** Violations as human-readable strings (empty when within budget). */
export function checkGraph({ chunks, entryFile }, budgets = BUDGETS, lazy = LAZY_CHUNKS) {
  const problems = [];
  const entry = chunks.find((c) => c.file === entryFile);
  if (!entry) problems.push(`Không tìm thấy chunk entry ${entryFile}`);
  else if (entry.gzip > budgets.entryChunkGzip) {
    problems.push(`Chunk entry ${entry.file} ${kb(entry.gzip)} gzip vượt ngân sách ${kb(budgets.entryChunkGzip)}`);
  }
  const total = chunks.reduce((sum, c) => sum + c.gzip, 0);
  if (total > budgets.initialJsGzip) {
    problems.push(`JS tải đầu tiên ${kb(total)} gzip (${chunks.length} chunk) vượt ngân sách ${kb(budgets.initialJsGzip)}`);
  }
  for (const c of chunks) {
    const name = c.file.split('/').pop();
    if (lazy.some((re) => re.test(name))) problems.push(`Chunk ${c.file} phải tải theo yêu cầu nhưng đang nằm trong JS tải đầu tiên (static import?)`);
  }
  return problems;
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    const a = realpathSync(process.argv[1]);
    const b = realpathSync(fileURLToPath(import.meta.url));
    return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  const dir = resolve(process.argv[2] ?? 'apps/web/dist');
  if (!existsSync(join(dir, 'index.html')) || !statSync(dir).isDirectory()) {
    console.error(`::error::Không thấy ${join(dir, 'index.html')}. Chạy pnpm build trước.`);
    process.exit(1);
  }
  const graph = initialGraph(dir);
  const total = graph.chunks.reduce((sum, c) => sum + c.gzip, 0);
  const entry = graph.chunks.find((c) => c.file === graph.entryFile);
  console.log(`Entry ${graph.entryFile}: ${kb(entry?.gzip ?? 0)} gzip (ngân sách ${kb(BUDGETS.entryChunkGzip)})`);
  console.log(`JS tải đầu tiên: ${kb(total)} gzip trong ${graph.chunks.length} chunk (ngân sách ${kb(BUDGETS.initialJsGzip)})`);
  if (process.env.VERBOSE) for (const c of graph.chunks) console.log(`  ${c.file} ${kb(c.raw)} raw, ${kb(c.gzip)} gzip`);
  const problems = checkGraph(graph);
  if (problems.length) {
    for (const p of problems) console.error(`::error::${p}`);
    process.exit(1);
  }
  console.log('Ngân sách kích thước bundle OK.');
}
