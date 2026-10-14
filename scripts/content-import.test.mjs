// Run with: node --import tsx --test scripts/content-import.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleSchema, diagnosticBundleSchema, diagnosticItemSchema, examBundleSchema, examServedQuestionSchema, gradeExamAnswer, gradeResponse } from '@linguo/shared';
import { main } from './content-import.mjs';
import { buildBundle, renderSeedSql } from './content/build.mjs';
import { checkContent, sharedGrader } from './content/check.mjs';

test('check.mjs uses the shared gradeResponse by default', () => {
  assert.equal(sharedGrader(), gradeResponse);
});
import { buildDiagnosticBundle, renderDiagnosticSql } from './content/diagnostic.mjs';
import { buildExamBundle, renderExamSql } from './content/exam.mjs';
import { canonicalJson, hashRow } from './content/hash.mjs';
import { contentId, uuidV5 } from './content/ids.mjs';
import { loadContent } from './content/load.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const VALID = join(here, '__fixtures__', 'content-valid');
const LESSON_1 = 'en/programs/basics/units/01-hello/lessons/01-hello.yaml';
const LESSON_2 = 'en/programs/basics/units/01-hello/lessons/02-i-am.yaml';
const PROGRAM = 'en/programs/basics/program.yaml';
const ITEMS = 'en/items/basics.yaml';

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
    message: `content/${PROGRAM}: status published requires reviewed_at and reviewed_by unless the file is demo: true`,
  },
  {
    name: 'non-demo published lesson with reviewed_at but no reviewed_by',
    file: LESSON_1,
    from: 'demo: true',
    to: "demo: false\nreviewed_at: '2026-10-01T00:00:00Z'",
    message: `content/${LESSON_1}: status published requires reviewed_at and reviewed_by`,
  },
  {
    name: 'non-demo items file without an explicit status',
    file: ITEMS,
    from: 'demo: true',
    to: 'demo: false',
    message: `content/${ITEMS}: demo: false requires an explicit status`,
  },
  {
    name: 'non-demo published items file without review',
    file: ITEMS,
    from: 'demo: true',
    to: 'demo: false\nstatus: published',
    message: `content/${ITEMS}: status published requires reviewed_at and reviewed_by`,
  },
  {
    name: 'demo items file with reviewed_by set',
    file: ITEMS,
    from: 'demo: true',
    to: 'demo: true\nreviewed_by: someone',
    message: `content/${ITEMS}: demo: true but reviewed_at/reviewed_by is set`,
  },
  {
    name: 'non-demo source entry without an explicit status',
    file: 'sources.yaml',
    from: '    demo: true',
    to: '    demo: false',
    message: 'content/sources.yaml: source "src:fixture": demo: false requires an explicit status',
  },
  {
    name: 'published lesson linking a draft item',
    file: ITEMS,
    from: 'demo: true',
    to: 'demo: true\nstatus: draft',
    message: `content/${LESSON_1}: published lesson links item "en:item:hello" whose status is draft (must be published)`,
  },
  {
    name: 'published lesson exercise using a draft item',
    file: ITEMS,
    from: 'demo: true',
    to: 'demo: true\nstatus: in_review',
    message: 'exercises[0] "en:ex:hello-mcq": published lesson uses item "en:item:hello" whose status is in_review',
  },
  {
    name: 'level code invalid for language',
    file: LESSON_2,
    from: 'level: a1',
    to: 'level: topik1',
    message: `content/${LESSON_2}: level "topik1" is not a en level`,
  },
  {
    name: 'fill_blank known_wrong that is an accepted answer of its blank',
    file: LESSON_1,
    from: 'answer:\n      blanks: { b1: [am] }',
    to: 'answer:\n      blanks: { b1: [am, is] }',
    message: 'known_wrong answer "is" is an accepted answer of blank "b1"',
  },
  {
    name: 'fill_blank known_wrong that is an accepted answer of another blank',
    file: LESSON_1,
    from: 'template: "I {{b1}} a student."\n      blanks: [{ id: b1 }]\n    answer:\n      blanks: { b1: [am] }',
    to: 'template: "I {{b1}} a student. He {{b2}} a student."\n      blanks: [{ id: b1 }, { id: b2 }]\n    answer:\n      blanks: { b1: [am], b2: [is] }',
    message: 'known_wrong answer "is" is an accepted answer of blank "b2"',
  },
  {
    name: 'fill_blank accepted answer that grades incorrect',
    file: LESSON_1,
    from: 'answer:\n      blanks: { b1: [am] }',
    to: "answer:\n      blanks: { b1: [am, '...'] }",
    message: 'accepted answer "..." for blank "b1" grades incorrect, expected correct',
  },
  {
    name: 'word_bank tokens listed in the answer order',
    file: LESSON_2,
    from: '        - { id: t4, text: is }\n        - { id: t3, text: Lan }\n        - { id: t1, text: I }\n        - { id: t2, text: am }',
    to: '        - { id: t1, text: I }\n        - { id: t4, text: is }\n        - { id: t2, text: am }\n        - { id: t3, text: Lan }',
    message: 'word_bank tokens are listed in the order of answer order 0',
  },
  {
    name: 'translate vi_to_target with answer_lang vi',
    file: LESSON_1,
    from: 'answer_lang: en\n    prompt:\n      source_text: Tôi là học sinh.',
    to: 'answer_lang: vi\n    prompt:\n      source_text: Tôi là học sinh.',
    message: 'exercises[2] "en:ex:hello-translate": translate vi_to_target needs answer_lang "en", got "vi"',
  },
  {
    name: 'translate vi_to_target with a non-Vietnamese source_lang',
    file: LESSON_1,
    from: 'source_lang: vi',
    to: 'source_lang: en',
    message: 'translate vi_to_target needs source_lang "vi", got "en"',
  },
  {
    name: 'translate target_to_vi with answer_lang of the lesson language',
    file: LESSON_2,
    from: 'answer_lang: vi',
    to: 'answer_lang: en',
    message: 'translate target_to_vi needs answer_lang "vi", got "en"',
  },
  {
    name: 'translate target_to_vi with source_lang of another language',
    file: LESSON_2,
    from: 'source_lang: en',
    to: 'source_lang: ko',
    message: 'translate target_to_vi needs source_lang "en", got "ko"',
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
    message: `content/${LESSON_1}: text is not NFC-normalized at title.vi`,
  },
  {
    name: 'non-NFC text written as a YAML escape',
    file: LESSON_1,
    from: 'title: { vi: Xin chào }',
    to: 'title: { vi: "To\\u0302i" }',
    message: `content/${LESSON_1}: text is not NFC-normalized at title.vi`,
  },
  {
    name: 'NUL character (YAML escape)',
    file: LESSON_1,
    from: 'title: { vi: Xin chào }',
    to: 'title: { vi: "Xin\\0chào" }',
    message: `content/${LESSON_1}: forbidden character U+0000 at title.vi`,
  },
  {
    name: 'C0 control character in a nested value',
    file: ITEMS,
    from: 'meaning: { vi: xin chào }',
    to: 'meaning: { vi: "xin\\u001bchào" }',
    message: `content/${ITEMS}: forbidden character U+001B at items.0.back.meaning.vi`,
  },
  {
    name: 'noncharacter U+FFFF',
    file: LESSON_2,
    from: 'display_answer: I am Lan.\n  - key: en:ex:i-am-translate',
    to: 'display_answer: "I am Lan.\\uFFFF"\n  - key: en:ex:i-am-translate',
    message: `content/${LESSON_2}: forbidden character U+FFFF at exercises.0.display_answer`,
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

const check = (content) => checkContent(loadContent(content, { label: 'content' }), { grade });
const REVIEW = "reviewed_by: Reviewer\nreviewed_at: '2026-10-01T00:00:00Z'";

test('reviewed non-demo content imports every row kind as published', (t) => {
  const { content } = tempTree(t);
  edit(content, 'sources.yaml', '    demo: true', `    demo: false\n    status: published\n${REVIEW.replace(/^/gm, '    ')}`);
  edit(content, ITEMS, 'demo: true', `demo: false\nstatus: published\n${REVIEW}`);
  for (const f of [PROGRAM, 'en/programs/basics/units/01-hello/unit.yaml', LESSON_1, LESSON_2]) {
    edit(content, f, 'demo: true', `demo: false\n${REVIEW}`);
  }
  const loaded = loadContent(content, { label: 'content' });
  assert.deepEqual(checkContent(loaded, { grade }), []);
  const bundle = buildBundle(loaded);
  for (const kind of ['sources', 'programs', 'units', 'lessons', 'learning_items', 'exercises']) {
    for (const row of bundle[kind]) {
      assert.equal(row.status, 'published', `${kind} ${row.key}`);
      assert.equal(row.is_demo, false, `${kind} ${row.key}`);
      assert.equal(row.reviewed_by, 'Reviewer', `${kind} ${row.key}`);
    }
  }
});

test('an explicit item status is imported as authored', (t) => {
  const { content } = tempTree(t);
  edit(content, ITEMS, 'demo: true', 'demo: true\nstatus: archived');
  for (const f of [LESSON_1, LESSON_2]) edit(content, f, 'status: published', 'status: draft');
  const loaded = loadContent(content, { label: 'content' });
  assert.deepEqual(checkContent(loaded, { grade }), []);
  assert.deepEqual(buildBundle(loaded).learning_items.map((i) => i.status), ['archived', 'archived']);
});

test('fill_blank known_wrong may be wrong in one blank and unrelated to another', (t) => {
  const { content } = tempTree(t);
  edit(
    content,
    LESSON_1,
    'template: "I {{b1}} a student."\n      blanks: [{ id: b1 }]\n    answer:\n      blanks: { b1: [am] }',
    'template: "I {{b1}} a {{b2}}."\n      blanks: [{ id: b1 }, { id: b2 }]\n    answer:\n      blanks: { b1: [am], b2: [student, pupil] }',
  );
  assert.deepEqual(check(content), []);
});

test('YAML extensions are matched case-insensitively; other files are rejected', (t) => {
  const { content } = tempTree(t);
  renameSync(join(content, ITEMS), join(content, 'en/items/basics.YML'));
  writeFileSync(join(content, 'NOTES.MD'), '# notes\n');
  const loaded = loadContent(content, { label: 'content' });
  assert.deepEqual(checkContent(loaded, { grade }), []);
  assert.equal(buildBundle(loaded).learning_items.length, 2);

  writeFileSync(join(content, 'en/items/extra.txt'), 'hello\n');
  writeFileSync(join(content, 'en/.gitkeep'), '');
  const errors = check(content);
  assert.ok(errors.includes('content/en/items/extra.txt: unexpected file (content/ holds only .yaml/.yml content files and .md docs)'), errors.join('\n'));
  assert.ok(errors.some((e) => e.startsWith('content/en/.gitkeep: unexpected file')), errors.join('\n'));
});

test('a UTF-8 BOM does not hide the demo header', (t) => {
  const { content } = tempTree(t);
  for (const f of [PROGRAM, ITEMS, 'sources.yaml']) {
    const path = join(content, f);
    writeFileSync(path, `\u{FEFF}${readFileSync(path, 'utf8')}`);
  }
  assert.deepEqual(check(content), []);
});

test('duplicate key across files', (t) => {
  const { content } = tempTree(t);
  cpSync(join(content, ITEMS), join(content, 'en/items/more.yaml'));
  const errors = check(content);
  assert.ok(
    errors.includes(`content/en/items/more.yaml: duplicate key "en:item:hello" (also in content/${ITEMS})`),
    errors.join('\n'),
  );
});

/** Adds a ko copy of the en fixture tree (keys, languages and levels mapped to Korean). */
function addKoreanCopy(content) {
  cpSync(join(content, 'en'), join(content, 'ko'), { recursive: true });
  const files = readdirSync(join(content, 'ko'), { recursive: true }).filter((f) => f.endsWith('.yaml'));
  for (const f of files) {
    const path = join(content, 'ko', f);
    const text = readFileSync(path, 'utf8')
      .replaceAll('en:', 'ko:')
      .replace(/: en\b/g, ': ko')
      .replaceAll('pre_a1', 'hangul')
      .replace(/\ba1\b/g, 'topik1');
    writeFileSync(path, text);
  }
}

test('cross-language prerequisite is rejected', (t) => {
  const { content } = tempTree(t);
  addKoreanCopy(content);
  assert.deepEqual(check(content), [], 'the ko copy itself is valid');
  edit(content, LESSON_2, 'prerequisites: [en:lesson:hello]', 'prerequisites: [ko:lesson:hello]');
  const errors = check(content);
  assert.ok(errors.includes(`content/${LESSON_2}: prerequisite "ko:lesson:hello" is in another language (ko)`), errors.join('\n'));
});

test('seed SQL does not depend on authoring order (file names, item order, key order)', (t) => {
  const expected = renderSeedSql(buildBundle(loadContent(VALID, { label: 'content' })));
  const { content } = tempTree(t);
  // Items listed in the opposite order, in a file that sorts last.
  const items = readFileSync(join(content, ITEMS), 'utf8');
  const [head, list] = items.split('items:\n');
  const at = list.indexOf('  - key: en:item:student');
  rmSync(join(content, ITEMS));
  writeFileSync(join(content, 'en/items/zz-basics.yaml'), `${head}items:\n${list.slice(at)}${list.slice(0, at)}`);
  // Top-level keys of program.yaml and lesson keys reordered.
  edit(content, PROGRAM, 'order_index: 0\n', '');
  edit(content, PROGRAM, 'schema_version: 1\n', 'schema_version: 1\norder_index: 0\n');
  edit(content, LESSON_1, 'estimated_minutes: 5\n', '');
  edit(content, LESSON_1, 'key: en:lesson:hello\n', 'estimated_minutes: 5\nkey: en:lesson:hello\n');
  const loaded = loadContent(content, { label: 'content' });
  assert.deepEqual(checkContent(loaded, { grade }), []);
  assert.equal(renderSeedSql(buildBundle(loaded)), expected);
});

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

const APPLY_KEY = 'sb_secret_test-key-0123456789';
const APPLY_ENV = { SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', SUPABASE_SERVICE_ROLE_KEY: APPLY_KEY, GITHUB_SHA: 'deadbeef' };
const noFetch = async () => assert.fail('fetch must not be called');

test('--apply refuses without SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY', async (t) => {
  for (const env of [
    {},
    { SUPABASE_URL: APPLY_ENV.SUPABASE_URL },
    { SUPABASE_SERVICE_ROLE_KEY: APPLY_KEY },
    // The old Management API credentials are no longer accepted.
    { SUPABASE_ACCESS_TOKEN: 'tok', SUPABASE_PROJECT_ID: 'abcdefghijklmnopqrst' },
  ]) {
    const r = await cli(t, ['--apply', '--dir', VALID], { env, fetchImpl: noFetch });
    assert.equal(r.code, 1, JSON.stringify(env));
    assert.match(r.err, /SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/);
    assert.ok(!r.err.includes(APPLY_KEY) && !r.out.includes(APPLY_KEY), 'never prints the key');
  }
  const bad = await cli(t, ['--apply', '--dir', VALID], { env: { ...APPLY_ENV, SUPABASE_URL: 'abcdefghijklmnopqrst' }, fetchImpl: noFetch });
  assert.equal(bad.code, 1);
  assert.match(bad.err, /SUPABASE_URL must be the project URL/);
});

test('--apply posts the bundle to the import_content_bundle RPC with the service key', async (t) => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ inserted: 15, updated: 0, archived: 0, unchanged: 0 }), { status: 200 });
  };
  for (const url of [APPLY_ENV.SUPABASE_URL, `${APPLY_ENV.SUPABASE_URL}/`]) {
    const r = await cli(t, ['--apply', '--dir', VALID], { env: { ...APPLY_ENV, SUPABASE_URL: url }, fetchImpl });
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /Imported \d+ lessons: \{"inserted":15,"updated":0,"archived":0,"unchanged":0\}/);
    assert.ok(!r.out.includes(APPLY_KEY), 'never prints the key');
  }
  assert.equal(calls.length, 2);
  for (const { url } of calls) assert.equal(url, 'https://abcdefghijklmnopqrst.supabase.co/rest/v1/rpc/import_content_bundle');
  const { init } = calls[0];
  assert.equal(init.method, 'POST');
  assert.deepEqual(init.headers, { apikey: APPLY_KEY, Authorization: `Bearer ${APPLY_KEY}`, 'Content-Type': 'application/json' });
  const body = JSON.parse(init.body);
  assert.deepEqual(Object.keys(body), ['p_bundle']);
  const bundle = bundleSchema.parse(body.p_bundle);
  assert.equal(bundle.git_sha, 'deadbeef');
  assert.ok(bundle.lessons.length > 0);
});

