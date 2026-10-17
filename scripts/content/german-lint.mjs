#!/usr/bin/env node
// German content lint (programme `de`). Runs inside `pnpm content:check` (via content-import.mjs) and alone:
//   node scripts/content/german-lint.mjs [files or dirs...]     default: content/de, content/diagnostic/de, content/exams/de
//   node scripts/content/german-lint.mjs --write-lexicon        regenerate content/de/lexicon.json from the noun items
//   node scripts/content/german-lint.mjs --content <dir> ...    lint another content root (tests); --errors-only hides warnings
// Reads the YAML itself (no zod, no tsx), so it also works on a half-written file. Output lines are
// `<file>: <path>: <message>`; errors make the exit code 1, warnings are informational.
//
// Rules (E = error, W = warning):
//   E spelling       word not in the German dictionary (nspell + dictionary-de + compounds) nor in the allow-lists
//                    (built-in names, content/de/wordlist/*.txt); also digraph spellings (ae/oe/ue/ss for ä/ö/ü/ß)
//                    and lowercase nouns ("tisch")
//   W capital        capitalised word mid-sentence that the dictionary only knows in lowercase (Heute, Gehen)
//   W sentence-start sentence (ends with . ! ?) that starts with a lowercase letter
//   E noun-shape     vocab nouns must be `der|die|das Noun, <plural>` / `(Sg.)` / `(Pl.)`; verbs an infinitive
//   E duplicate      two vocab/phrase items with the same lemma (same article) anywhere in the de tree
//   W homograph      same lemma with different articles (der/die Leiter): check it is intended
//   W article        `der|die|das|ein… <Noun>` where the lexicon says the article cannot fit the noun in any case
//   E known-wrong    known_wrong folds (ä=ae, ö=oe, ü=ue, ß=ss) to a correct answer: the grader marks it correct
//   E exam-fold      exam short_text answers with ä/ö/ü/ß lacking their digraph variant (exam text is not folded)
//   W option-fold    two mcq options that fold to the same text (Masse / Maße)
//   W rubric         rubric.typo_tolerance is ignored for de
import { existsSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { createSpeller, foldDigraphs } from './german-spell.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const YAML_FILE = /\.ya?ml$/i;
const PLACEHOLDER = '\uE000';
const q = (s) => JSON.stringify(s);

// ---------------------------------------------------------------------------------------------------------
// Nouns: shape, plural forms, lexicon
// ---------------------------------------------------------------------------------------------------------

// A suffix spec (-e, ¨-er …) or, for irregular plurals, the full plural word (das Museum, Museen / die Firma, Firmen).
const PLURAL_SPEC = '(?:¨?-(?:e|en|er|n|nen|s|se)?|\\p{Lu}[\\p{L}-]*)';
const NOUN_SHAPE = new RegExp(`^(der|die|das) (\\p{Lu}[\\p{L}-]*(?: \\p{L}[\\p{L}-]*)*)(?:, (${PLURAL_SPEC})| \\((Sg|Pl)\\.\\))$`, 'u');
const NOUN_POS = /nomen|danh từ|\bnoun\b|substantiv/i;
const VERB_POS = /\bverb\b|động từ/i;
const NOUN_FORMAT_HELP = 'expected "der|die|das Noun, <plural>" with <plural> one of -e -en -n -nen -er -s -se - ¨-e ¨-er ¨-, or the full plural word of an irregular plural ("das Museum, Museen"), or "die Milch (Sg.)" / "die Leute (Pl.)"';

/** Parses one noun spec ("der Tisch, -e") → { article, lemma, spec, sg, pl } or null when the shape is wrong. */
export function parseNoun(text) {
  const m = NOUN_SHAPE.exec(text.normalize('NFC').trim());
  if (!m) return null;
  return { article: m[1], lemma: m[2], spec: m[3] ?? null, sg: m[4] === 'Sg', pl: m[4] === 'Pl' };
}

function umlautLast(word) {
  const matches = [...word.matchAll(/au|a|o|u/gi)];
  if (!matches.length) return word;
  const m = matches.at(-1);
  const map = { au: 'äu', Au: 'Äu', AU: 'ÄU', a: 'ä', A: 'Ä', o: 'ö', O: 'Ö', u: 'ü', U: 'Ü' };
  return word.slice(0, m.index) + (map[m[0]] ?? m[0]) + word.slice(m.index + m[0].length);
}

/** Plural form of a lemma from its spec ("-e" → Tische, "¨-" → Äpfel); null for (Sg.)/(Pl.) nouns. */
export function pluralForm(lemma, spec) {
  if (spec === null) return null;
  if (!/^[¨-]/.test(spec)) return spec; // irregular plural written out in full
  const umlaut = spec.startsWith('¨');
  const suffix = spec.replace('¨', '').slice(1);
  return (umlaut ? umlautLast(lemma) : lemma) + suffix;
}

/** Key a vocab/phrase item is deduplicated by: noun lemma, or the lowercased first segment of a verb/phrase. */
function lemmaOf(item) {
  const text = item.front.text.normalize('NFC').trim();
  const noun = parseNoun(text);
  if (noun) return { key: `N:${noun.lemma.toLowerCase()}`, article: noun.article, noun };
  const article = /^(der|die|das)\s+\p{Lu}/u.exec(text);
  if (article) {
    const first = text.replace(/^(der|die|das)\s+/, '').split(/,|\(/)[0].trim();
    return { key: `N:${first.toLowerCase()}`, article: article[1], noun: null };
  }
  return { key: `X:${text.split(/,|\(/)[0].trim().toLowerCase()}`, article: null, noun: null };
}

function isNounItem(item) {
  if (item.type !== 'vocab') return false;
  const text = item.front?.text ?? '';
  return NOUN_POS.test(item.front?.pos ?? '') || /^(der|die|das)\s+\p{Lu}/u.test(text);
}

/** Splits "der Student, -en / die Studentin, -nen" into its noun parts. */
const nounParts = (text) => text.split(/\s+\/\s+/);

const DEFINITE = {
  sg: { der: ['der', 'den', 'dem', 'des'], die: ['die', 'der'], das: ['das', 'dem', 'des'] },
  pl: ['die', 'der', 'den'],
};
const INDEFINITE = { der: ['ein', 'einen', 'einem', 'eines'], die: ['eine', 'einer'], das: ['ein', 'einem', 'eines'] };
const ALL_DETERMINERS = new Set(['der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'eines']);
const INDEFINITE_SET = new Set(Object.values(INDEFINITE).flat());

/**
 * Builds the noun lexicon { lemma → [{ article, plural, pluralForm, item }] } from parsed de items files
 * ([{ doc }]). Entries only come from well-formed noun items.
 */
export function buildLexicon(itemDocs) {
  const nouns = {};
  for (const { doc } of itemDocs) {
    for (const item of doc?.items ?? []) {
      if (!item?.front?.text || !isNounItem(item)) continue;
      for (const part of nounParts(item.front.text)) {
        const n = parseNoun(part);
        if (!n) continue;
        const entry = { article: n.article, plural: n.sg ? '(Sg.)' : n.pl ? '(Pl.)' : n.spec, pluralForm: pluralForm(n.lemma, n.spec), item: item.key };
        (nouns[n.lemma] ??= []).push(entry);
      }
    }
  }
  const sorted = {};
  for (const lemma of Object.keys(nouns).sort()) {
    sorted[lemma] = nouns[lemma].sort((a, b) => (a.item + a.article < b.item + b.article ? -1 : 1));
  }
  return { version: 1, nouns: sorted };
}

/** Lookup table: token → [{ number: 'sg' | 'pl', article }] from a lexicon (deterministic, merged). */
function formsOf(lexicon) {
  const forms = new Map();
  const add = (token, number, article) => {
    if (!forms.has(token)) forms.set(token, []);
    forms.get(token).push({ number, article });
  };
  for (const [lemma, entries] of Object.entries(lexicon.nouns ?? {})) {
    for (const e of entries) {
      if (e.plural !== '(Pl.)') add(lemma, 'sg', e.article);
      else add(lemma, 'pl', 'die');
      if (e.pluralForm) add(e.pluralForm, 'pl', e.article);
      // Weak (n-declension) masculines: the plural form is also the oblique singular (dem Nachbarn, den Studenten).
      if (e.pluralForm && e.article === 'der' && /^-(?:n|en)$/.test(e.plural)) add(e.pluralForm, 'sg', 'der');
    }
  }
  return forms;
}

/** Determiners that fit `token` in some case/number; null when the token is not a lexicon noun. */
function allowedDeterminers(forms, token) {
  const list = forms.get(token);
  if (!list) return null;
  const def = new Set();
  const indef = new Set();
  for (const f of list) {
    if (f.number === 'sg') {
      DEFINITE.sg[f.article].forEach((d) => def.add(d));
      INDEFINITE[f.article].forEach((d) => indef.add(d));
    } else DEFINITE.pl.forEach((d) => def.add(d));
  }
  return { def, indef };
}

// ---------------------------------------------------------------------------------------------------------
// Tokenizing
// ---------------------------------------------------------------------------------------------------------

const TOKEN = /[\p{L}\p{M}\p{N}\uE000]+(?:['’-][\p{L}\p{M}\p{N}\uE000]+)*/gu;
const NOMINAL_CONTEXT = new Set(
  `der die das den dem des ein eine einen einem einer eines kein keine keinen keinem keiner mein meine meinen meinem meiner
   dein deine deinen deinem deiner sein seine seinen seinem seiner ihr ihre ihren ihrem ihrer unser unsere unseren unserem unserer
   euer eure euren eurem eurer zum zur beim im am vom ins ans aufs fürs ums durchs viel viele vieles wenig wenige etwas nichts
   alles allerlei manches einiges dieses diese diesen diesem dieser jedes jede jeden jedem jeder`.split(/\s+/),
);
/**
 * Common function words that are never capitalised mid-sentence: the "capital" warning is limited to them, so
 * nominalised adjectives/verbs (das Gute, beim Essen, die Befragten) and names never trigger it.
 * Formal Sie/Ihnen/Ihr… are deliberately absent.
 */
const LOWERCASE_WORDS = new Set(
  `und oder aber denn weil dass wenn ob als wie wo wer was wann warum wieso woher wohin ich du er es wir mich dich ihn uns euch
   mir dir ihm mein ist sind bin bist war waren hat habe hast haben wird werden kann kannst muss musst soll will darf mag möchte
   nicht kein nie nur auch noch schon sehr heute gestern jetzt hier dort da dann nun oft immer manchmal in an auf aus bei mit nach
   von vor zu zum zur im am vom beim ins um für gegen ohne durch über unter zwischen neben hinter bis seit während wegen ja nein
   doch bitte danke gut schön groß klein neu alt viel wenig mehr sehr ganz jeden jede jedes alle alles etwas nichts man`.split(/\s+/),
);

/** Word tokens of `text` with their position; placeholders `{{b1}}` and tokens with digits are marked `skip`. */
export function tokenize(text) {
  const clean = text.replace(/\{\{[^}]*\}\}|_{2,}/g, PLACEHOLDER);
  const out = [];
  for (const m of clean.matchAll(TOKEN)) {
    out.push({ text: m[0], index: m.index, end: m.index + m[0].length, skip: /[\p{N}\uE000]/u.test(m[0]) });
  }
  return { clean, tokens: out };
}

/** 'start' | 'colon' | 'unknown' | 'mid': what precedes the token in the sentence. */
function sentencePosition(clean, index) {
  const before = clean.slice(0, index);
  const trimmed = before.replace(/[\s„“”"'‚‘’([«»]+$/u, '');
  if (trimmed === '') return 'start';
  if (/\n\s*$/.test(before)) return 'start';
  const last = trimmed.at(-1);
  if ('.!?…'.includes(last)) return 'start';
  if (last === ':') return 'colon';
  if ('–—-'.includes(last)) return 'start'; // dialogue dash
  if (last === PLACEHOLDER) return 'unknown';
  return 'mid';
}

/** Digraph variant of a standard spelling (für → fuer) preserving the capital of the first letter. */
export function digraphVariant(s) {
  return s.replaceAll('ä', 'ae').replaceAll('ö', 'oe').replaceAll('ü', 'ue').replaceAll('ß', 'ss').replaceAll('Ä', 'Ae').replaceAll('Ö', 'Oe').replaceAll('Ü', 'Ue');
}

const foldNorm = (s) => foldDigraphs(s).replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------------------------------------
// Extraction of the German strings of each file kind
// ---------------------------------------------------------------------------------------------------------

/**
 * A German string: { path, text, role?, group?, partial?, nounSpec? }
 *  role: 'term' (front.text, tokens), 'text' (sentences, options, answers), 'wrong' (never spell-checked)
 */
function itemStrings(doc) {
  const out = [];
  (doc.items ?? []).forEach((item, i) => {
    if (!item || typeof item !== 'object') return;
    const base = `items[${i}]`;
    if (typeof item.front?.text === 'string') out.push({ path: `${base}.front.text`, text: item.front.text, role: 'term', stripPlural: item.type === 'vocab' });
    (item.back?.examples ?? []).forEach((ex, j) => {
      if (typeof ex?.target === 'string') out.push({ path: `${base}.back.examples[${j}].target`, text: ex.target, role: 'text' });
    });
  });
  return out;
}

function optionStrings(base, options, group) {
  const out = [];
  (options ?? []).forEach((o, k) => {
    if (o?.lang === 'de' && typeof o.text === 'string') out.push({ path: `${base}.options[${k}].text`, text: o.text, role: 'text', group, partial: true, distractor: true });
  });
  return out;
}

function lessonStrings(doc) {
  const out = [];
  (doc.body ?? []).forEach((block, i) => {
    if (!block || block.target_lang !== 'de') return;
    if (block.type === 'example' && typeof block.target === 'string') out.push({ path: `body[${i}].target`, text: block.target, role: 'text' });
    // `wrong` is wrong on purpose (a misspelling or a wrong article), so only `right` is spell-checked.
    if (block.type === 'common_mistake') {
      if (typeof block.right === 'string') out.push({ path: `body[${i}].right`, text: block.right, role: 'text' });
      if (typeof block.wrong === 'string') out.push({ path: `body[${i}].wrong`, text: block.wrong, role: 'wrong' });
    }
  });
  (doc.exercises ?? []).forEach((ex, i) => {
    if (!ex || typeof ex !== 'object') return;
    const base = `exercises[${i}]`;
    const group = base;
    const de = ex.answer_lang === 'de';
    const p = ex.prompt ?? {};
    const push = (path, text, extra = {}) => {
      if (typeof text === 'string') out.push({ path, text, role: 'text', group, ...extra });
    };
    if (ex.type === 'mcq') {
      if (p.stem_lang === 'de') push(`${base}.prompt.stem`, p.stem);
      out.push(...optionStrings(`${base}.prompt`, p.options, group));
    }
    if (ex.type === 'listen') {
      push(`${base}.prompt.fallback_text`, p.fallback_text);
      out.push(...optionStrings(`${base}.prompt`, p.options, group));
    }
    if (ex.type === 'fill_blank' && de) {
      push(`${base}.prompt.template`, p.template);
      for (const [id, list] of Object.entries(ex.answer?.blanks ?? {})) {
        (list ?? []).forEach((a, k) => push(`${base}.answer.blanks.${id}[${k}]`, a, { accepted: true }));
      }
    }
    if (ex.type === 'word_bank' && de) {
      (p.tokens ?? []).forEach((t, k) => push(`${base}.prompt.tokens[${k}].text`, t?.text, { role: 'term', partial: true }));
    }
    if (ex.type === 'translate') {
      if (p.source_lang === 'de') push(`${base}.prompt.source_text`, p.source_text);
      if (de) (ex.answer?.accepted ?? []).forEach((a, k) => push(`${base}.answer.accepted[${k}]`, a, { accepted: true }));
    }
    if (de) push(`${base}.display_answer`, ex.display_answer);
    if (de) (ex.known_wrong ?? []).forEach((kw, k) => push(`${base}.known_wrong[${k}].answer`, kw?.answer, { role: 'wrong', knownWrong: true }));
  });
  return out;
}

function diagnosticStrings(doc) {
  const out = [];
  (doc.items ?? []).forEach((it, i) => {
    const p = it?.prompt;
    if (!p) return;
    const base = `items[${i}].prompt`;
    if (p.stem_lang === 'de' && typeof p.stem === 'string') out.push({ path: `${base}.stem`, text: p.stem, role: 'text' });
    if (typeof p.passage === 'string') out.push({ path: `${base}.passage`, text: p.passage, role: 'text' });
    out.push(...optionStrings(base, p.options, `items[${i}]`));
  });
  return out;
}

function examStrings(doc) {
  const out = [];
  (doc.questions ?? []).forEach((qn, i) => {
    const p = qn?.prompt;
    if (!p) return;
    const base = `questions[${i}]`;
    if (p.stem_lang === 'de' && typeof p.stem === 'string') out.push({ path: `${base}.prompt.stem`, text: p.stem, role: 'text' });
    if (typeof p.passage === 'string') out.push({ path: `${base}.prompt.passage`, text: p.passage, role: 'text' });
    if (typeof p.script === 'string') out.push({ path: `${base}.prompt.script`, text: p.script, role: 'text' });
    out.push(...optionStrings(`${base}.prompt`, p.options, base));
    if (qn.kind === 'short_text' && Array.isArray(qn.answer)) {
      qn.answer.forEach((a, k) => {
        if (typeof a === 'string') out.push({ path: `${base}.answer[${k}]`, text: a, role: 'text', group: base, examShortText: true });
      });
    }
    if (typeof qn.sample_answer === 'string') out.push({ path: `${base}.sample_answer`, text: qn.sample_answer, role: 'text' });
  });
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------------------------------------

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (YAML_FILE.test(name)) out.push(full);
  }
  return out;
}

/** Kind of a de content file from its path relative to the content root, or null (not a German text file). */
export function classifyGerman(parts) {
  if (parts[0] === 'de') {
    if (parts[1] === 'items' && parts.length === 3) return 'items';
    if (parts[1] === 'programs' && parts[3] === 'units' && parts[5] === 'lessons' && parts.length === 7) return 'lesson';
    return null;
  }
  if (parts[0] === 'diagnostic' && parts[1] === 'de' && parts.length === 3) return 'diagnostic';
  if (parts[0] === 'exams' && parts[1] === 'de' && parts.length === 3) return 'exam';
  return null;
}

/** Words of content/de/wordlist/*.txt (one per line, `#` comments). */
export function readWordlists(contentDir) {
  const dir = join(contentDir, 'de', 'wordlist');
  const words = [];
  if (!existsSync(dir)) return words;
  for (const name of readdirSync(dir).sort()) {
    if (!/\.txt$/i.test(name)) continue;
    for (const line of readFileSync(join(dir, name), 'utf8').split(/\r?\n/)) {
      const t = line.replace(/#.*$/, '').trim();
      if (t) words.push(...t.split(/\s+/));
    }
  }
  return words;
}

function loadDoc(full) {
  let raw = readFileSync(full, 'utf8');
  if (raw.startsWith('\uFEFF')) raw = raw.slice(1);
  try {
    return { doc: parse(raw, { uniqueKeys: true }) };
  } catch (e) {
    return { error: String(e.message).split('\n')[0] };
  }
}

// ---------------------------------------------------------------------------------------------------------
// The lint
// ---------------------------------------------------------------------------------------------------------

/**
 * Lints the German content of `contentDir`.
 * @param opts.targets absolute files/dirs to report on (default: the whole de tree); the dedupe and lexicon
 *   indexes always cover the whole de tree
 * @param opts.label display prefix of file paths (default `content`)
 * @param opts.speller a speller from createSpeller() (tests share one)
 * @returns { errors, warnings, files } where entries are `{ file, path, message }`
 */
export async function lintGerman({ contentDir, targets = null, label = 'content', speller = null } = {}) {
  const dirs = [join(contentDir, 'de'), join(contentDir, 'diagnostic', 'de'), join(contentDir, 'exams', 'de')];
  const all = dirs.flatMap(walk);
  const targetSet = targets ? new Set(targets.flatMap((t) => (existsSync(t) && statSync(t).isDirectory() ? walk(t) : [t])).map((p) => resolve(p))) : null;
  const errors = [];
  const warnings = [];
  const display = (full) => `${label}/${relative(contentDir, full).split(sep).join('/')}`;

  const parsed = [];
  for (const full of all) {
    const parts = relative(contentDir, full).split(sep);
    const kind = classifyGerman(parts);
    if (!kind) continue;
    const inScope = !targetSet || targetSet.has(resolve(full));
    const { doc, error } = loadDoc(full);
    if (error) {
      if (inScope) errors.push({ file: display(full), path: '(root)', message: `invalid YAML: ${error}` });
      continue;
    }
    if (doc && typeof doc === 'object') parsed.push({ full, file: display(full), kind, doc, inScope });
  }
  const report = (f, severity, path, message) => {
    if (f.inScope) (severity === 'error' ? errors : warnings).push({ file: f.file, path, message });
  };

  // Indexes over the whole de tree: lexicon (nouns) and lemma owners (duplicates).
  const itemFiles = parsed.filter((f) => f.kind === 'items');
  const lexicon = buildLexicon(itemFiles);
  const lexiconFile = join(contentDir, 'de', 'lexicon.json');
  if (existsSync(lexiconFile)) {
    try {
      const saved = JSON.parse(readFileSync(lexiconFile, 'utf8'));
      for (const [lemma, entries] of Object.entries(saved.nouns ?? {})) if (!lexicon.nouns[lemma]) lexicon.nouns[lemma] = entries;
    } catch {
      // A broken lexicon.json is regenerated by --write-lexicon; the lint falls back to the live items.
    }
  }
  const forms = formsOf(lexicon);

  const owners = new Map(); // lemma key → [{ f, path, key, article }]
  for (const f of itemFiles) {
    (f.doc.items ?? []).forEach((item, i) => {
      if (!item?.front?.text || (item.type !== 'vocab' && item.type !== 'phrase')) return;
      const info = lemmaOf(item);
      if (!owners.has(info.key)) owners.set(info.key, []);
      owners.get(info.key).push({ f, path: `items[${i}].front.text`, key: item.key, article: info.article });
    });
  }

  // Item shape + duplicates (items files only).
  for (const f of itemFiles) {
    if (!f.inScope) continue;
    (f.doc.items ?? []).forEach((item, i) => {
      if (!item || typeof item !== 'object' || typeof item.front?.text !== 'string') return;
      const at = `items[${i}].front.text`;
      const text = item.front.text.normalize('NFC').trim();
      if (isNounItem(item)) {
        for (const part of nounParts(text)) {
          if (!parseNoun(part)) report(f, 'error', at, `noun item ${q(part)} is malformed: ${NOUN_FORMAT_HELP}`);
        }
      } else if (item.type === 'vocab' && VERB_POS.test(item.front.pos ?? '')) {
        const head = text.replace(/\s*\(.*$/, '').split(',')[0].trim();
        const last = head.split(/\s+/).at(-1) ?? '';
        if (!/^[\p{Ll}]+n$/u.test(last)) report(f, 'error', at, `verb item ${q(text)} must start with the infinitive (…en/…n), e.g. "fahren (du fährst)" or "fahren, fährt, fuhr, ist gefahren"`);
      }
      if (item.type === 'vocab' || item.type === 'phrase') {
        const info = lemmaOf(item);
        const others = (owners.get(info.key) ?? []).filter((o) => o.key !== item.key);
        if (others.length) {
          const same = others.filter((o) => o.article === info.article);
          const where = (list) => list.map((o) => `${o.key} (${o.f.file})`).join(', ');
          if (same.length) report(f, 'error', at, `duplicate lemma ${q(text)}: already defined by ${where(same)}; reuse that item instead of adding a new key`);
          else report(f, 'warning', at, `homograph? ${q(text)} has the same lemma as ${where(others)} with another article; fine only for different words (der/die Leiter)`);
        }
      }
    });
  }

  const inScopeFiles = parsed.filter((f) => f.inScope);
  const strings = [];
  for (const f of inScopeFiles) {
    const list = f.kind === 'items' ? itemStrings(f.doc) : f.kind === 'lesson' ? lessonStrings(f.doc) : f.kind === 'diagnostic' ? diagnosticStrings(f.doc) : examStrings(f.doc);
    for (const s of list) strings.push({ f, ...s });
  }

  // Exercise-level rules (no speller needed).
  for (const f of inScopeFiles) {
    if (f.kind === 'lesson') exerciseRules(f, report);
    if (f.kind === 'exam') examRules(f, report);
  }

  // Spelling, capitalisation, articles: only now is the (2 s) dictionary needed.
  const spoken = strings.filter((s) => s.role !== 'wrong');
  if (spoken.length) {
    const sp = speller ?? (await createSpeller({ words: readWordlists(contentDir) }));
    for (const s of spoken) {
      for (const issue of analyse(s, sp, forms, s.examShortText)) report(s.f, issue.severity, s.path, issue.message);
    }
  }

  const sortKey = (a, b) => (a.file + a.path + a.message < b.file + b.path + b.message ? -1 : 1);
  return { errors: errors.sort(sortKey), warnings: warnings.sort(sortKey), files: inScopeFiles.length, lexicon };
}

/** Spelling, capitalisation, sentence start and article rules for one string. */
function analyse(s, sp, forms, examShortText) {
  const issues = [];
  let text = s.text.normalize('NFC');
  if (s.stripPlural) {
    // "der Tisch, -e" / "die Milch (Sg.)": the plural spec is not German text.
    text = text
      .replace(new RegExp(`,\\s*${PLURAL_SPEC}(?=\\s*(?:/|$))`, 'g'), '')
      .replace(/\s*\((?:Sg|Pl)\.\)/g, '');
  }
  const { clean, tokens } = tokenize(text);
  const real = tokens.filter((t) => !t.skip);

  tokens.forEach((tok, n) => {
    if (tok.skip) return;
    const parts = tok.text.split(/['’-]/).filter((p) => p.length >= 2);
    const position = sentencePosition(clean, tok.index);
    for (const part of parts) {
      const result = sp.check(part);
      if (result) {
        const hint = result.suggestions.length ? ` (${result.kind === 'unknown' ? 'did you mean' : 'use'}: ${result.suggestions.join(', ')})` : '';
        if (result.kind === 'digraph') {
          // Exam short_text answers are not folded: the digraph variant must be listed next to the standard one.
          if (!examShortText) issues.push({ severity: 'error', message: `${q(part)} is a digraph spelling; write the standard spelling with ä/ö/ü/ß${hint}. The grader accepts typed ae/oe/ue/ss on its own` });
        } else if (result.kind === 'capital') {
          issues.push({ severity: 'error', message: `${q(part)} must be capitalised (noun)${hint}` });
        } else {
          issues.push({ severity: 'error', message: `${q(part)} is not in the German dictionary${hint}; if it is correct (name, loan word) add it to content/de/wordlist/<your-file>.txt` });
        }
        continue;
      }
      // Mid-sentence capital on a word the dictionary only lists in lowercase (not after an article: nominalised).
      if (part === tok.text && part[0] !== part[0].toLowerCase() && part !== part.toUpperCase() && position === 'mid') {
        const lower = part.toLowerCase();
        const prev = tokens[n - 1]?.text.toLowerCase();
        if (LOWERCASE_WORDS.has(lower) && !sp.allow.has(lower) && !sp.exactEntry(part) && !NOMINAL_CONTEXT.has(prev)) {
          issues.push({ severity: 'warning', message: `${q(part)} is capitalised mid-sentence; write ${q(lower)} (capitalise only nouns, names and the formal Sie/Ihr)` });
        }
      }
    }
  });

  // Sentence start: a full sentence (terminal . ! ?) begins with a capital letter.
  if (!s.partial && s.role === 'text' && /[.!?]["“”']?\s*$/.test(text.trim())) {
    const first = real[0];
    if (first && first.index === clean.search(/\S/) && /^\p{Ll}/u.test(first.text) && !sp.allow.has(first.text.toLowerCase())) {
      issues.push({ severity: 'warning', message: `sentence starts with a lowercase letter: ${q(first.text)}` });
    }
  }

  // Articles against the noun lexicon: `die Tisch`, `eine Kind`.
  // (mcq/listen options are skipped: a wrong article is a legitimate distractor.)
  for (let i = 1; i < tokens.length && !s.distractor; i++) {
    const noun = tokens[i];
    const det = tokens[i - 1];
    if (noun.skip || det.skip || !/^\s+$/.test(clean.slice(det.end, noun.index))) continue;
    const d = det.text.toLowerCase();
    if (!ALL_DETERMINERS.has(d)) continue;
    // "Ist das Herr Müller?": after a form of sein, `das` is the demonstrative pronoun, not an article.
    if (d === 'das' && /^(?:ist|sind|war|waren)$/i.test(tokens[i - 2]?.text ?? '')) continue;
    const allowed = allowedDeterminers(forms, noun.text);
    if (!allowed) continue;
    const set = INDEFINITE_SET.has(d) ? allowed.indef : allowed.def;
    if (!set.has(d)) {
      const fits = [...(INDEFINITE_SET.has(d) ? allowed.indef : allowed.def)].join('/') || 'none';
      issues.push({ severity: 'warning', message: `article ${q(det.text)} does not fit ${q(noun.text)} in any case (lexicon: ${fits}); homographs such as der/die/das Band are exceptions` });
    }
  }
  // The same word twice in one string is reported once.
  const seen = new Set();
  return issues.filter((i) => !seen.has(i.message) && seen.add(i.message));
}

/** Rules over whole lesson exercises: known_wrong vs accepted folding, option folding, ignored rubric field. */
function exerciseRules(f, report) {
  (f.doc.exercises ?? []).forEach((ex, i) => {
    if (!ex || typeof ex !== 'object') return;
    const base = `exercises[${i}]`;
    const de = ex.answer_lang === 'de';
    if (de && ex.rubric?.typo_tolerance === 1) report(f, 'warning', `${base}.rubric.typo_tolerance`, 'typo_tolerance is ignored for de exercises; do not rely on it');
    if (de && (ex.type === 'translate' || ex.type === 'fill_blank')) {
      const correct = ex.type === 'translate' ? (ex.answer?.accepted ?? []) : Object.values(ex.answer?.blanks ?? {}).flat();
      const folded = correct.filter((a) => typeof a === 'string').map((a) => ({ a, n: foldNorm(a) }));
      (ex.known_wrong ?? []).forEach((kw, k) => {
        if (typeof kw?.answer !== 'string') return;
        const n = foldNorm(kw.answer);
        const hit = folded.find((c) => c.n === n && c.a !== kw.answer);
        if (hit) {
          report(f, 'error', `${base}.known_wrong[${k}].answer`, `${q(kw.answer)} folds (ä=ae, ö=oe, ü=ue, ß=ss) to the correct answer ${q(hit.a)}; the grader marks it correct, so it can never be a known_wrong`);
        }
      });
    }
    if ((ex.type === 'mcq' || ex.type === 'listen') && Array.isArray(ex.prompt?.options)) {
      const seen = new Map();
      ex.prompt.options.forEach((o, k) => {
        if (o?.lang !== 'de' || typeof o.text !== 'string') return;
        const n = foldNorm(o.text);
        if (seen.has(n) && seen.get(n) !== o.text) {
          report(f, 'warning', `${base}.prompt.options[${k}].text`, `${q(o.text)} and ${q(seen.get(n))} differ only by ä/ö/ü/ß (the grader folds them); fine for mcq, but do not use this contrast in typed exercises`);
        } else seen.set(n, o.text);
      });
    }
  });
}

/** Exam short_text answers are NOT folded by the exam grader: umlaut words need their digraph variant listed. */
function examRules(f, report) {
  (f.doc.questions ?? []).forEach((qn, i) => {
    if (qn?.kind !== 'short_text' || !Array.isArray(qn.answer)) return;
    const have = new Set(qn.answer.filter((a) => typeof a === 'string').map((a) => a.normalize('NFC').trim().toLowerCase()));
    qn.answer.forEach((a, k) => {
      if (typeof a !== 'string' || !/[äöüßÄÖÜ]/.test(a)) return;
      const variant = digraphVariant(a).normalize('NFC').trim().toLowerCase();
      if (!have.has(variant)) {
        report(f, 'error', `questions[${i}].answer[${k}]`, `exam short_text answers are not folded: also list ${q(digraphVariant(a))} next to ${q(a)} (or use an mcq question)`);
      }
    });
  });
}

export const formatIssue = (r) => `${r.file}: ${r.path}: ${r.message}`;

/** Writes content/de/lexicon.json (deterministic) and returns the number of lemmas. */
export function writeLexicon(contentDir) {
  const parsed = [];
  for (const full of walk(join(contentDir, 'de', 'items'))) {
    const { doc } = loadDoc(full);
    if (doc && typeof doc === 'object') parsed.push({ doc });
  }
  const lexicon = buildLexicon(parsed);
  const file = join(contentDir, 'de', 'lexicon.json');
  writeFileSync(file, `${JSON.stringify(lexicon, null, 2)}\n`);
  return { file, lemmas: Object.keys(lexicon.nouns).length };
}

// ---------------------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------------------

const USAGE = 'Usage: german-lint.mjs [--content <dir>] [--write-lexicon] [--errors-only] [files or dirs...]';

export async function main(argv, { cwd = process.cwd(), log = console.log, error = console.error } = {}) {
  const args = [...argv];
  const take = (flag) => {
    const i = args.indexOf(flag);
    if (i === -1) return undefined;
    const v = args[i + 1];
    args.splice(i, v === undefined ? 1 : 2);
    return v ?? null;
  };
  const has = (flag) => {
    const i = args.indexOf(flag);
    if (i === -1) return false;
    args.splice(i, 1);
    return true;
  };
  const contentArg = take('--content');
  const writeLex = has('--write-lexicon');
  const errorsOnly = has('--errors-only');
  if (contentArg === null || args.some((a) => a.startsWith('--'))) {
    error(USAGE);
    return 2;
  }
  const contentDir = contentArg ? resolve(cwd, contentArg) : join(root, 'content');
  if (writeLex) {
    const { file, lemmas } = writeLexicon(contentDir);
    log(`Wrote ${relative(cwd, file).split(sep).join('/')} (${lemmas} nouns).`);
    return 0;
  }
  const targets = args.length ? args.map((a) => resolve(cwd, a)) : null;
  const label = relative(cwd, contentDir).split(sep).join('/') || '.';
  const { errors, warnings, files } = await lintGerman({ contentDir, targets, label });
  if (!errorsOnly) for (const w of warnings) log(`warning: ${formatIssue(w)}`);
  for (const e of errors) error(`error: ${formatIssue(e)}`);
  log(`German lint: ${files} file(s), ${errors.length} error(s), ${warnings.length} warning(s).`);
  return errors.length ? 1 : 0;
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

if (isMainModule()) process.exitCode = await main(process.argv.slice(2));
