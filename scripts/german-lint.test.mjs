// Run with: node --test scripts/german-lint.test.mjs   (no tsx needed: the lint does not import the shared TS package)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLexicon, digraphVariant, formatIssue, lintGerman, main, parseNoun, pluralForm, readWordlists, tokenize, writeLexicon } from './content/german-lint.mjs';
import { createSpeller, fixDictionary, foldDigraphs, restoreDigraphs } from './content/german-spell.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, '__fixtures__', 'content-valid-de');
const speller = await createSpeller({ words: [] });

/** Temp content tree; `files` maps content-relative paths to text. `base: true` starts from the valid fixture. */
function tree(t, files = {}, { base = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'linguo-german-lint-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const content = join(dir, 'content');
  mkdirSync(content, { recursive: true });
  if (base) cpSync(FIXTURE, content, { recursive: true });
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(content, path, '..'), { recursive: true });
    writeFileSync(join(content, path), text);
  }
  return content;
}

const lint = (content, opts = {}) => lintGerman({ contentDir: content, speller, ...opts });
const messages = (list) => list.map(formatIssue);
const has = (list, part) => list.some((m) => formatIssue(m).includes(part));

/** An items file with the given [key, type, text, example?] rows. */
function items(rows) {
  const out = ['schema_version: 1', 'demo: true', 'source: src:fixture', 'items:'];
  for (const [key, type, text, example, pos] of rows) {
    out.push(
      `  - key: ${key}`,
      `    type: ${type}`,
      '    level: pre_a1',
      '    difficulty: 1',
      `    front: { text: ${JSON.stringify(text)}${pos ? `, pos: ${pos}` : ''} }`,
      '    back:',
      '      meaning: { vi: nghĩa }',
      ...(example ? ['      examples:', `        - target: ${JSON.stringify(example)}`, '          translation: { vi: dịch }'] : []),
    );
  }
  return `${out.join('\n')}\n`;
}

/** A lesson with one example block and the given exercises (raw YAML list items). */
function lesson(exercises, body = '') {
  return `schema_version: 1
demo: true
key: de:lesson:t
order_index: 0
level: pre_a1
title: { vi: T }
objectives: [{ vi: x }]
estimated_minutes: 5
skills: [vocabulary]
body:
  - type: objective
    text: { vi: x }
${body}exercises:
${exercises}
`;
}
const LESSON = 'de/programs/p/units/01-u/lessons/01-l.yaml';
/** Unique phrase lemmas (the lint rejects two items with the same lemma). */
const NAMES = ['Hallo', 'Danke', 'Bitte', 'Tschüss', 'Servus', 'Achtung', 'Prost', 'Gesundheit', 'Willkommen', 'Vorsicht', 'Glückwunsch', 'Pause', 'Ruhe', 'Feierabend', 'Ende'];

// ---- the fixture and the tokenizer --------------------------------------------------------------------------

test('the valid German fixture has no errors and no warnings', async () => {
  const r = await lint(FIXTURE, { label: 'fixture' });
  assert.deepEqual(messages(r.errors), []);
  assert.deepEqual(messages(r.warnings), []);
  assert.equal(r.files, 2);
});

test('an empty or German-free tree is a no-op (no dictionary needed)', async (t) => {
  const content = tree(t, { 'en/items/x.yaml': 'schema_version: 1\n' });
  const r = await lintGerman({ contentDir: content, speller: null });
  assert.deepEqual([r.errors, r.warnings, r.files], [[], [], 0]);
});

test('tokenize skips placeholders, digits and blanks; hyphens stay inside a token', () => {
  const { tokens } = tokenize('Ich {{b1}} 3 Äpfel, E-Mail A1 ___ geht\'s');
  assert.deepEqual(tokens.filter((x) => !x.skip).map((x) => x.text), ['Ich', 'Äpfel', 'E-Mail', 'geht\'s']);
});

// ---- spelling --------------------------------------------------------------------------------------------------

test('spelling: misspellings are errors with file, path and a suggestion', async (t) => {
  const content = tree(t, { 'de/items/a.yaml': items([['de:item:t', 'phrase', 'Guten Morgen!', 'Der Tisck ist groß.']]) });
  const r = await lint(content);
  assert.equal(r.errors.length, 1);
  assert.match(
    formatIssue(r.errors[0]),
    /^content\/de\/items\/a\.yaml: items\[0\]\.back\.examples\[0\]\.target: "Tisck" is not in the German dictionary \(did you mean: [^)]+\); if it is correct \(name, loan word\) add it to content\/de\/wordlist\/<your-file>\.txt$/,
  );
});