test('--apply surfaces PostgREST errors and rejects unexpected responses', async (t) => {
  const pgError = {
    code: '42501',
    message: 'permission denied for function import_content_bundle',
    details: null,
    hint: null,
  };
  const denied = await cli(t, ['--apply', '--dir', VALID], {
    env: APPLY_ENV,
    fetchImpl: async () => new Response(JSON.stringify(pgError), { status: 403 }),
  });
  assert.equal(denied.code, 1);
  assert.match(denied.err, /HTTP 403 42501 \| permission denied for function import_content_bundle/);

  const raw = await cli(t, ['--apply', '--dir', VALID], { env: APPLY_ENV, fetchImpl: async () => new Response('Bad Gateway', { status: 502 }) });
  assert.equal(raw.code, 1);
  assert.match(raw.err, /HTTP 502 Bad Gateway/);

  const echo = await cli(t, ['--apply', '--dir', VALID], {
    env: APPLY_ENV,
    fetchImpl: async () => new Response(JSON.stringify({ message: `Invalid API key ${APPLY_KEY}` }), { status: 401 }),
  });
  assert.equal(echo.code, 1);
  assert.match(echo.err, /HTTP 401 Invalid API key <redacted>/);
  assert.ok(!echo.err.includes(APPLY_KEY), 'never prints the key');

  const network = await cli(t, ['--apply', '--dir', VALID], {
    env: APPLY_ENV,
    fetchImpl: async () => {
      throw new TypeError('fetch failed');
    },
  });
  assert.equal(network.code, 1);
  assert.match(network.err, /Import failed: fetch failed/);

  const unexpected = await cli(t, ['--apply', '--dir', VALID], {
    env: APPLY_ENV,
    fetchImpl: async () => new Response(JSON.stringify({ inserted: 1 }), { status: 200 }),
  });
  assert.equal(unexpected.code, 1);
  assert.match(unexpected.err, /unexpected response/);
});

