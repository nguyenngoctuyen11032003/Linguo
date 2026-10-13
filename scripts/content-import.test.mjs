// Run with: node --import tsx --test scripts/content-import.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleSchema, gradeResponse } from '@linguo/shared';
import { main } from './content-import.mjs';
import { buildBundle, renderSeedSql } from './content/build.mjs';
import { checkContent, sharedGrader } from './content/check.mjs';

test('check.mjs uses the shared gradeResponse by default', () => {
  assert.equal(sharedGrader(), gradeResponse);
});
import { hashRow } from './content/hash.mjs';
import { contentId, uuidV5 } from './content/ids.mjs';
import { loadContent } from './content/load.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const VALID = join(here, '__fixtures__', 'content-valid');
const LESSON_1 = 'en/programs/basics/units/01-hello/lessons/01-hello.yaml';
const LESSON_2 = 'en/programs/basics/units/01-hello/lessons/02-i-am.yaml';
const PROGRAM = 'en/programs/basics/program.yaml';

const grade = gradeResponse;

function tempTree(t) {
  const dir = mkdtempSync(join(tmpdir(), 'linguo-content-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const content = join(dir, 'content');
  cpSync(VALID, content, { recursive: true });
  return { dir, content };
}

function edit(content, file, from, to) {
  const path = join(content, file);
  const text = readFileSync(path, 'utf8');
  assert.ok(text.includes(from), `fixture ${file} must contain ${JSON.stringify(from)}`);
  writeFileSync(path, text.replace(from, to));
}


test('contentId is a stable RFC 4122 v5 UUID under CONTENT_UUID_NAMESPACE', () => {
  const id = contentId('en:lesson:x');
  assert.equal(id, '18a21b67-7bdc-5f97-b9e8-452e1f330e8a');
  // Known RFC 4122 vector (Python uuid.uuid5(NAMESPACE_DNS, 'www.example.com')).
  assert.equal(uuidV5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8'), '2ed6657d-e927-568b-95e1-2665a8aea6a2');
  assert.equal(id[14], '5', 'version nibble');
  assert.match(id[19], /[89ab]/, 'RFC 4122 variant');
  assert.equal(contentId('en:lesson:x'), id);
  assert.notEqual(contentId('en:lesson:y'), id);
});

test('hashRow ignores key order and review fields', () => {
  const a = hashRow({ key: 'k', title: { vi: 'x' }, order_index: 1, status: 'draft' });
  const b = hashRow({ order_index: 1, title: { vi: 'x' }, key: 'k', status: 'published', reviewed_at: '2026-01-01T00:00:00Z' });
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(hashRow({ key: 'k', title: { vi: 'y' }, order_index: 1 }), a);
  assert.notEqual(hashRow({ key: 'k' }, { exercises: ['1'] }), hashRow({ key: 'k' }, { exercises: ['2'] }));
});

test('valid fixture passes the checks and builds a bundle with exact counts', () => {
  const loaded = loadContent(VALID, { label: 'content' });
  assert.deepEqual(checkContent(loaded, { grade }), []);
  const bundle = buildBundle(loaded);
  assert.ok(bundleSchema.safeParse(bundle).success);
  const counts = Object.fromEntries(
    ['sources', 'programs', 'units', 'lessons', 'lesson_prerequisites', 'learning_items', 'lesson_items', 'exercises'].map((k) => [k, bundle[k].length]),
  );
  assert.deepEqual(counts, {
    sources: 1,
    programs: 1,
    units: 1,
    lessons: 2,
    lesson_prerequisites: 1,
    learning_items: 2,
    lesson_items: 3,
    exercises: 6,
  });
  assert.equal(bundle.git_sha, null);
  assert.deepEqual(bundle.lesson_prerequisites[0], {
    lesson_id: contentId('en:lesson:i-am'),
    prerequisite_lesson_id: contentId('en:lesson:hello'),
  });
  const ex = bundle.exercises.find((e) => e.key === 'en:ex:hello-mcq');
  assert.equal(ex.id, contentId('en:ex:hello-mcq'));
  assert.equal(ex.source_id, contentId('src:fixture'));
  assert.equal(ex.is_demo, true);
  assert.equal(ex.status, 'published');
  assert.deepEqual(ex.key_data.answer_key, { correct_option_id: 'a' });
  assert.equal('answer' in ex.prompt || 'correct_option_id' in ex.prompt, false);
  assert.deepEqual(bundle.learning_items.map((i) => i.status), ['published', 'published']);
  assert.equal(buildBundle(loaded, { gitSha: 'abc' }).git_sha, 'abc');
});

test('a change in an exercise changes its lesson hash but not the other lesson', (t) => {
  const before = buildBundle(loadContent(VALID, { label: 'content' }));
  const { content } = tempTree(t);
  edit(content, LESSON_1, 'display_answer: xin chào', 'display_answer: Xin chào');
  const after = buildBundle(loadContent(content, { label: 'content' }));
  const hash = (b, key) => b.lessons.find((l) => l.key === key).content_hash;
  assert.notEqual(hash(after, 'en:lesson:hello'), hash(before, 'en:lesson:hello'));
  assert.equal(hash(after, 'en:lesson:i-am'), hash(before, 'en:lesson:i-am'));
});

const INVALID = [
  {
    name: 'lesson missing common_mistake block',
    file: LESSON_1,
    from: '  - type: common_mistake\n    wrong: I student.\n    right: I am a student.\n    target_lang: en\n    note: { vi: Tiếng Anh cần động từ "be". }\n',
    to: '',
    message: `content/${LESSON_1}: missing block common_mistake`,
  },
  {
    name: 'prerequisite cycle',
    file: LESSON_1,
    from: 'skills: [vocabulary]',
    to: 'skills: [vocabulary]\nprerequisites: [en:lesson:i-am]',
    message: 'prerequisite cycle: en:lesson:hello → en:lesson:i-am → en:lesson:hello',
  },
  {
    name: 'unknown prerequisite key',
    file: LESSON_2,
    from: 'prerequisites: [en:lesson:hello]',
    to: 'prerequisites: [en:lesson:nope]',
    message: `content/${LESSON_2}: unknown prerequisite "en:lesson:nope"`,
  },
  {
    name: 'mcq answer id not among options',
    file: LESSON_1,
    from: 'answer: { correct_option_id: a }',
    to: 'answer: { correct_option_id: z }',
    message: 'answer correct_option_id "z" is not an option (a, b)',
  },
  {
    name: 'word_bank order token not among tokens',
    file: LESSON_2,
    from: 'orders: [[t1, t2, t3]]',
    to: 'orders: [[t1, t2, t9]]',
    message: 'word_bank order 0 token "t9" is not a token',
  },
  {
    name: 'demo file with reviewed_at set',
    file: PROGRAM,
    from: 'status: published',
    to: "status: published\nreviewed_by: someone\nreviewed_at: '2026-10-01T00:00:00Z'",
    message: `content/${PROGRAM}: demo: true but reviewed_at/reviewed_by is set`,
  },
  {
    name: 'non-demo published file without review',
    file: PROGRAM,
    from: 'demo: true',
    to: 'demo: false',
    message: `content/${PROGRAM}: status published requires reviewed_at unless the file is demo: true`,
  },
  {
    name: 'level code invalid for language',
    file: LESSON_2,
    from: 'level: a1',
    to: 'level: topik1',
    message: `content/${LESSON_2}: level "topik1" is not a en level`,
  },
  {
    name: 'accepted answer that grades incorrect',
    file: LESSON_1,
    from: 'answer:\n      blanks: { b1: [am] }',
    to: 'answer:\n      blanks: { b1: [am, is] }',
    message: 'known_wrong answer "is" in blank "b1" grades correct, expected incorrect',
  },
  {
    name: 'mcq distractor that grades correct',
    file: LESSON_1,
    from: '    answer: { correct_option_id: a }',
    to: '    answer: { correct_option_id: a }',
    message: 'distractor option "b" grades correct, expected incorrect',
    // Distinct option ids can never grade alike under the real grader, so simulate a grader
    // regression that accepts every option: the checker must still catch the distractor.
    gradeOverride: (input, response) => ('option_id' in response ? { verdict: 'correct' } : grade(input, response)),
  },
  {
    name: 'accepted translation that grades incorrect (normalizes to empty)',
    file: LESSON_1,
    from: "accepted: [I am a student., I'm a student., I am a pupil.]",
    to: "accepted: [I am a student., I'm a student., '?!']",
    message: 'accepted answer "?!" grades incorrect, expected correct',
  },
  {
    name: 'known_wrong translation that grades correct',
    file: LESSON_1,
    from: '{ answer: I student., feedback_vi',
    to: '{ answer: I am a student, feedback_vi',
    message: 'known_wrong answer "I am a student" grades correct, expected incorrect',
  },
  {
    name: 'missing recognition stage',
    file: LESSON_2,
    from: 'stage: recognition',
    to: 'stage: recall',
    message: `content/${LESSON_2}: missing stage recognition`,
  },
  {
    name: 'non-NFC text',
    file: LESSON_1,
    from: 'title: { vi: Xin chào }',
    to: `title: { vi: ${'Xin chào'.normalize('NFD')} }`,
    message: `content/${LESSON_1}: text is not NFC-normalized (line 8)`,
  },
  {
    name: 'duplicate YAML key',
    file: PROGRAM,
    from: 'kind: core',
    to: 'kind: core\nkind: goal',
    message: `content/${PROGRAM}: invalid YAML`,
  },
  {
    name: 'unknown source',
    file: PROGRAM,
    from: 'source: src:fixture',
    to: 'source: src:other',
    message: `content/${PROGRAM}: unknown source "src:other"`,
  },
];

for (const c of INVALID) {
  test(`--check rejects: ${c.name}`, (t) => {
    const { content } = tempTree(t);
    edit(content, c.file, c.from, c.to);
    const errors = checkContent(loadContent(content, { label: 'content' }), { grade: c.gradeOverride ?? grade });
    assert.ok(
      errors.some((e) => e.includes(c.message)),
      `expected an error containing ${JSON.stringify(c.message)}, got:\n${errors.join('\n')}`,
    );
    for (const e of errors) assert.match(e, /^content\/\S+: /);
  });
}

test('every exercise is reported when no grader is available', () => {
  const errors = checkContent(loadContent(VALID, { label: 'content' }), { grade: null });
  assert.equal(errors.length, 6);
  assert.match(errors[0], /gradeResponse is not exported/);
});

function cli(t, argv, options = {}) {
  const out = [];
  const err = [];
  return main(argv, { grade, log: (m) => out.push(m), error: (m) => err.push(m), ...options }).then((code) => ({
    code,
    out: out.join('\n'),
    err: err.join('\n'),
  }));
}

test('CLI --check exits 1 and prints content/<path>: <message>', async (t) => {
  const { dir, content } = tempTree(t);
  edit(content, LESSON_2, 'prerequisites: [en:lesson:hello]', 'prerequisites: [en:lesson:nope]');
  const r = await cli(t, ['--check', '--dir', 'content'], { cwd: dir });
  assert.equal(r.code, 1);
  assert.match(r.err, new RegExp(`^content/${LESSON_2.replaceAll('.', '\\.')}: unknown prerequisite`, 'm'));
  const ok = await cli(t, ['--check', '--dir', VALID]);
  assert.equal(ok.code, 0, ok.err);
});

test('--emit-sql is byte-identical across runs and starts with the generated header', async (t) => {
  const { dir } = tempTree(t);
  const seed = join(dir, 'seed.sql');
  assert.equal((await cli(t, ['--emit-sql', '--dir', 'content', '--out', 'seed.sql'], { cwd: dir })).code, 0);
  const first = readFileSync(seed, 'utf8');
  assert.equal((await cli(t, ['--emit-sql', '--dir', 'content', '--out', 'seed.sql'], { cwd: dir })).code, 0);
  assert.equal(readFileSync(seed, 'utf8'), first);
  assert.ok(first.startsWith('-- GENERATED by scripts/content-import.mjs'));
  assert.match(first, /^select content_private\.import_bundle\(\$bundle\$\{\n {2}"bundle_version": 1,/m);
  assert.ok(first.endsWith('$bundle$::jsonb);\n'));
  assert.equal(first, renderSeedSql(buildBundle(loadContent(join(dir, 'content'), { label: 'content' }))));
  // GITHUB_SHA never leaks into seed.sql (it would make --check fail in CI).
  assert.ok(first.includes('"git_sha": null'));
});

test('--emit-sql --check fails when seed.sql differs or is missing', async (t) => {
  const { dir, content } = tempTree(t);
  const args = ['--emit-sql', '--check', '--dir', 'content', '--out', 'seed.sql'];
  const missing = await cli(t, args, { cwd: dir });
  assert.equal(missing.code, 1);
  assert.match(missing.err, /seed\.sql is missing/);
  await cli(t, ['--emit-sql', '--dir', 'content', '--out', 'seed.sql'], { cwd: dir });
  assert.equal((await cli(t, args, { cwd: dir })).code, 0);
  edit(content, LESSON_1, 'estimated_minutes: 5', 'estimated_minutes: 6');
  const stale = await cli(t, args, { cwd: dir });
  assert.equal(stale.code, 1);
  assert.match(stale.err, /seed\.sql is out of date/);
});

test('missing content dir is tolerated only while seed.sql is absent', async (t) => {
  const { dir } = tempTree(t);
  const args = ['--emit-sql', '--check', '--dir', 'nope', '--out', 'seed.sql'];
  assert.equal((await cli(t, args, { cwd: dir })).code, 0);
  assert.equal((await cli(t, ['--check', '--dir', 'nope', '--out', 'seed.sql'], { cwd: dir })).code, 0);
  writeFileSync(join(dir, 'seed.sql'), 'select 1;\n');
  const r = await cli(t, args, { cwd: dir });
  assert.equal(r.code, 1);
  assert.match(r.err, /content directory not found/);
  assert.equal(existsSync(join(dir, 'nope')), false);
});

test('--apply refuses without credentials and posts the seed SQL to the Management API', async (t) => {
  const none = await cli(t, ['--apply', '--dir', VALID], { env: {} });
  assert.equal(none.code, 1);
  assert.match(none.err, /SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_ID/);
  const onlyToken = await cli(t, ['--apply', '--dir', VALID], { env: { SUPABASE_ACCESS_TOKEN: 't' } });
  assert.equal(onlyToken.code, 1);

  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify([{ import_bundle: { inserted: 15, updated: 0, archived: 0, unchanged: 0 } }]), { status: 201 });
  };
  const env = { SUPABASE_ACCESS_TOKEN: 'tok', SUPABASE_PROJECT_ID: 'abcdefghijklmnopqrst', GITHUB_SHA: 'deadbeef' };
  const r = await cli(t, ['--apply', '--dir', VALID], { env, fetchImpl });
  assert.equal(r.code, 0, r.err);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.supabase.com/v1/projects/abcdefghijklmnopqrst/database/query');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
  const { query } = JSON.parse(calls[0].init.body);
  assert.match(query, /select content_private\.import_bundle\(\$bundle\$/);
  assert.ok(query.includes('"git_sha": "deadbeef"'));
  assert.match(r.out, /"inserted":15/);

  const failing = await cli(t, ['--apply', '--dir', VALID], { env, fetchImpl: async () => new Response('nope', { status: 401 }) });
  assert.equal(failing.code, 1);
  assert.match(failing.err, /HTTP 401/);
});

test('usage errors exit 2', async (t) => {
  assert.equal((await cli(t, [])).code, 2);
  assert.equal((await cli(t, ['--apply', '--check'])).code, 2);
});