test('spelling: compounds, inflections, umlauts, ß, names and verb forms the plain dictionary misses are fine', async (t) => {
  const text = [
    'Die Straßenbahn fährt jeden Morgen zum Hauptbahnhof.',
    'Ich mache meine Hausaufgaben im Arbeitszimmer.',
    'Schließ bitte das Fenster, es ist kalt.',
    'Wir sind schon aufgestanden und haben gefrühstückt.',
    'Anna und Minh wohnen in Hanoi.',
    'Vergiss nicht, die Tür zuzumachen.',
    'Das Mädchen trinkt gern Mineralwasser und isst Erdbeeren.',
    'Ich dusche, suche meine Schlüssel und glaube, dass sie hier liegen.',
    'Gut, danke. Bitte schön! Tschüss, bis morgen.',
    'Meine Telefonnummer und meine E-Mail-Adresse stehen auf der Rechnung.',
  ];
  const content = tree(t, { 'de/items/a.yaml': items(text.map((s, i) => [`de:item:t${i}`, 'phrase', `${NAMES[i]}!`, s])) });
  const r = await lint(content);
  assert.deepEqual(messages(r.errors), []);
});

test('spelling: lowercase nouns and digraph spellings get their own message', async (t) => {
  const content = tree(t, {
    'de/items/a.yaml': items([
      ['de:item:a', 'phrase', 'Hallo!', 'Ich sehe den tisch.'],
      ['de:item:b', 'phrase', 'Tschüss!', 'Das ist fuer dich.'],
      ['de:item:c', 'phrase', 'Bis bald!', 'Die Strassenbahn kommt.'],
    ]),
  });
  const r = await lint(content);
  assert.ok(has(r.errors, '"tisch" must be capitalised (noun) (use: Tisch)'), messages(r.errors).join('\n'));
  assert.ok(has(r.errors, '"fuer" is a digraph spelling; write the standard spelling with ä/ö/ü/ß (use: für)'));
  assert.ok(has(r.errors, '"Strassenbahn" is a digraph spelling'));
  assert.ok(has(r.errors, 'The grader accepts typed ae/oe/ue/ss on its own'));
});

test('spelling: content/de/wordlist/*.txt and Word/Model entries allow words (comments and blanks ignored)', async (t) => {
  const content = tree(t, {
    'de/items/a.yaml': items([['de:item:a', 'phrase', 'Hallo!', 'Wir essen Zibbele und Quibbel.']]),
    'de/wordlist/a1-food.txt': '# Essen\nZibbele\n\nQuibbel/Tisch  # wie Tisch gebeugt\n',
    'de/wordlist/b.txt': 'Zubbel\n',
  });
  assert.deepEqual(readWordlists(content), ['Zibbele', 'Quibbel/Tisch', 'Zubbel']);
  const withoutList = await lint(content);
  assert.ok(has(withoutList.errors, '"Zibbele"') && has(withoutList.errors, '"Quibbel"'));
  const own = await createSpeller({ words: readWordlists(content) });
  const r = await lintGerman({ contentDir: content, speller: own });
  assert.deepEqual(messages(r.errors), []);
  assert.equal(own.ok('Zubbel'), true);
  assert.equal(own.ok('Zobbel'), false);
});

test('spelling: examples of other languages, common_mistake.wrong and known_wrong are not spell-checked', async (t) => {
  const exercises = `  - key: de:exercise:a
    type: translate
    stage: application
    answer_lang: de
    prompt: { source_text: Tôi ở nhà., source_lang: vi, direction: vi_to_target }
    answer: { accepted: [Ich bin zu Hause.] }
    known_wrong:
      - { answer: Ich bin zu Hauze., feedback_vi: x, error_tag: spelling }
    explanation: { vi: x }
    display_answer: Ich bin zu Hause.`;
  const body = `  - type: example
    target: I am at home.
    target_lang: en
    translation: { vi: x }
  - type: common_mistake
    wrong: Ich bin zu Hauze.
    right: Ich bin zu Hause.
    target_lang: de
    note: { vi: x }
`;
  const content = tree(t, { [LESSON]: lesson(exercises, body) });
  const r = await lint(content);
  assert.deepEqual(messages(r.errors), []);
});

// ---- warnings: capitals and sentence start -------------------------------------------------------------------

