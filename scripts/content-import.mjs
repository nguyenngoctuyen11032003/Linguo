#!/usr/bin/env node
// Content import tooling (spec 2 §4.3). Needs tsx to load the shared TS package:
//   node --import tsx scripts/content-import.mjs --check               validate content/ (pnpm content:check)
//   node --import tsx scripts/content-import.mjs --emit-sql            write supabase/seed.sql (pnpm content:build)
//   node --import tsx scripts/content-import.mjs --emit-sql --check    fail if seed.sql is stale
//   node --import tsx scripts/content-import.mjs --apply               import into hosted Supabase (pnpm content:push)
// Options: --dir <content dir> (default content/), --out <seed file> (default supabase/seed.sql).
// --apply needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (legacy service_role JWT or sb_secret_ key):
// it posts the bundle to the service_role-only RPC public.import_content_bundle, a thin wrapper around
// content_private.import_bundle (the same import supabase/seed.sql runs).
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importResultSchema } from '@linguo/shared';
import { buildBundle, renderSeedSql } from './content/build.mjs';
import { checkContent, sharedGrader } from './content/check.mjs';
import { loadContent } from './content/load.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const USAGE = 'Usage: content-import.mjs [--dir <dir>] (--check | --emit-sql [--check] [--out <file>] | --apply)';

/** Value of `--name <value>`: undefined when absent, null when the value is missing. */
function option(argv, name) {
  const i = argv.indexOf(name);
  if (i === -1) return undefined;
  const value = argv[i + 1];
  return value === undefined || value === '' || value.startsWith('--') ? null : value;
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
  const outArg = option(argv, '--out');
  for (const [name, value] of [['--dir', dirArg], ['--out', outArg]]) {
    if (value === null) {
      error(`${name} needs a value.\n${USAGE}`);
      return 2;
    }
  }
  const dir = dirArg ? resolve(cwd, dirArg) : join(root, 'content');
  const out = resolve(cwd, outArg ?? join(root, 'supabase', 'seed.sql'));
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
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const projectUrl = env.SUPABASE_URL;
  if (!key || !projectUrl) {
    error('--apply needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (never VITE_* variables).');
    return 1;
  }
  let endpoint;
  try {
    const base = new URL(projectUrl);
    if (base.protocol !== 'https:' && base.protocol !== 'http:') throw new Error('protocol');
    endpoint = new URL('rest/v1/rpc/import_content_bundle', base.href.endsWith('/') ? base.href : `${base.href}/`).href;
  } catch {
    error('SUPABASE_URL must be the project URL, e.g. https://<ref>.supabase.co.');
    return 1;
  }
  // Never print the key, even if a response or network error happens to contain it.
  const redact = (text) => String(text).split(key).join('<redacted>');
  const bundle = buildBundle(loaded, { gitSha: env.GITHUB_SHA || null });
  let res;
  try {
    res = await fetchImpl(endpoint, {
      method: 'POST',
      // Legacy service_role JWTs and new sb_secret_ keys both work when sent in both headers.
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_bundle: bundle }),
    });
  } catch (e) {
    error(`Import failed: ${redact(e?.message ?? e)}`);
    return 1;
  }
  const body = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = undefined;
  }
  if (!res.ok) {
    // PostgREST errors are {code, message, details, hint}.
    const detail =
      parsed && typeof parsed.message === 'string'
        ? [parsed.code, parsed.message, parsed.details, parsed.hint].filter(Boolean).join(' | ')
        : body;
    error(`Import failed: HTTP ${res.status} ${redact(detail)}`);
    return 1;
  }
  const result = importResultSchema.safeParse(parsed);
  if (!result.success) {
    error(`Import returned an unexpected response: ${redact(body)}`);
    return 1;
  }
  log(`Imported ${lessonCount} lessons: ${JSON.stringify(result.data)}`);
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
