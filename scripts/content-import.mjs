#!/usr/bin/env node
// Content import tooling (spec 2 §4.3). Needs tsx to load the shared TS package:
//   node --import tsx scripts/content-import.mjs --check               validate content/ (pnpm content:check)
//   node --import tsx scripts/content-import.mjs --emit-sql            write supabase/seed.sql (pnpm content:build)
//   node --import tsx scripts/content-import.mjs --emit-sql --check    fail if seed.sql is stale
//   node --import tsx scripts/content-import.mjs --apply               import into hosted Supabase (pnpm content:push)
// Options: --dir <content dir> (default content/), --out <seed file> (default supabase/seed.sql).
// --apply needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (legacy service_role JWT or sb_secret_ key):
// it posts the bundle to the service_role-only RPC public.import_content_bundle, a thin wrapper around
// content_private.import_bundle (the same import supabase/seed.sql runs). When content/diagnostic/ holds
// items it then posts the diagnostic bank to public.import_diagnostic_content_bundle, the wrapper around
// content_private.import_diagnostic_bundle (the second statement of supabase/seed.sql). When content/exams/
// holds forms it finally posts them to public.import_exam_content_bundle (the third statement of seed.sql).
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importResultSchema } from '@linguo/shared';
import { buildBundle, renderSeedSql } from './content/build.mjs';
import { checkContent, sharedGrader } from './content/check.mjs';
import { buildDiagnosticBundle, renderDiagnosticSql } from './content/diagnostic.mjs';
import { buildExamBundle, examFiles, renderExamSql } from './content/exam.mjs';
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
  const diagnosticCount = loaded.files.filter((f) => f.kind === 'diagnostic').reduce((n, f) => n + f.data.items.length, 0);
  const diagnosticNote = diagnosticCount ? `, ${diagnosticCount} diagnostic items` : '';
  const exams = examFiles(loaded.files);
  const examQuestionCount = exams.reduce((n, f) => n + f.data.questions.length, 0);
  const examNote = exams.length ? `, ${exams.length} exam forms (${examQuestionCount} questions)` : '';

  if (!emitSql && !apply) {
    log(`Content OK (${loaded.files.length} files, ${lessonCount} lessons${diagnosticNote}${examNote}).`);
    return 0;
  }

  if (emitSql) {
    // No diagnostic files → no second statement (a lessons-only tree seeds exactly as before).
    const diagnosticSql = diagnosticCount ? renderDiagnosticSql(buildDiagnosticBundle(loaded, { gitSha: null })) : null;
    const examSql = exams.length ? renderExamSql(buildExamBundle(loaded)) : null;
    const sql = renderSeedSql(buildBundle(loaded, { gitSha: null }), diagnosticSql, examSql);
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
    log(`Wrote ${outName} (${lessonCount} lessons${diagnosticNote}${examNote}).`);
    return 0;
  }

  // --apply
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const projectUrl = env.SUPABASE_URL;
  if (!key || !projectUrl) {
    error('--apply needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (never VITE_* variables).');
    return 1;
  }
  let base;
  try {
    base = new URL(projectUrl);
    if (base.protocol !== 'https:' && base.protocol !== 'http:') throw new Error('protocol');
  } catch {
    error('SUPABASE_URL must be the project URL, e.g. https://<ref>.supabase.co.');
    return 1;
  }
  const rpcUrl = (name) => new URL(`rest/v1/rpc/${name}`, base.href.endsWith('/') ? base.href : `${base.href}/`).href;
  // Never print the key, even if a response or network error happens to contain it.
  const redact = (text) => String(text).split(key).join('<redacted>');

  /** POSTs one bundle to a service_role RPC; resolves to the import counts, or null after printing why. */
  const post = async (rpc, bundle) => {
    let res;
    try {
      res = await fetchImpl(rpcUrl(rpc), {
        method: 'POST',
        // Legacy service_role JWTs and new sb_secret_ keys both work when sent in both headers.
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_bundle: bundle }),
      });
    } catch (e) {
      error(`Import failed: ${redact(e?.message ?? e)}`);
      return null;
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
      return null;
    }
    const result = importResultSchema.safeParse(parsed);
    if (!result.success) {
      error(`Import returned an unexpected response: ${redact(body)}`);
      return null;
    }
    return result.data;
  };

  const gitSha = env.GITHUB_SHA || null;
  const lessons = await post('import_content_bundle', buildBundle(loaded, { gitSha }));
  if (!lessons) return 1;
  log(`Imported ${lessonCount} lessons: ${JSON.stringify(lessons)}`);
  if (diagnosticCount) {
    const diagnostic = await post('import_diagnostic_content_bundle', buildDiagnosticBundle(loaded, { gitSha }));
    if (!diagnostic) return 1;
    log(`Imported ${diagnosticCount} diagnostic items: ${JSON.stringify(diagnostic)}`);
  }
  if (exams.length) {
    // The exam bundle has no git_sha (examBundleSchema); its import returns the same counts.
    const exam = await post('import_exam_content_bundle', buildExamBundle(loaded));
    if (!exam) return 1;
    log(`Imported ${exams.length} exam forms (${examQuestionCount} questions): ${JSON.stringify(exam)}`);
  }
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