test('capital: a capitalised function word mid-sentence and a lowercase sentence start are warnings, not errors', async (t) => {
  const content = tree(t, {
    'de/items/a.yaml': items([
      ['de:item:a', 'phrase', 'Hallo!', 'Ich gehe Heute nach Hause.'],
      ['de:item:b', 'phrase', 'Tschüss!', 'heute gehe ich nach Hause.'],
      ['de:item:c', 'phrase', 'Bis bald!', 'Sie sagt: Ja, das Gute ist hier. Beim Essen ist Zeit.'],
    ]),
  });
  const r = await lint(content);
  assert.deepEqual(messages(r.errors), []);
  assert.ok(has(r.warnings, 'items[0].back.examples[0].target: "Heute" is capitalised mid-sentence; write "heute"'));
  assert.ok(has(r.warnings, 'items[1].back.examples[0].target: sentence starts with a lowercase letter: "heute"'));
  assert.equal(r.warnings.filter((w) => w.path.startsWith('items[2]')).length, 0, 'nominalisations, colons and formal pronouns are fine');
});

// ---- item shape --------------------------------------------------------------------------------------------------

test('noun items: der|die|das Noun + plural spec, (Sg.) or (Pl.)', async (t) => {
  const good = [
    'der Tisch, -e', 'die Frau, -en', 'das Kind, -er', 'der Apfel, ¨-', 'die Mutter, ¨-', 'der Lehrer, -', 'das Auto, -s',
    'die Milch (Sg.)', 'die Eltern (Pl.)', 'der Name, -n', 'die Lehrerin, -nen', 'der Bus, -se', 'der Student, -en / die Studentin, -nen',
    'das Haus, ¨-er', 'der Mann, ¨-er', 'die Stadt, ¨-e',
  ];
  const bad = ['Tisch, -e', 'der Tisch', 'der tisch, -e', 'der Tisch, e', 'der Tisch, -x', 'der Tisch -e', 'ein Tisch, -e', 'die Milch, (Sg.)'];
  const rows = [...good, ...bad].map((text, i) => [`de:item:n${i}`, 'vocab', text, null, 'Nomen']);
  const content = tree(t, { 'de/items/a.yaml': items(rows) });
  const r = await lint(content);
  const shape = r.errors.filter((e) => e.message.startsWith('noun item'));
  assert.deepEqual(
    shape.map((e) => e.path).sort(),
    bad.map((_, i) => `items[${good.length + i}].front.text`).sort(),
  );
  assert.match(shape[0].message, /^noun item ".*" is malformed: expected "der\|die\|das Noun, <plural>"/);
});

test('noun shape also applies to vocab that starts with an article but has no pos, and to pos "danh từ"', async (t) => {
  const content = tree(t, {
    'de/items/a.yaml': items([
      ['de:item:a', 'vocab', 'der Tisch'],
      ['de:item:b', 'vocab', 'Haus', null, '"danh từ"'],
      ['de:item:c', 'phrase', 'Das ist ein Tisch.'],
      ['de:item:d', 'grammar_point', 'der, die, das'],
    ]),
  });
  const r = await lint(content);
  assert.deepEqual(r.errors.filter((e) => e.message.startsWith('noun item')).map((e) => e.path), ['items[0].front.text', 'items[1].front.text']);
});

test('verb items: the infinitive first, with optional forms', async (t) => {
  const good = ['gehen', 'fahren (du fährst)', 'fahren, fährt, fuhr, ist gefahren', 'sich waschen', 'wandern', 'Deutsch lernen', 'tun'];
  const bad = ['fährt', 'Gehen', 'ich gehe', 'fahre'];
  const rows = [...good, ...bad].map((text, i) => [`de:item:v${i}`, 'vocab', text, null, 'Verb']);
  const content = tree(t, { 'de/items/a.yaml': items(rows) });
  const r = await lint(content);
  assert.deepEqual(
    r.errors.filter((e) => e.message.startsWith('verb item')).map((e) => e.path).sort(),
    bad.map((_, i) => `items[${good.length + i}].front.text`).sort(),
  );
});

test('parseNoun and pluralForm', () => {
  assert.deepEqual(parseNoun('der Tisch, -e'), { article: 'der', lemma: 'Tisch', spec: '-e', sg: false, pl: false });
  assert.deepEqual(parseNoun('die Milch (Sg.)'), { article: 'die', lemma: 'Milch', spec: null, sg: true, pl: false });
  assert.equal(parseNoun('Tisch, -e'), null);
  assert.deepEqual(
    [['Tisch', '-e'], ['Apfel', '¨-'], ['Haus', '¨-er'], ['Mutter', '¨-'], ['Name', '-n'], ['Frau', '-en'], ['Lehrer', '-'], ['Auto', '-s'], ['Stadt', '¨-e'], ['Baum', '¨-e'], ['Milch', null]].map(([l, s]) => pluralForm(l, s)),
    ['Tische', 'Äpfel', 'Häuser', 'Mütter', 'Namen', 'Frauen', 'Lehrer', 'Autos', 'Städte', 'Bäume', null],
  );
});

// ---- duplicates --------------------------------------------------------------------------------------------------