test('usage errors exit 2', async (t) => {
  assert.equal((await cli(t, [])).code, 2);
  assert.equal((await cli(t, ['--apply', '--check'])).code, 2);
});

test('--dir and --out without a value exit 2', async (t) => {
  for (const argv of [['--check', '--dir'], ['--dir', '--check'], ['--emit-sql', '--out'], ['--emit-sql', '--out', '--check']]) {
    const r = await cli(t, argv);
    assert.equal(r.code, 2, argv.join(' '));
    assert.match(r.err, /needs a value/);
  }
});

// ---- mcq/listen option order (the authored order must not hint at the answer) ---------------------------

const REAL_CONTENT = join(here, '..', 'content');
const OPTION_TYPES = new Set(['mcq', 'listen']);

function authoredExercises(loaded) {
  return new Map(loaded.files.filter((f) => f.kind === 'lesson').flatMap((f) => f.data.exercises.map((ex) => [ex.key, ex])));
}

test('build shuffles mcq/listen options deterministically by exercise key', () => {
  const loaded = loadContent(REAL_CONTENT, { label: 'content' });
  assert.deepEqual(checkContent(loaded, { grade }), []);
  const first = buildBundle(loaded);
  const second = buildBundle(loadContent(REAL_CONTENT, { label: 'content' }));
  assert.equal(renderSeedSql(first), renderSeedSql(second), 'two builds are identical');

  const authored = authoredExercises(loaded);
  const optionExercises = first.exercises.filter((e) => OPTION_TYPES.has(e.exercise_type));
  assert.ok(optionExercises.length >= 10, 'real content has mcq/listen exercises');

  let reordered = 0;
  const correctSlots = new Set();
  const byId = (list) => [...list].sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const e of optionExercises) {
    const source = authored.get(e.key);
    // Same options (ids, texts, langs); only their order may differ.
    assert.deepEqual(byId(e.prompt.options), byId(source.prompt.options), e.key);
    // Everything else in the prompt is untouched.
    assert.deepEqual({ ...e.prompt, options: null }, { ...source.prompt, options: null }, e.key);
    if (e.prompt.options.some((o, i) => o.id !== source.prompt.options[i].id)) reordered++;
    const slot = e.prompt.options.findIndex((o) => o.id === e.key_data.answer_key.correct_option_id);
    assert.ok(slot >= 0, e.key);
    correctSlots.add(slot === e.prompt.options.length - 1 ? 'last' : slot);
  }
  assert.ok(reordered > 0, 'some options are reordered');
  assert.ok(correctSlots.size > 1, 'the correct option is not always in the same slot');
  assert.ok(correctSlots.has('last'), 'the correct option sometimes sits in the last slot');
});

test('build leaves other exercise types and the loaded content untouched', () => {
  const loaded = loadContent(REAL_CONTENT, { label: 'content' });
  const before = JSON.stringify(loaded.files.map((f) => f.data));
  const bundle = buildBundle(loaded);
  assert.equal(JSON.stringify(loaded.files.map((f) => f.data)), before, 'loaded content is not mutated');
  const authored = authoredExercises(loaded);
  for (const e of bundle.exercises.filter((x) => !OPTION_TYPES.has(x.exercise_type))) {
    assert.deepEqual(e.prompt, authored.get(e.key).prompt, e.key);
  }
});

// ---- diagnostic item bank (spec 4 §3) -------------------------------------------------------------------

const DIAG_SKILLS = { vocabulary: ['voc', 'mcq'], grammar: ['gram', 'cloze_choice'], reading: ['read', 'reading_mcq'] };
const DIAG_LEVELS = { en: ['pre_a1', 'a1', 'a2', 'b1', 'b2', 'c1', 'c2'], ko: ['hangul', 'topik1', 'topik2', 'topik3', 'topik4', 'topik5', 'topik6'] };

