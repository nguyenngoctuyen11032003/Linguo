#!/usr/bin/env node
// Content import tooling (spec 2 §4.3). Needs tsx to load the shared TS package:
//   node --import tsx scripts/content-import.mjs --check               validate content/ (pnpm content:check)
//   node --import tsx scripts/content-import.mjs --emit-sql            write supabase/seed.sql (pnpm content:build)
//   node --import tsx scripts/content-import.mjs --emit-sql --check    fail if seed.sql is stale
//   node --import tsx scripts/content-import.mjs --apply               import into hosted Supabase (pnpm content:push)
// Options: --dir <content dir> (default content/), --out <seed file> (default supabase/seed.sql).
// --apply needs SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_ID: content_private is not exposed
// through PostgREST, so it runs the seed SQL via the Supabase Management API.
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBundle, renderSeedSql } from './content/build.mjs';
import { checkContent, sharedGrader } from './content/check.mjs';
import { loadContent } from './content/load.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const USAGE = 'Usage: content-import.mjs [--dir <dir>] (--check | --emit-sql [--check] [--out <file>] | --apply)';

function option(argv, name) {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

const display = (path, cwd) => relative(cwd, path).split(sep).join('/') || '.';

/**
 * Runs the CLI and resolves to the process exit code. Everything external is injectable for tests.
 */
export async function main(
  argv,
  { env = process.env, cwd = process.cwd(), grade = sharedGrader(), fetchImpl = globalThis.fetch, log = console.log, error = console.error } = {},
) {
  const emitSql = argv.includes('--emit-sql');
  const apply = argv.includes('--apply');
  const check = argv.includes('--check');
  if ((!emitSql && !apply && !check) || (apply && (emitSql || check))) {
    error(USAGE);
    return 2;
  }
  const dirArg = option(argv, '--dir');
  const dir = dirArg ? resolve(cwd, dirArg) : join(root, 'content');
  const out = resolve(cwd, option(argv, '--out') ?? join(root, 'supabase', 'seed.sql'));
  const outName = display(out, cwd);

  if (!existsSync(dir) && !apply) {
    // Before any content exists there is nothing to check or seed; a stale seed.sql is still an error.
    if (!existsSync(out) && !(emitSql && !check)) {
      log(`No content directory (${display(dir, cwd)}) and no ${outName}: nothing to do.`);
      return 0;
    }
  }

  const loaded = loadContent(dir, { label: display(dir, cwd) });
  const errors = checkContent(loaded, { grade });
  if (errors.length) {
    for (const e of errors) error(e);
    error(`\n${errors.length} content error(s).`);
    return 1;
  }
  const lessonCount = loaded.files.filter((f) => f.kind === 'lesson').length;

  if (!emitSql && !apply) {
    log(`Content OK (${loaded.files.length} files, ${lessonCount} lessons).`);
    return 0;
  }

  if (emitSql) {
    const sql = renderSeedSql(buildBundle(loaded, { gitSha: null }));
    if (check) {
      const current = existsSync(out) ? readFileSync(out, 'utf8') : null;
      if (current !== sql) {
        error(`${outName} is ${current === null ? 'missing' : 'out of date'}: run \`pnpm content:build\` and commit it.`);
        return 1;
      }
      log(`${outName} is up to date.`);
      return 0;
    }
    writeFileSync(out, sql);
    log(`Wrote ${outName} (${lessonCount} lessons).`);
    return 0;
  }

  // --apply
  const token = env.SUPABASE_ACCESS_TOKEN;
  const projectId = env.SUPABASE_PROJECT_ID;
  if (!token || !projectId) {
    error('--apply needs SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_ID (never VITE_* variables).');
    return 1;
  }
  if (!/^[a-z0-9-]+$/i.test(projectId)) {
    error('SUPABASE_PROJECT_ID must be the project ref (letters and digits only).');
    return 1;
  }
  const sql = renderSeedSql(buildBundle(loaded, { gitSha: env.GITHUB_SHA || null }));
  const res = await fetchImpl(`https://api.supabase.com/v1/projects/${projectId}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  if (!res.ok) {
    error(`Import failed: HTTP ${res.status} ${body}`);
    return 1;
  }
  let result = body;
  try {
    const rows = JSON.parse(body);
    result = JSON.stringify(Array.isArray(rows) && rows[0] ? (rows[0].import_bundle ?? rows[0]) : rows);
  } catch {
    // keep the raw body
  }
  log(`Imported ${lessonCount} lessons: ${result}`);
  return 0;
}

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
  process.exitCode = await main(process.argv.slice(2));
}