test('duplicate lemma across files: same article is an error on both, another article only a homograph warning', async (t) => {
  const content = tree(t, {
    'de/items/a.yaml': items([['de:item:a1-tisch', 'vocab', 'der Tisch, -e', null, 'Nomen'], ['de:item:a1-leiter', 'vocab', 'die Leiter, -n', null, 'Nomen'], ['de:item:a1-geh', 'vocab', 'gehen', null, 'Verb']]),
    'de/items/b.yaml': items([['de:item:b1-tisch', 'vocab', 'der Tisch, ¨-e', null, 'Nomen'], ['de:item:b1-leiter', 'vocab', 'der Leiter, -', null, 'Nomen'], ['de:item:b1-essen', 'vocab', 'das Gehen (Sg.)', null, 'Nomen'], ['de:item:b1-geh', 'vocab', 'gehen (du gehst)', null, 'Verb']]),
  });
  const r = await lint(content);
  const dups = r.errors.filter((e) => e.message.startsWith('duplicate lemma'));
  assert.deepEqual(dups.map((e) => `${e.file} ${e.path}`).sort(), [
    'content/de/items/a.yaml items[0].front.text',
    'content/de/items/a.yaml items[2].front.text',
    'content/de/items/b.yaml items[0].front.text',
    'content/de/items/b.yaml items[3].front.text',
  ]);
  assert.match(dups[0].message, /already defined by de:item:b1-tisch \(content\/de\/items\/b\.yaml\); reuse that item/);
  assert.ok(has(r.warnings, 'homograph? "die Leiter, -n"'));
  assert.ok(has(r.warnings, 'homograph? "der Leiter, -"'));
  // A noun and a verb with the same letters are different words.
  assert.ok(!dups.some((e) => e.message.includes('Gehen')));
});

test('the same item key twice is not a lemma duplicate (the importer reports duplicate keys)', async (t) => {
  const content = tree(t, { 'de/items/a.yaml': items([['de:item:x', 'vocab', 'der Tisch, -e', null, 'Nomen']]), 'de/items/b.yaml': items([['de:item:x', 'vocab', 'der Tisch, -e', null, 'Nomen']]) });
  assert.deepEqual((await lint(content)).errors.filter((e) => e.message.startsWith('duplicate lemma')), []);
});

test('targets limit what is reported but the duplicate index covers the whole de tree', async (t) => {
  const content = tree(t, {
    'de/items/a.yaml': items([['de:item:a-tisch', 'vocab', 'der Tisch, -e', 'Der Tisck steht hier.', 'Nomen']]),
    'de/items/b.yaml': items([['de:item:b-tisch', 'vocab', 'der Tisch, -e', 'Der Tisck steht hier.', 'Nomen']]),
  });
  const r = await lint(content, { targets: [join(content, 'de', 'items', 'b.yaml')] });
  assert.ok(r.errors.length > 0 && r.errors.every((e) => e.file === 'content/de/items/b.yaml'), messages(r.errors).join('\n'));
  assert.ok(has(r.errors, 'duplicate lemma'));
  assert.equal(r.files, 1);
  const dirOnly = await lint(content, { targets: [join(content, 'de')] });
  assert.ok(dirOnly.errors.some((e) => e.file === 'content/de/items/a.yaml'));
});

// ---- lexicon + articles -------------------------------------------------------------------------------------------

const NOUNS = items([
  ['de:item:tisch', 'vocab', 'der Tisch, -e', null, 'Nomen'],
  ['de:item:frau', 'vocab', 'die Frau, -en', null, 'Nomen'],
  ['de:item:kind', 'vocab', 'das Kind, -er', null, 'Nomen'],
  ['de:item:lehrer', 'vocab', 'der Lehrer, -', null, 'Nomen'],
  ['de:item:milch', 'vocab', 'die Milch (Sg.)', null, 'Nomen'],
]);

test('lexicon: lemma → article + plural, deterministic', () => {
  const lex = buildLexicon([{ doc: { items: [{ key: 'de:item:tisch', type: 'vocab', front: { text: 'der Tisch, -e', pos: 'Nomen' } }, { key: 'de:item:x', type: 'vocab', front: { text: 'gehen', pos: 'Verb' } }, { key: 'de:item:m', type: 'vocab', front: { text: 'die Milch (Sg.)' } }] } }]);
  assert.deepEqual(lex, {
    version: 1,
    nouns: {
      Milch: [{ article: 'die', plural: '(Sg.)', pluralForm: null, item: 'de:item:m' }],
      Tisch: [{ article: 'der', plural: '-e', pluralForm: 'Tische', item: 'de:item:tisch' }],
    },
  });
});