/** A complete, valid bank file: `perLevel` items for every level of `lang`. */
function diagYaml(lang, skill, { perLevel = 5 } = {}) {
  const [short, type] = DIAG_SKILLS[skill];
  const lines = ['# DEMO — chưa kiểm duyệt', 'schema_version: 1', 'demo: true', `language: ${lang}`, `skill: ${skill}`, 'items:'];
  for (const level of DIAG_LEVELS[lang]) {
    for (let i = 1; i <= perLevel; i++) {
      const tag = `${skill} ${level} ${i}`;
      lines.push(
        `  - key: ${lang}:diag:${short}-${level.replace('_', '-')}-${i}`,
        `    level: ${level}`,
        `    item_type: ${type}`,
        '    prompt:',
        `      stem: "Câu hỏi ${tag}"`,
        '      stem_lang: vi',
        ...(skill === 'reading' ? [`      passage: "Passage ${tag}."`] : []),
        '      options:',
        ...['a', 'b', 'c', 'd'].map((id) => `        - { id: ${id}, text: "${tag} ${id}", lang: ${lang} }`),
        '    answer: b',
        `    explanation: { vi: "Giải thích ${tag}." }`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

/** Temp content tree: the lesson fixture plus a full diagnostic bank for `langs`. */
function diagTree(t, langs = ['en']) {
  const tree = tempTree(t);
  for (const lang of langs) {
    mkdirSync(join(tree.content, 'diagnostic', lang), { recursive: true });
    for (const skill of Object.keys(DIAG_SKILLS)) writeFileSync(join(tree.content, 'diagnostic', lang, `${skill}.yaml`), diagYaml(lang, skill));
  }
  return tree;
}

const VOCAB_EN = 'diagnostic/en/vocabulary.yaml';
const loadTree = (content) => loadContent(content, { label: 'content' });
const servedPrompt = (item) => diagnosticItemSchema.safeParse({ id: item.id, skill: item.skill, item_type: item.item_type, prompt: item.prompt });

test('diagnostic bank: valid files pass and build one row per item with defaults', (t) => {
  const { content } = diagTree(t, ['en', 'ko']);
  const loaded = loadTree(content);
  assert.deepEqual(checkContent(loaded, { grade }), []);
  const bundle = buildDiagnosticBundle(loaded);
  assert.ok(diagnosticBundleSchema.safeParse(bundle).success);
  assert.equal(bundle.items.length, 210);
  const keys = bundle.items.map((i) => i.key);
  assert.deepEqual(keys, [...keys].sort());
  const item = bundle.items.find((i) => i.key === 'en:diag:voc-pre-a1-1');
  assert.equal(item.id, contentId('en:diag:voc-pre-a1-1'));
  assert.equal(item.language_code, 'en');
  assert.equal(item.skill, 'vocabulary');
  assert.equal(item.item_type, 'mcq');
  assert.equal(item.status, 'published');
  assert.equal(item.is_demo, true);
  assert.equal(item.key_confidence, 'unreviewed');
  assert.deepEqual([item.reviewed_by, item.reviewed_at], [null, null]);
  assert.equal('passage' in item.prompt, false);
  // Default difficulty: level ordinal + 0.5.
  const difficulty = (key) => bundle.items.find((i) => i.key === key).difficulty;
  assert.equal(item.difficulty, 0.5);
  assert.equal(difficulty('en:diag:gram-c2-3'), 6.5);
  assert.equal(difficulty('ko:diag:read-topik3-2'), 3.5);
  assert.equal(bundle.items.find((i) => i.key === 'ko:diag:read-hangul-1').prompt.passage, 'Passage reading hangul 1.');
});

test('diagnostic bank: served options are shuffled and opaquely re-labelled', (t) => {
  const { content } = diagTree(t, ['en']);
  const bundle = buildDiagnosticBundle(loadTree(content));
  assert.equal(canonicalJson(buildDiagnosticBundle(loadTree(content))), canonicalJson(bundle), 'deterministic');
  const slots = new Set();
  for (const item of bundle.items) {
    const ids = item.prompt.options.map((o) => o.id);
    assert.ok(ids.includes(item.answer_key), item.key);
    for (const id of ids) assert.match(id, /^o[0-9a-f]{8}$/);
    // The correct option is the authored "b" one.
    assert.match(item.prompt.options.find((o) => o.id === item.answer_key).text, / b$/);
    slots.add(ids.indexOf(item.answer_key));
    // The public prompt is exactly what the RPCs serve, and carries no answer.
    assert.ok(servedPrompt(item).success, item.key);
    assert.equal('answer' in item.prompt || 'answer_key' in item.prompt, false);
  }
  assert.equal(slots.size, 4, 'the correct option lands in every slot');
});

test('diagnostic bank: content_hash follows the edited item only', (t) => {
  const { content } = diagTree(t, ['en']);
  const before = buildDiagnosticBundle(loadTree(content));
  edit(content, VOCAB_EN, 'Giải thích vocabulary a1 2.', 'Giải thích khác.');
  const after = buildDiagnosticBundle(loadTree(content));
  const changed = after.items.filter((it, i) => it.content_hash !== before.items[i].content_hash).map((i) => i.key);
  assert.deepEqual(changed, ['en:diag:voc-a1-2']);
});

const DIAG_INVALID = [
  { name: 'answer not an option', from: 'answer: b', to: 'answer: z', message: 'answer "z" is not an option id' },
  { name: 'duplicate stem', from: 'stem: "Câu hỏi vocabulary a1 2"', to: 'stem: "câu hỏi  vocabulary a1 1"', message: 'duplicate stem' },
  { name: 'missing demo header', from: '# DEMO — chưa kiểm duyệt\n', to: '', message: 'demo file must start with' },
  { name: 'level of another language', from: 'level: a2', to: 'level: topik2', message: 'level "topik2" is not a en level' },
  { name: 'too few items in a cell', from: 'level: b1', to: 'level: b2', message: 'vocabulary b1 has 4 item(s), needs at least 5' },
  { name: 'duplicate key', from: 'key: en:diag:voc-c1-2', to: 'key: en:diag:voc-c1-1', message: 'duplicate key "en:diag:voc-c1-1"' },
  { name: 'key of another language', from: 'key: en:diag:voc-c1-2', to: 'key: ko:diag:voc-c1-2', message: 'must start with "en:"' },
  { name: 'non-NFC text', from: 'Giải thích vocabulary a1 3.', to: 'Giaỉ thích vocabulary a1 3.', message: 'text is not NFC-normalized' },
  { name: 'passage outside reading', from: '      stem_lang: vi\n', to: '      stem_lang: vi\n      passage: "x"\n', message: 'prompt.passage is only for reading_mcq' },
  { name: 'reading type outside reading', from: 'item_type: mcq', to: 'item_type: reading_mcq', message: 'item_type reading_mcq is not allowed for vocabulary' },
  { name: 'language does not match folder', from: 'language: en', to: 'language: ko', message: 'does not match folder' },
  { name: 'duplicate option text', from: 'text: "vocabulary pre_a1 1 b"', to: 'text: "Vocabulary pre_a1 1 a"', message: 'duplicate option text' },
  { name: 'demo with reviewed key', from: 'demo: true', to: 'demo: true\nkey_confidence: reviewed', message: 'requires key_confidence unreviewed' },
  { name: 'non-demo without review', from: 'demo: true', to: 'demo: false', message: 'demo: false requires reviewed_at and reviewed_by' },
  { name: 'difficulty outside the level band', from: '    level: c2\n', to: '    level: c2\n    difficulty: 2\n', message: 'difficulty 2 is outside the c2 band 6–7' },
  { name: 'unknown field', from: 'answer: b', to: 'answer: b\n    answer_key: b', message: 'answer_key' },
];

for (const c of DIAG_INVALID) {
  test(`--check rejects diagnostic: ${c.name}`, (t) => {
    const { content } = diagTree(t, ['en']);
    edit(content, VOCAB_EN, c.from, c.to);
    const errors = checkContent(loadTree(content), { grade });
    assert.ok(errors.some((e) => e.includes(c.message)), `expected ${JSON.stringify(c.message)}, got:\n${errors.join('\n')}`);
    for (const e of errors) assert.match(e, /^content\/\S+: /);
  });
}

test('diagnostic bank: reading needs a passage, files are named by skill, layout is enforced', (t) => {
  const { content } = diagTree(t, ['en']);
  edit(content, 'diagnostic/en/reading.yaml', '      passage: "Passage reading a1 1."\n', '');
  renameSync(join(content, 'diagnostic', 'en', 'grammar.yaml'), join(content, 'diagnostic', 'en', 'grammar-2.yaml'));
  writeFileSync(join(content, 'diagnostic', 'nested.yaml'), diagYaml('en', 'vocabulary'));
  const errors = checkContent(loadTree(content), { grade }).join('\n');
  assert.match(errors, /reading_mcq needs prompt\.passage/);
  assert.match(errors, /grammar-2\.yaml: file name must be grammar\.yaml/);
  assert.match(errors, /diagnostic\/nested\.yaml: unexpected file location/);
});

test('diagnostic bank: every skill × level of a language with a bank is required (minimum is configurable)', (t) => {
  const { content } = diagTree(t, ['en']);
  rmSync(join(content, 'diagnostic', 'en', 'reading.yaml'));
  const errors = checkContent(loadTree(content), { grade });
  assert.ok(errors.includes('content/diagnostic/en/reading.yaml: reading pre_a1 has 0 item(s), needs at least 5'), errors.join('\n'));
  assert.equal(errors.length, 7);
  writeFileSync(join(content, 'diagnostic', 'en', 'reading.yaml'), diagYaml('en', 'reading', { perLevel: 2 }));
  assert.equal(checkContent(loadTree(content), { grade }).length, 7);
  assert.deepEqual(checkContent(loadTree(content), { grade, diagnosticMinPerCell: 2 }), []);
});

test('--emit-sql appends the diagnostic import after the lesson import', async (t) => {
  const { dir, content } = diagTree(t, ['en', 'ko']);
  const r = await cli(t, ['--emit-sql', '--dir', 'content', '--out', 'seed.sql'], { cwd: dir });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /210 diagnostic items/);
  const sql = readFileSync(join(dir, 'seed.sql'), 'utf8');
  const lessonAt = sql.indexOf('select content_private.import_bundle($bundle$');
  const diagAt = sql.indexOf('select content_private.import_diagnostic_bundle($diagnostic${\n  "bundle_version": 1,');
  assert.ok(lessonAt > 0 && diagAt > lessonAt, 'diagnostic statement follows the lesson import');
  assert.ok(sql.endsWith('$diagnostic$::jsonb);\n'));
  assert.ok(sql.slice(diagAt).includes('"git_sha": null'));
  const loaded = loadTree(content);
  assert.equal(sql, renderSeedSql(buildBundle(loaded), renderDiagnosticSql(buildDiagnosticBundle(loaded))));
  const check = ['--emit-sql', '--check', '--dir', 'content', '--out', 'seed.sql'];
  assert.equal((await cli(t, check, { cwd: dir })).code, 0);
  edit(content, VOCAB_EN, 'Giải thích vocabulary a1 2.', 'Giải thích mới.');
  const stale = await cli(t, check, { cwd: dir });
  assert.equal(stale.code, 1);
  assert.match(stale.err, /out of date/);
});

test('--apply imports lessons then the diagnostic bank, and fails when the bank import fails', async (t) => {
  const { dir } = diagTree(t, ['en']);
  const calls = [];
  const ok = { inserted: 1, updated: 0, archived: 0, unchanged: 0 };
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify(ok), { status: 200 });
  };
  const r = await cli(t, ['--apply', '--dir', join(dir, 'content')], { env: APPLY_ENV, fetchImpl });
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(
    calls.map((c) => c.url),
    [
      'https://abcdefghijklmnopqrst.supabase.co/rest/v1/rpc/import_content_bundle',
      'https://abcdefghijklmnopqrst.supabase.co/rest/v1/rpc/import_diagnostic_content_bundle',
    ],
  );
  const bank = diagnosticBundleSchema.parse(calls[1].body.p_bundle);
  assert.equal(bank.items.length, 105);
  assert.equal(bank.git_sha, 'deadbeef');
  assert.match(r.out, /Imported 105 diagnostic items: \{"inserted":1/);

  let n = 0;
  const failSecond = async () =>
    ++n === 1
      ? new Response(JSON.stringify(ok), { status: 200 })
      : new Response(JSON.stringify({ code: '42501', message: 'permission denied for function import_diagnostic_content_bundle' }), { status: 403 });
  const denied = await cli(t, ['--apply', '--dir', join(dir, 'content')], { env: APPLY_ENV, fetchImpl: failSecond });
  assert.equal(denied.code, 1);
  assert.match(denied.err, /HTTP 403 42501 \| permission denied for function import_diagnostic_content_bundle/);
});

test('real diagnostic bank: ≥ 5 items per skill × level for both languages, 4 options, valid served prompts', () => {
  const loaded = loadContent(REAL_CONTENT, { label: 'content' });
  assert.deepEqual(checkContent(loaded, { grade }), []);
  const bundle = buildDiagnosticBundle(loaded);
  for (const lang of ['en', 'ko']) {
    const items = bundle.items.filter((i) => i.language_code === lang);
    assert.ok(items.length >= 105, `${lang}: ${items.length} items`);
    for (const skill of Object.keys(DIAG_SKILLS)) {
      for (const level of DIAG_LEVELS[lang]) {
        assert.ok(items.filter((i) => i.skill === skill && i.level_code === level).length >= 5, `${lang} ${skill} ${level}`);
      }
    }
  }
  for (const item of bundle.items) {
    assert.equal(item.prompt.options.length, 4, item.key);
    assert.ok(item.prompt.options.some((o) => o.id === item.answer_key), item.key);
    assert.ok(servedPrompt(item).success, item.key);
  }
});

// ---- exam practice forms (spec 9 §2) ---------------------------------------------------------------------

const EXAM_FILE = 'exams/ko/mock.yaml';

/** A small valid TOPIK II form: listening + reading mcq, one short_text and one essay. */
const EXAM_YAML = `# DEMO — chưa kiểm duyệt
schema_version: 1
demo: true
language: ko
form:
  key: ko:exam:mock
  family: topik_ii
  title_vi: Đề thử
  description_vi: Đề thử cho kiểm thử.
  level_from: topik3
  level_to: topik6
  source_key: src:fixture
  time_limits: { listening: 20, reading: 25, writing: 20 }
  scoring:
    verified: false
    source_note_vi: Chưa đối chiếu.
    section_max: { listening: 100, reading: 100, writing: 100 }
    bands:
      - { level_code: topik3, min_total: 120 }
      - { level_code: topik4, min_total: 150 }
    pass_ratio: null
questions:
  - key: ko:examq:mock-l01
    section: listening
    kind: mcq
    question_type: topik_ii_listen_detail
    level_code: topik3
    points: 2
    prompt:
      instruction_vi: Nghe và chọn.
      stem: 들은 내용과 같은 것을 고르십시오.
      stem_lang: ko
      audio_asset_id: null
      script: "남자: 안녕하세요."
      options:
        - { id: a, text: "가", lang: ko }
        - { id: b, text: "나", lang: ko }
        - { id: c, text: "다", lang: ko }
        - { id: d, text: "라", lang: ko }
    answer: b
    explanation: { vi: "Giải thích nghe." }
  - key: ko:examq:mock-r01
    section: reading
    kind: mcq
    question_type: topik_ii_read_blank
    level_code: topik4
    points: 2
    prompt:
      instruction_vi: Đọc và chọn.
      stem: 빈칸에 알맞은 것을 고르십시오.
      stem_lang: ko
      passage: "비가 ( ) 갑니다."
      options:
        - { id: a, text: "오더라도", lang: ko }
        - { id: b, text: "와서", lang: ko }
    answer: a
    explanation: { vi: "Giải thích đọc." }
  - key: ko:examq:mock-w01
    section: writing
    kind: short_text
    question_type: topik_ii_write_51
    level_code: topik3
    points: 10
    prompt:
      instruction_vi: Viết vào chỗ trống.
      stem: ㉠에 들어갈 말을 쓰십시오.
      stem_lang: ko
      passage: "노트북을 ( ㉠ )."
    answer: [두고 왔습니다, 놓고 왔습니다]
    explanation: { vi: "Giải thích viết." }
  - key: ko:examq:mock-w02
    section: writing
    kind: essay
    question_type: topik_ii_write_53
    level_code: topik4
    points: 30
    prompt:
      instruction_vi: Viết đoạn văn.
      stem: 200~300자로 쓰십시오.
      stem_lang: ko
      min_chars: 200
      max_chars: 300
    rubric:
      - { key: content, label_vi: Nội dung, description_vi: Đủ ý., max_points: 7 }
      - { key: language, label_vi: Ngôn ngữ, description_vi: Đúng ngữ pháp., max_points: 16 }
    sample_answer: "예시 답안입니다."
    explanation: { vi: "Giải thích bài luận." }
`;

/** Temp content tree: the lesson fixture plus one exam form. */
function examTree(t, yaml = EXAM_YAML) {
  const tree = tempTree(t);
  mkdirSync(join(tree.content, 'exams', 'ko'), { recursive: true });
  writeFileSync(join(tree.content, EXAM_FILE), yaml);
  return tree;
}

test('exam forms: a valid form passes and builds a bundle with public prompts and private keys', (t) => {
  const { content } = examTree(t);
  const loaded = loadTree(content);
  assert.deepEqual(checkContent(loaded, { grade }), []);
  const bundle = buildExamBundle(loaded);
  assert.ok(examBundleSchema.safeParse(bundle).success);
  assert.equal(canonicalJson(buildExamBundle(loadTree(content))), canonicalJson(bundle), 'deterministic');
  assert.equal(bundle.bundle_version, 1);
  const [form] = bundle.forms;
  assert.equal(form.id, contentId('ko:exam:mock'));
  assert.equal(form.language_code, 'ko');
  assert.equal(form.source_key, 'src:fixture');
  assert.equal(form.is_demo, true);
  assert.deepEqual([form.reviewed_by, form.reviewed_at], [null, null]);
  assert.deepEqual(
    form.questions.map((q) => [q.seq, q.section, q.kind]),
    [
      [1, 'listening', 'mcq'],
      [2, 'reading', 'mcq'],
      [3, 'writing', 'short_text'],
      [4, 'writing', 'essay'],
    ],
  );
  const [listen, read, short, essay] = form.questions;
  assert.equal(listen.id, contentId('ko:examq:mock-l01'));
  // Listening: the script is private; the public prompt keeps audio_asset_id null.
  assert.equal(listen.script, '남자: 안녕하세요.');
  assert.equal('script' in listen.prompt, false);
  assert.equal(listen.prompt.audio_asset_id, null);
  // mcq options are shuffled and opaquely re-labelled (diagnostic precedent); the answer follows.
  for (const q of [listen, read]) {
    for (const o of q.prompt.options) assert.match(o.id, /^o[0-9a-f]{8}$/);
    assert.ok(q.prompt.options.some((o) => o.id === q.answer), q.key);
    assert.equal(gradeExamAnswer('mcq', q.answer, q.answer), true);
  }
  assert.equal(listen.prompt.options.find((o) => o.id === listen.answer).text, '나');
  assert.equal(read.prompt.options.find((o) => o.id === read.answer).text, '오더라도');
  assert.deepEqual(short.answer, ['두고 왔습니다', '놓고 왔습니다']);
  assert.equal('options' in short.prompt, false);
  assert.equal(essay.answer, null);
  assert.equal(essay.rubric.length, 2);
  assert.equal(essay.sample_answer, '예시 답안입니다.');
  assert.deepEqual([essay.prompt.min_chars, essay.prompt.max_chars], [200, 300]);
  for (const q of form.questions) {
    assert.deepEqual([q.script === null, q.rubric === null], [q.section !== 'listening', q.kind !== 'essay'], q.key);
    // The public prompt fits what the RPCs serve (examServedQuestionSchema; tts_text is added server-side).
    const served = { question_id: q.id, seq: q.seq, section: q.section, kind: q.kind, question_type: q.question_type, points: q.points, prompt: q.prompt, answer: null, flagged: false };
    assert.ok(examServedQuestionSchema.safeParse(served).success, q.key);
  }
});

test('exam forms: editing a question changes its hash and the form hash only', (t) => {
  const { content } = examTree(t);
  const before = buildExamBundle(loadTree(content)).forms[0];
  edit(content, EXAM_FILE, 'Giải thích đọc.', 'Giải thích khác.');
  const after = buildExamBundle(loadTree(content)).forms[0];
  assert.notEqual(after.content_hash, before.content_hash);
  const changed = after.questions.filter((q, i) => q.content_hash !== before.questions[i].content_hash).map((q) => q.key);
  assert.deepEqual(changed, ['ko:examq:mock-r01']);
});

const RUBRIC = '    rubric:\n      - { key: content, label_vi: Nội dung, description_vi: Đủ ý., max_points: 7 }\n      - { key: language, label_vi: Ngôn ngữ, description_vi: Đúng ngữ pháp., max_points: 16 }\n';
const BANDS = '    bands:\n      - { level_code: topik3, min_total: 120 }\n      - { level_code: topik4, min_total: 150 }\n';
const ACCEPTED = 'answer: [두고 왔습니다, 놓고 왔습니다]';

const EXAM_INVALID = [
  { name: 'mcq answer not an option', from: 'answer: b', to: 'answer: z', message: 'answer "z" is not an option id' },
  { name: 'mcq answer is a list', from: 'answer: b', to: 'answer: [b]', message: 'mcq answer must be the id of one option' },
  { name: 'mcq without options', from: '      options:\n        - { id: a, text: "오더라도", lang: ko }\n        - { id: b, text: "와서", lang: ko }\n', to: '', message: 'mcq needs prompt.options' },
  { name: 'duplicate option text', from: 'text: "다"', to: 'text: "가"', message: 'duplicate option text' },
  { name: 'mcq in writing', from: '    section: writing\n    kind: short_text', to: '    section: writing\n    kind: mcq', message: 'writing questions are short_text or essay' },
  { name: 'short_text outside writing', from: '    section: writing\n    kind: short_text', to: '    section: reading\n    kind: short_text', message: 'short_text belongs to the writing section' },
  { name: 'short_text answer is an option id', from: ACCEPTED, to: 'answer: a', message: 'short_text answer must be a list of accepted answers' },
  { name: 'short_text answers equal after normalisation', from: ACCEPTED, to: 'answer: [두고 왔습니다, "두고  왔습니다."]', message: 'are the same after normalisation' },
  { name: 'short_text answer empty after normalisation', from: ACCEPTED, to: 'answer: [두고 왔습니다, "..."]', message: 'is empty after normalisation' },
  { name: 'short_text without answer', from: `    ${ACCEPTED}\n`, to: '', message: 'short_text needs an answer' },
  { name: 'essay with an answer', from: '    sample_answer: "예시 답안입니다."\n', to: '    sample_answer: "예시 답안입니다."\n    answer: [x]\n', message: 'essay has no answer' },
  { name: 'essay without rubric', from: RUBRIC, to: '', message: 'essay needs a rubric' },
  { name: 'essay min_chars above max_chars', from: 'min_chars: 200', to: 'min_chars: 400', message: 'min_chars 400 is above max_chars 300' },
  { name: 'rubric outside essay', from: '    explanation: { vi: "Giải thích viết." }\n', to: '    explanation: { vi: "Giải thích viết." }\n    rubric: [{ key: content, label_vi: x, description_vi: y, max_points: 1 }]\n', message: 'rubric is only for essay' },
  { name: 'listening without script or audio', from: '      script: "남자: 안녕하세요."\n', to: '', message: 'listening needs prompt.script or prompt.audio_asset_id' },
  { name: 'script outside listening', from: '      passage: "비가 ( ) 갑니다."\n', to: '      passage: "비가 ( ) 갑니다."\n      script: "x"\n', message: 'prompt.script and prompt.audio_asset_id are only for listening' },
  { name: 'missing time limit', from: 'time_limits: { listening: 20, reading: 25, writing: 20 }', to: 'time_limits: { listening: 20, reading: 25 }', message: 'time_limits.writing is missing' },
  { name: 'time limit for an empty section', from: '  - key: ko:examq:mock-l01\n    section: listening', to: '  - key: ko:examq:mock-l01\n    section: reading', message: 'time_limits.listening is set but the section has no questions' },
  { name: 'level of another language', from: 'level_code: topik4\n    points: 2', to: 'level_code: b1\n    points: 2', message: 'level_code "b1" is not a ko level' },
  { name: 'level outside the form range', from: 'level_code: topik4\n    points: 2', to: 'level_code: topik2\n    points: 2', message: 'outside the form range topik3–topik6' },
  { name: 'missing demo header', from: '# DEMO — chưa kiểm duyệt\n', to: '', message: 'demo file must start with' },
  { name: 'demo scale marked verified', from: 'verified: false', to: 'verified: true', message: 'demo: true requires scoring.verified false' },
  { name: 'demo with review', from: 'demo: true', to: 'demo: true\nreviewed_by: someone', message: 'demo: true but reviewed_at/reviewed_by is set' },
  { name: 'non-demo without review', from: 'demo: true', to: 'demo: false', message: 'demo: false requires reviewed_at and reviewed_by' },
  { name: 'language does not match folder', from: 'language: ko', to: 'language: en', message: 'does not match folder' },
  { name: 'family of another language', from: 'family: topik_ii', to: 'family: cefr', message: 'family cefr is a en exam, not ko' },
  { name: 'unknown source', from: 'source_key: src:fixture', to: 'source_key: src:nope', message: 'unknown source "src:nope"' },
  { name: 'bands not ascending', from: 'min_total: 150', to: 'min_total: 100', message: 'scoring.bands must be ascending' },
  { name: 'band above the maximum total', from: 'min_total: 150', to: 'min_total: 400', message: 'is above the section_max total 300' },
  { name: 'topik without bands', from: BANDS, to: '    bands: []\n', message: 'topik_ii forms need scoring.bands' },
  { name: 'topik with pass_ratio', from: 'pass_ratio: null', to: 'pass_ratio: 0.6', message: 'topik_ii forms have pass_ratio null' },
  { name: 'missing section_max', from: 'section_max: { listening: 100, reading: 100, writing: 100 }', to: 'section_max: { listening: 100, reading: 100 }', message: 'scoring.section_max.writing is missing' },
  { name: 'question_type of another family', from: 'question_type: topik_ii_read_blank', to: 'question_type: topik_i_read_blank', message: 'question_type must start with "topik_ii_"' },
  { name: 'question_type reused in another section', from: 'question_type: topik_ii_read_blank', to: 'question_type: topik_ii_listen_detail', message: 'one section and kind per type' },
  { name: 'duplicate question key', from: 'key: ko:examq:mock-r01', to: 'key: ko:examq:mock-l01', message: 'duplicate key "ko:examq:mock-l01"' },
  { name: 'key of another language', from: 'key: ko:examq:mock-r01', to: 'key: en:examq:mock-r01', message: 'must start with "ko:"' },
  { name: 'non-NFC text', from: 'Giải thích viết.', to: 'Giải thích viết.', message: 'text is not NFC-normalized' },
  { name: 'unknown field', from: 'answer: b', to: 'answer: b\n    answer_key: b', message: 'answer_key' },
];

for (const c of EXAM_INVALID) {
  test(`--check rejects exam: ${c.name}`, (t) => {
    const { content } = examTree(t);
    edit(content, EXAM_FILE, c.from, c.to);
    const errors = checkContent(loadTree(content), { grade });
    assert.ok(errors.some((e) => e.includes(c.message)), `expected ${JSON.stringify(c.message)}, got:\n${errors.join('\n')}`);
    for (const e of errors) assert.match(e, /^content\/\S+: /);
  });
}

test('exam forms: section order, contiguity, form level range and layout are enforced', (t) => {
  const { content } = examTree(t);
  edit(content, EXAM_FILE, '  - key: ko:examq:mock-l01\n    section: listening', '  - key: ko:examq:mock-l01\n    section: reading');
  edit(content, EXAM_FILE, '  - key: ko:examq:mock-r01\n    section: reading', '  - key: ko:examq:mock-r01\n    section: listening');
  edit(content, EXAM_FILE, 'level_from: topik3', 'level_from: topik5');
  edit(content, EXAM_FILE, 'level_to: topik6', 'level_to: topik4');
  writeFileSync(join(content, 'exams', 'nested.yaml'), EXAM_YAML);
  const errors = checkContent(loadTree(content), { grade }).join('\n');
  assert.match(errors, /sections must follow the order listening → reading → writing \(got reading → listening → writing\)/);
  assert.match(errors, /level_from "topik5" is above level_to "topik4"/);
  assert.match(errors, /exams\/nested\.yaml: unexpected file location/);

  const split = examTree(t);
  edit(split.content, EXAM_FILE, '  - key: ko:examq:mock-w02\n    section: writing', '  - key: ko:examq:mock-w02\n    section: listening');
  assert.match(checkContent(loadTree(split.content), { grade }).join('\n'), /questions of a section must be contiguous \(order: listening → reading → writing → listening\)/);
});

test('exam forms: cefr forms need pass_ratio and no bands', (t) => {
  const cefr = EXAM_YAML.replace('language: ko', 'language: en')
    .replace('key: ko:exam:mock', 'key: en:exam:mock')
    .replaceAll('key: ko:examq:', 'key: en:examq:')
    .replace('family: topik_ii', 'family: cefr')
    .replace('level_from: topik3', 'level_from: a1')
    .replace('level_to: topik6', 'level_to: b1')
    .replace(BANDS, '    bands: []\n')
    .replaceAll(/level_code: topik\d/g, 'level_code: a2')
    .replaceAll('topik_ii_', 'cefr_')
    .replace('pass_ratio: null', 'pass_ratio: 0.6')
    .replace('section_max: { listening: 100, reading: 100, writing: 100 }', 'section_max: {}');
  const tree = tempTree(t);
  mkdirSync(join(tree.content, 'exams', 'en'), { recursive: true });
  const file = join(tree.content, 'exams', 'en', 'mock.yaml');
  writeFileSync(file, cefr);
  assert.deepEqual(checkContent(loadTree(tree.content), { grade }), []);
  writeFileSync(file, cefr.replace('pass_ratio: 0.6', 'pass_ratio: null').replace('    bands: []\n', '    bands: [{ level_code: a2, min_total: 10 }]\n'));
  const errors = checkContent(loadTree(tree.content), { grade }).join('\n');
  assert.match(errors, /cefr forms have no score bands/);
  assert.match(errors, /cefr forms need scoring\.pass_ratio/);
});

test('--emit-sql appends the exam import after the diagnostic import', async (t) => {
  const { dir, content } = diagTree(t, ['en']);
  mkdirSync(join(content, 'exams', 'ko'), { recursive: true });
  writeFileSync(join(content, EXAM_FILE), EXAM_YAML);
  const r = await cli(t, ['--emit-sql', '--dir', 'content', '--out', 'seed.sql'], { cwd: dir });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /1 exam forms \(4 questions\)/);
  const sql = readFileSync(join(dir, 'seed.sql'), 'utf8');
  const diagAt = sql.indexOf('select content_private.import_diagnostic_bundle($diagnostic$');
  const examAt = sql.indexOf('select public.import_exam_content_bundle($exam${\n  "bundle_version": 1,');
  assert.ok(diagAt > 0 && examAt > diagAt, 'exam statement follows the diagnostic import');
  assert.ok(sql.endsWith('$exam$::jsonb);\n'));
  const loaded = loadTree(content);
  assert.equal(sql, renderSeedSql(buildBundle(loaded), renderDiagnosticSql(buildDiagnosticBundle(loaded)), renderExamSql(buildExamBundle(loaded))));
  const check = ['--emit-sql', '--check', '--dir', 'content', '--out', 'seed.sql'];
  assert.equal((await cli(t, check, { cwd: dir })).code, 0);
  edit(content, EXAM_FILE, 'Giải thích đọc.', 'Giải thích mới.');
  const stale = await cli(t, check, { cwd: dir });
  assert.equal(stale.code, 1);
  assert.match(stale.err, /out of date/);
});

test('--emit-sql without diagnostic files still appends the exam import', async (t) => {
  const { dir } = examTree(t);
  const r = await cli(t, ['--emit-sql', '--dir', 'content', '--out', 'seed.sql'], { cwd: dir });
  assert.equal(r.code, 0, r.err);
  const sql = readFileSync(join(dir, 'seed.sql'), 'utf8');
  assert.equal(sql.includes('import_diagnostic_bundle'), false);
  assert.ok(sql.indexOf('public.import_exam_content_bundle(') > sql.indexOf('content_private.import_bundle('));
});

test('--apply imports lessons, the diagnostic bank, then exam forms, and fails when the exam import fails', async (t) => {
  const { dir, content } = diagTree(t, ['en']);
  mkdirSync(join(content, 'exams', 'ko'), { recursive: true });
  writeFileSync(join(content, EXAM_FILE), EXAM_YAML);
  const calls = [];
  const ok = { inserted: 1, updated: 0, archived: 0, unchanged: 0 };
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify(ok), { status: 200 });
  };
  const r = await cli(t, ['--apply', '--dir', join(dir, 'content')], { env: APPLY_ENV, fetchImpl });
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(
    calls.map((c) => c.url.split('/rpc/')[1]),
    ['import_content_bundle', 'import_diagnostic_content_bundle', 'import_exam_content_bundle'],
  );
  const exams = examBundleSchema.parse(calls[2].body.p_bundle);
  assert.equal(exams.forms[0].questions.length, 4);
  assert.match(r.out, /Imported 1 exam forms \(4 questions\): \{"inserted":1/);

  let n = 0;
  const failThird = async () =>
    ++n < 3
      ? new Response(JSON.stringify(ok), { status: 200 })
      : new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.import_exam_content_bundle' }), { status: 404 });
  const missing = await cli(t, ['--apply', '--dir', join(dir, 'content')], { env: APPLY_ENV, fetchImpl: failThird });
  assert.equal(missing.code, 1);
  assert.match(missing.err, /HTTP 404 PGRST202 \| Could not find the function public\.import_exam_content_bundle/);
});

