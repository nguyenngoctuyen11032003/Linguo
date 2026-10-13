// Run with: node --import tsx --test scripts/content-import.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
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

test('--dir and --out without a value exit 2', async (t) => {
  for (const argv of [['--check', '--dir'], ['--dir', '--check'], ['--emit-sql', '--out'], ['--emit-sql', '--out', '--check']]) {
    const r = await cli(t, argv);
    assert.equal(r.code, 2, argv.join(' '));
    assert.match(r.err, /needs a value/);
  }
});