test('--write-lexicon writes content/de/lexicon.json from the noun items (and the lint reads it back)', async (t) => {
  const content = tree(t, { 'de/items/a.yaml': NOUNS });
  const out = [];
  assert.equal(await main(['--content', content, '--write-lexicon'], { cwd: dirname(content), log: (m) => out.push(m) }), 0);
  assert.match(out[0], /^Wrote content\/de\/lexicon\.json \(5 nouns\)\.$/);
  const file = join(content, 'de', 'lexicon.json');
  const first = readFileSync(file, 'utf8');
  assert.deepEqual(Object.keys(JSON.parse(first).nouns), ['Frau', 'Kind', 'Lehrer', 'Milch', 'Tisch']);
  assert.equal(writeLexicon(content).lemmas, 5);
  assert.equal(readFileSync(file, 'utf8'), first, 'byte-identical across runs');
  // Lexicon-only nouns are known to the lint even when their item file is not in the tree.
  rmSync(join(content, 'de', 'items', 'a.yaml'));
  writeFileSync(join(content, 'de', 'items', 'b.yaml'), items([['de:item:b', 'phrase', 'Hallo!', 'Die Tisch ist groß.']]));
  assert.ok(has((await lint(content)).warnings, 'article "Die" does not fit "Tisch"'));
});

test('articles: an impossible article for a lexicon noun is a warning (singular, plural and indefinite forms)', async (t) => {
  const sentences = [
    'Die Tisch ist groß.', // der: warn
    'Der Tisch ist groß.',
    'Ich sehe den Tisch und dem Kind.', // den (m acc) ok, dem (n dat) ok
    'Das Frau ist nett.', // die: warn
    'Der Frau gebe ich Milch.', // dative f: ok
    'Eine Kind spielt.', // ein: warn
    'Ein Kind spielt.',
    'Die Kinder spielen, die Tische sind klein.', // plurals ok
    'Das Tische steht hier.', // plural form with das: warn
    'Die Lehrer kommen, der Lehrer kommt, den Lehrern geht es gut.', // unchanged plural: ok
    'Einer Lehrer fehlt.', // indefinite never fits plural-equal masculine singular -> warn
    'Die Milch ist kalt.',
    'Das Milch ist kalt.', // warn
    'Das Tisch-Tennis ist schön.', // compound with hyphen: token is Tisch but followed by "-Tennis"
  ];
  const content = tree(t, { 'de/items/a.yaml': NOUNS, 'de/items/s.yaml': items(sentences.map((s, i) => [`de:item:s${i}`, 'phrase', `${NAMES[i]}!`, s])) });
  const r = await lint(content);
  const warned = r.warnings.filter((w) => w.message.startsWith('article')).map((w) => w.path.match(/items\[(\d+)\]/)[1]);
  assert.deepEqual(warned.sort((a, b) => a - b), ['0', '3', '5', '8', '10', '12']);
  assert.equal(r.errors.filter((e) => e.file.endsWith('s.yaml')).length, 0, messages(r.errors).join('\n'));
  assert.match(r.warnings.find((w) => w.path.startsWith('items[0]')).message, /article "Die" does not fit "Tisch" in any case \(lexicon: der\/den\/dem\/des\)/);
});

test('articles: mcq/listen options and common_mistake.wrong may contain wrong articles (distractors)', async (t) => {
  const exercises = `  - key: de:exercise:a
    type: mcq
    stage: recognition
    answer_lang: de
    prompt:
      stem: Welcher Satz ist richtig?
      stem_lang: de
      options:
        - { id: a, text: Der Tisch ist groß., lang: de }
        - { id: b, text: Die Tisch ist groß., lang: de }
    answer: { correct_option_id: a }
    explanation: { vi: x }
    display_answer: Der Tisch ist groß.`;
  const content = tree(t, { 'de/items/a.yaml': NOUNS, [LESSON]: lesson(exercises) });
  assert.deepEqual(messages((await lint(content)).warnings), []);
});

// ---- exercise rules (f) --------------------------------------------------------------------------------------------