test('real exam forms: sizes, sections, time limits, scoring and question types per spec 9 §2', () => {
  const loaded = loadContent(REAL_CONTENT, { label: 'content' });
  assert.deepEqual(checkContent(loaded, { grade }), []);
  const bundle = buildExamBundle(loaded);
  const byKey = new Map(bundle.forms.map((f) => [f.key, f]));
  const count = (form, section, kind) => form.questions.filter((q) => q.section === section && (!kind || q.kind === kind)).length;
  const expected = {
    'ko:exam:topik-i-mock-1': { listening: 10, reading: 14, time: { listening: 15, reading: 25 } },
    'ko:exam:topik-ii-mock-1': { listening: 8, reading: 10, time: { listening: 20, reading: 25, writing: 20 } },
    'en:exam:cefr-a2-mock-1': { listening: 8, reading: 10, time: { listening: 15, reading: 20, writing: 20 } },
  };
  assert.deepEqual([...byKey.keys()].sort(), Object.keys(expected).sort());
  for (const [key, want] of Object.entries(expected)) {
    const form = byKey.get(key);
    assert.equal(count(form, 'listening', 'mcq'), want.listening, `${key} listening`);
    assert.equal(count(form, 'reading', 'mcq'), want.reading, `${key} reading`);
    assert.deepEqual(form.time_limits, want.time, `${key} time`);
    assert.equal(form.is_demo, true);
    assert.equal(form.scoring.verified, false);
    assert.ok(new Set(form.questions.map((q) => q.question_type)).size >= 4, `${key}: at least 4 question types`);
    for (const q of form.questions.filter((x) => x.section === 'listening')) assert.ok(q.script && q.prompt.audio_asset_id === null, q.key);
  }
  const topik1 = byKey.get('ko:exam:topik-i-mock-1');
  assert.equal(count(topik1, 'writing'), 0);
  assert.deepEqual(topik1.scoring.section_max, { listening: 100, reading: 100 });
  assert.deepEqual(topik1.scoring.bands, [
    { level_code: 'topik1', min_total: 80 },
    { level_code: 'topik2', min_total: 140 },
  ]);
  const topik2 = byKey.get('ko:exam:topik-ii-mock-1');
  assert.equal(count(topik2, 'writing', 'short_text'), 2);
  assert.equal(count(topik2, 'writing', 'essay'), 1);
  assert.deepEqual(topik2.scoring.section_max, { listening: 100, reading: 100, writing: 100 });
  assert.deepEqual(
    topik2.scoring.bands.map((b) => [b.level_code, b.min_total]),
    [
      ['topik3', 120],
      ['topik4', 150],
      ['topik5', 190],
      ['topik6', 230],
    ],
  );
  for (const q of topik2.questions.filter((x) => x.kind === 'short_text')) assert.ok(q.answer.length >= 2, `${q.key}: several accepted answers`);
  const essay53 = topik2.questions.find((q) => q.kind === 'essay');
  assert.ok(essay53.rubric.length >= 3);
  assert.ok(essay53.sample_answer.length >= 200 && essay53.sample_answer.length <= 300, `53 sample answer is ${essay53.sample_answer.length} chars`);
  const cefr = byKey.get('en:exam:cefr-a2-mock-1');
  assert.equal(count(cefr, 'writing', 'essay'), 1);
  assert.deepEqual([cefr.scoring.bands, cefr.scoring.pass_ratio], [[], 0.6]);
  assert.ok(cefr.questions.find((q) => q.kind === 'essay').rubric.length >= 3);
  // Every mcq answer is one of its served options, and the correct option lands in every position.
  const slots = new Set();
  for (const form of bundle.forms) {
    for (const q of form.questions.filter((x) => x.kind === 'mcq')) {
      const i = q.prompt.options.findIndex((o) => o.id === q.answer);
      assert.ok(i >= 0, q.key);
      if (q.prompt.options.length === 4) slots.add(i);
    }
  }
  assert.equal(slots.size, 4, 'correct options are spread over every position');
});