test('known_wrong that folds to a correct answer is an error (ä=ae, ö=oe, ü=ue, ß=ss)', async (t) => {
  const exercises = `  - key: de:exercise:a
    type: translate
    stage: application
    answer_lang: de
    prompt: { source_text: Tôi đi bộ., source_lang: vi, direction: vi_to_target }
    answer: { accepted: [Ich gehe zu Fuß., Ich laufe für Anna.] }
    known_wrong:
      - { answer: Ich gehe zu Fuss., feedback_vi: x, error_tag: spelling }
      - { answer: Ich laufe fuer Anna., feedback_vi: x, error_tag: spelling }
      - { answer: Ich gehe zu Haus., feedback_vi: x, error_tag: word_choice }
    rubric: { typo_tolerance: 1 }
    explanation: { vi: x }
    display_answer: Ich gehe zu Fuß.
  - key: de:exercise:b
    type: fill_blank
    stage: recall
    answer_lang: de
    prompt: { template: "Das ist {{b1}} dich.", blanks: [{ id: b1 }] }
    answer: { blanks: { b1: [für] } }
    known_wrong:
      - { answer: fuer, feedback_vi: x, error_tag: spelling }
    explanation: { vi: x }
    display_answer: Das ist für dich.`;
  const content = tree(t, { [LESSON]: lesson(exercises) });
  const r = await lint(content);
  const kw = r.errors.filter((e) => e.message.includes('folds (ä=ae'));
  assert.deepEqual(kw.map((e) => e.path), ['exercises[0].known_wrong[0].answer', 'exercises[0].known_wrong[1].answer', 'exercises[1].known_wrong[0].answer']);
  assert.match(kw[0].message, /^"Ich gehe zu Fuss\." folds \(ä=ae, ö=oe, ü=ue, ß=ss\) to the correct answer "Ich gehe zu Fuß\."; the grader marks it correct/);
  assert.ok(has(r.warnings, 'exercises[0].rubric.typo_tolerance: typo_tolerance is ignored for de exercises'));
});

test('accepted answers must use the standard spelling, never digraph-only forms', async (t) => {
  const exercises = `  - key: de:exercise:a
    type: translate
    stage: application
    answer_lang: de
    prompt: { source_text: Cái này dành cho bạn., source_lang: vi, direction: vi_to_target }
    answer: { accepted: [Das ist fuer dich., Das ist für dich.] }
    explanation: { vi: x }
    display_answer: Das ist für dich.`;
  const content = tree(t, { [LESSON]: lesson(exercises) });
  const r = await lint(content);
  assert.ok(has(r.errors, 'exercises[0].answer.accepted[0]: "fuer" is a digraph spelling'), messages(r.errors).join('\n'));
  assert.ok(!has(r.errors, 'accepted[1]'));
});

test('mcq options that differ only by ä/ö/ü/ß produce a warning (the grader folds them)', async (t) => {
  const exercises = `  - key: de:exercise:a
    type: mcq
    stage: recognition
    answer_lang: de
    prompt:
      stem: Was ist richtig?
      stem_lang: de
      options:
        - { id: a, text: Masse, lang: de }
        - { id: b, text: Maße, lang: de }
    answer: { correct_option_id: b }
    explanation: { vi: x }
    display_answer: Maße`;
  const content = tree(t, { [LESSON]: lesson(exercises) });
  const r = await lint(content);
  assert.deepEqual(messages(r.errors), []);
  assert.ok(has(r.warnings, 'differ only by ä/ö/ü/ß'));
});

// ---- exams + diagnostic -------------------------------------------------------------------------------------------

const EXAM = (answer, extra = '') => `schema_version: 1
demo: true
language: de
form: { key: de:exam:t }
questions:
  - key: de:examq:t-w1
    section: writing
    kind: short_text
    question_type: goethe_write_word
    level_code: a1
    points: 1
    prompt:
      instruction_vi: x
      stem: Schreiben Sie das Wort.
      stem_lang: de
      passage: "Das ist für dich."
    answer: ${answer}
    explanation: { vi: x }
${extra}`;

test('exam short_text: answers with ä/ö/ü/ß need their digraph variants (exam text is not folded)', async (t) => {
  const content = tree(t, { 'exams/de/a.yaml': EXAM('[für, Straße]') });
  const r = await lint(content);
  assert.deepEqual(r.errors.map((e) => e.path), ['questions[0].answer[0]', 'questions[0].answer[1]']);
  assert.match(r.errors[0].message, /exam short_text answers are not folded: also list "fuer" next to "für"/);
  assert.match(r.errors[1].message, /also list "Strasse" next to "Straße"/);

  const ok = tree(t, { 'exams/de/a.yaml': EXAM('[für, fuer, Straße, Strasse]') });
  assert.deepEqual(messages((await lint(ok)).errors), []);
  const plain = tree(t, { 'exams/de/a.yaml': EXAM('[Brot]') });
  assert.deepEqual(messages((await lint(plain)).errors), []);
});

test('exam and diagnostic prompts, passages, scripts and de options are spell-checked; vi text is not', async (t) => {
  const content = tree(t, {
    'exams/de/a.yaml': `schema_version: 1
demo: true
language: de
form: { key: de:exam:t }
questions:
  - key: de:examq:t-l1
    section: listening
    kind: mcq
    question_type: goethe_listen
    level_code: a1
    points: 1
    prompt:
      instruction_vi: Chọn đáp án đúng, khôngg sai.
      stem: Wann beginnt der Kuhrs?
      stem_lang: de
      script: "Der Kurs begint um neun Uhr."
      options:
        - { id: a, text: Um neun Uhr., lang: de }
        - { id: b, text: Um zen Uhr., lang: de }
    answer: a
    explanation: { vi: Giải thích khôngg. }
`,
    'diagnostic/de/vocabulary.yaml': `schema_version: 1
demo: true
language: de
skill: vocabulary
items:
  - key: de:diag:voc-a1-1
    level: a1
    item_type: mcq
    prompt:
      stem: Was ist ein Apfel?
      stem_lang: de
      passage: "Ein Apfel ist ein Obst. Er wächst am Bahm."
      options:
        - { id: a, text: Obst, lang: de }
        - { id: b, text: fruit, lang: en }
    answer: a
    explanation: { vi: Ok khôngg. }
`,
  });
  const r = await lint(content);
  const bad = r.errors.map((e) => `${e.file.replace('content/', '')} ${e.path} ${/"([^"]+)"/.exec(e.message)?.[1]}`).sort();
  assert.deepEqual(bad, [
    'diagnostic/de/vocabulary.yaml items[0].prompt.passage Bahm',
    'exams/de/a.yaml questions[0].prompt.options[1].text zen',
    'exams/de/a.yaml questions[0].prompt.script begint',
    'exams/de/a.yaml questions[0].prompt.stem Kuhrs',
  ]);
});

// ---- CLI -----------------------------------------------------------------------------------------------------------

test('CLI: prints warnings and errors with file + path, exits 1 only on errors', async (t) => {
  const content = tree(t, { 'de/items/a.yaml': items([['de:item:a', 'phrase', 'Hallo!', 'ich gehe nach Hause.'], ['de:item:b', 'phrase', 'Tschüss!', 'Der Tisck ist da.']]) });
  const out = [];
  const err = [];
  const code = await main(['--content', content], { cwd: dirname(content), log: (m) => out.push(m), error: (m) => err.push(m) });
  assert.equal(code, 1);
  assert.ok(out.includes('warning: content/de/items/a.yaml: items[0].back.examples[0].target: sentence starts with a lowercase letter: "ich"'), out.join('\n'));
  assert.ok(err.some((m) => m.startsWith('error: content/de/items/a.yaml: items[1].back.examples[0].target: "Tisck" is not in the German dictionary')));
  assert.equal(out.at(-1), 'German lint: 1 file(s), 1 error(s), 1 warning(s).');

  const quiet = [];
  await main(['--content', content, '--errors-only'], { cwd: dirname(content), log: (m) => quiet.push(m), error: () => {} });
  assert.deepEqual(quiet, ['German lint: 1 file(s), 1 error(s), 1 warning(s).']);

  writeFileSync(join(content, 'de', 'items', 'a.yaml'), items([['de:item:a', 'phrase', 'Hallo!', 'Ich gehe nach Hause.']]));
  const clean = await main(['--content', content, join(content, 'de', 'items', 'a.yaml')], { cwd: dirname(content), log: () => {}, error: () => {} });
  assert.equal(clean, 0);
});

test('CLI: usage errors exit 2; a missing content dir is not an error', async (t) => {
  assert.equal(await main(['--bogus'], { error: () => {} }), 2);
  assert.equal(await main(['--content'], { error: () => {} }), 2);
  const out = [];
  assert.equal(await main(['--content', join(tree(t), 'nope')], { log: (m) => out.push(m) }), 0);
  assert.match(out.at(-1), /0 file\(s\), 0 error\(s\)/);
});

test('invalid YAML is reported as an error on the file', async (t) => {
  const content = tree(t, { 'de/items/a.yaml': 'items: [unclosed\n' });
  const r = await lint(content);
  assert.equal(r.errors.length, 1);
  assert.match(formatIssue(r.errors[0]), /^content\/de\/items\/a\.yaml: \(root\): invalid YAML: /);
});

// ---- the speller ----------------------------------------------------------------------------------------------------

test('speller: the dictionary fix keeps common words that nspell rejects with the raw dictionary', () => {
  for (const w of ['gut', 'gehen', 'schwimmen', 'dusche', 'suche', 'glaube', 'liebe', 'bitte', 'Wasser', 'Kaffee', 'Mädchen', 'heißt', 'fährt']) {
    assert.equal(speller.ok(w), true, w);
  }
  for (const w of ['tisch', 'lampe', 'Tisck', 'Fahrad', 'gehn', 'Hausaufgabee', 'Wohnug']) assert.equal(speller.ok(w), false, w);
  assert.equal(speller.check('tisch').kind, 'capital');
  assert.equal(speller.check('Muede').kind, 'digraph');
  assert.equal(speller.check('Strassenbahn').kind, 'digraph');
  assert.equal(speller.check('Fussball').kind, 'digraph');
  assert.equal(speller.check('Fußbal').kind, 'unknown');
});

test('speller: compounds with linking elements are accepted, split typos are not', () => {
  for (const w of ['Straßenbahn', 'Hausaufgabe', 'Arbeitszimmer', 'Kühlschrank', 'Bücherregal', 'Krankenhaus', 'Schlafzimmer', 'wunderschön', 'aufstehen', 'Frühstück']) {
    assert.equal(speller.ok(w), true, w);
  }
  for (const w of ['Tischh', 'Frauu', 'Hausaufgabee', 'Kulschrank']) assert.equal(speller.ok(w), false, w);
  // Abbreviations from the allow-list must not become compound pieces (Str + asse).
  assert.equal(speller.ok('Strasse'), false);
});

test('speller: zu-infinitives and bare imperatives', () => {
  for (const w of ['aufzustehen', 'anzurufen', 'zuzumachen', 'geh', 'lern', 'schließ']) assert.equal(speller.ok(w), true, w);
});

test('speller helpers: fixDictionary, foldDigraphs, restoreDigraphs, digraphVariant', () => {
  assert.equal(fixDictionary('4\ngehen/DIVXW\ngehen/Sozm\ntisch/hke\nTisch/E\n'), '2\ngehen/DIVXW\nTisch/E\n');
  assert.equal(foldDigraphs('Straße für Öl Müller'), 'strasse fuer oel mueller');
  assert.ok(restoreDigraphs('Strasse').includes('Straße'));
  assert.ok(restoreDigraphs('fuer').includes('für'));
  assert.deepEqual(restoreDigraphs('Tisch'), []);
  assert.equal(digraphVariant('Äpfel für Öl'), 'Aepfel fuer Oel');
});

test('false-positive guard: ordinary A1-B1 German passes without errors or warnings', async (t) => {
  const text = [
    'Guten Morgen! Wie geht es Ihnen? Mir geht es gut, danke.',
    'Ich heiße Anna und komme aus Vietnam. Ich wohne in Hanoi.',
    'Er ist Lehrer von Beruf. Sie arbeitet als Ärztin im Krankenhaus.',
    'Wir haben zwei Kinder, einen Sohn und eine Tochter.',
    'Möchten Sie etwas essen? Ja, bitte. Ich hätte gern ein Brötchen mit Butter.',
    'Entschuldigung, wo ist der Bahnhof? Gehen Sie geradeaus und dann links.',
    'Ich fahre mit dem Fahrrad zur Arbeit. Am Wochenende besuche ich meine Eltern.',
    'Zuerst dusche ich, dann frühstücke ich. Zum Frühstück esse ich Brot und Käse.',
    'Wenn es regnet, bleibe ich zu Hause. Obwohl er müde war, hat er gearbeitet.',
    'Ich habe morgen ein Vorstellungsgespräch. Die Besprechung beginnt um neun Uhr.',
    'Der Klimawandel ist ein globales Problem. Die Wirtschaft wächst langsam.',
    'Könnten Sie mir bitte helfen? Natürlich, gern. Vielen Dank für Ihre Hilfe.',
    'Das ist mein Bruder, und das ist meine Schwester. Sie sind sehr nett.',
    'Die Prüfung war schwierig, aber ich habe bestanden. Ich muss noch Hausaufgaben machen.',
    'Meiner Meinung nach ist das richtig. Ich stimme dir zu.',
  ];
  const content = tree(t, { 'de/items/a.yaml': items(text.map((s, i) => [`de:item:s${i}`, 'phrase', `${NAMES[i]}!`, s])) });
  const r = await lint(content);
  assert.deepEqual(messages(r.errors), []);
  assert.deepEqual(messages(r.warnings), []);
});

test('the lint never writes outside the temp tree (no lexicon.json unless asked)', async (t) => {
  const content = tree(t, { 'de/items/a.yaml': NOUNS });
  await lint(content);
  assert.equal(existsSync(join(content, 'de', 'lexicon.json')), false);
});

test('irregular plurals are written out in full (das Museum, Museen)', () => {
  assert.deepEqual(parseNoun('das Museum, Museen'), { article: 'das', lemma: 'Museum', spec: 'Museen', sg: false, pl: false });
  assert.equal(pluralForm('Museum', 'Museen'), 'Museen');
  assert.equal(parseNoun('das Museum, museen'), null);
  assert.equal(pluralForm('Tisch', '-e'), 'Tische');
});
