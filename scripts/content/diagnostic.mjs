// Diagnostic item bank (spec 4 §3): content/diagnostic/<en|ko|ja|de>/<skill>.yaml → checks → bundle for
// content_private.import_diagnostic_bundle(jsonb). Loading lives in load.mjs (kind `diagnostic`);
// checkContent() calls diagnosticErrors() and claims the item keys with the lesson keys.
import * as shared from '@linguo/shared';
import { canonicalJson, hashRow, sha256Hex } from './hash.mjs';
import { contentId } from './ids.mjs';
import { formatIssues } from './load.mjs';
import { seededShuffle } from './build.mjs';

const {
  LEVELS,
  DIAGNOSTIC_SKILLS,
  DIAGNOSTIC_BUNDLE_VERSION,
  DIAGNOSTIC_MIN_ITEMS_PER_CELL,
  diagnosticBundleSchema,
  isLevelOf,
  levelOrdinal,
} = shared;

const DOLLAR_TAG = '$diagnostic$';
const q = (s) => JSON.stringify(s);

/** Item types allowed per skill: reading is always a passage question. */
const TYPES_BY_SKILL = {
  vocabulary: ['mcq', 'cloze_choice'],
  grammar: ['mcq', 'cloze_choice'],
  reading: ['reading_mcq'],
};

/** Comparison form of a stem or option text: NFC, case-folded, single spaces. */
const norm = (s) => s.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');

/** Default IRT difficulty: middle of the level band (spec 4 §2). */
export function defaultDifficulty(lang, level) {
  return levelOrdinal(lang, level) + 0.5;
}

/** Loaded diagnostic files flattened to items: [{ file, lang, skill, demo, keyConfidence, data }]. */
export function diagnosticItems(files) {
  const out = [];
  for (const f of files) {
    if (f.kind !== 'diagnostic') continue;
    for (const item of f.data.items) {
      const { skill, demo, key_confidence: keyConfidence, reviewed_by, reviewed_at } = f.data;
      out.push({ file: f.file, lang: f.lang, skill, demo, keyConfidence, review: { reviewed_by, reviewed_at }, data: item });
    }
  }
  return out;
}

/**
 * File and item rules zod cannot express. Keys are claimed (unique, `<lang>:` prefix) by checkContent.
 * @param minPerCell minimum items per language × skill × level (tests lower it)
 * @returns string[] of `<file>: <message>`
 */
export function diagnosticErrors(files, { minPerCell = DIAGNOSTIC_MIN_ITEMS_PER_CELL } = {}) {
  const errors = [];
  const err = (file, message) => errors.push(`${file}: ${message}`);
  const diagFiles = files.filter((f) => f.kind === 'diagnostic');

  const fileBySkill = new Map();
  for (const f of diagFiles) {
    const d = f.data;
    if (d.language !== f.lang) err(f.file, `language ${q(d.language)} does not match folder ${q(f.lang)}`);
    const base = f.file.split('/').pop().replace(/\.ya?ml$/i, '');
    if (base !== d.skill) err(f.file, `file name must be ${d.skill}.yaml (one file per skill)`);
    const slot = `${f.lang}/${d.skill}`;
    if (fileBySkill.has(slot)) err(f.file, `skill ${d.skill} already defined in ${fileBySkill.get(slot)}`);
    else fileBySkill.set(slot, f.file);
    if (d.demo && d.key_confidence !== 'unreviewed') err(f.file, 'demo: true requires key_confidence unreviewed (demo answer keys are unreviewed)');
    if (d.demo && (d.reviewed_by || d.reviewed_at)) err(f.file, 'demo: true but reviewed_at/reviewed_by is set (demo content is unreviewed)');
    if (!d.demo && (!d.reviewed_by || !d.reviewed_at)) err(f.file, 'demo: false requires reviewed_at and reviewed_by (items import as published)');
  }

  const stems = new Map(); // lang → Map(normalized stem → key)
  const counts = new Map(); // `${lang}/${skill}/${level}` → n
  for (const { file, lang, skill, data: it } of diagnosticItems(files)) {
    const at = `item ${q(it.key)}`;
    if (!isLevelOf(lang, it.level)) {
      err(file, `${at}: level ${q(it.level)} is not a ${lang} level (${LEVELS[lang].join(', ')})`);
    } else {
      const cell = `${lang}/${skill}/${it.level}`;
      counts.set(cell, (counts.get(cell) ?? 0) + 1);
      if (it.difficulty !== undefined) {
        const o = levelOrdinal(lang, it.level);
        if (it.difficulty < o || it.difficulty > o + 1) {
          err(file, `${at}: difficulty ${it.difficulty} is outside the ${it.level} band ${o}–${o + 1}`);
        }
      }
    }
    if (!TYPES_BY_SKILL[skill].includes(it.item_type)) {
      err(file, `${at}: item_type ${it.item_type} is not allowed for ${skill} (${TYPES_BY_SKILL[skill].join(', ')})`);
    }
    const hasPassage = it.prompt.passage !== undefined;
    if (it.item_type === 'reading_mcq' && !hasPassage) err(file, `${at}: reading_mcq needs prompt.passage`);
    if (it.item_type !== 'reading_mcq' && hasPassage) err(file, `${at}: prompt.passage is only for reading_mcq`);

    const ids = it.prompt.options.map((o) => o.id);
    if (new Set(ids).size !== ids.length) err(file, `${at}: duplicate option id`);
    const texts = it.prompt.options.map((o) => norm(o.text));
    if (new Set(texts).size !== texts.length) err(file, `${at}: duplicate option text`);
    if (!ids.includes(it.answer)) err(file, `${at}: answer ${q(it.answer)} is not an option id (${ids.join(', ')})`);

    if (!stems.has(lang)) stems.set(lang, new Map());
    const seen = stems.get(lang);
    const stem = norm(it.prompt.stem);
    if (seen.has(stem)) err(file, `${at}: duplicate stem (also ${q(seen.get(stem))})`);
    else seen.set(stem, it.key);
  }

  // Coverage: every language with a diagnostic bank needs every skill × level.
  const langs = [...new Set(diagFiles.map((f) => f.lang))].sort();
  for (const lang of langs) {
    for (const skill of DIAGNOSTIC_SKILLS) {
      const file = fileBySkill.get(`${lang}/${skill}`) ?? `${diagFiles[0].file.split('/diagnostic/')[0]}/diagnostic/${lang}/${skill}.yaml`;
      for (const level of LEVELS[lang]) {
        const n = counts.get(`${lang}/${skill}/${level}`) ?? 0;
        if (n < minPerCell) err(file, `${skill} ${level} has ${n} item(s), needs at least ${minPerCell}`);
      }
    }
  }
  return errors;
}

/**
 * Served options: shuffled deterministically by item key and given opaque ids (sha256 of key#authored
 * id), so neither the position nor the id of the correct option follows the authored YAML.
 */
function servedOptions(it) {
  const idFor = (authored) => `o${sha256Hex(`${it.key}#${authored}`).slice(0, 8)}`;
  const options = seededShuffle(it.prompt.options, it.key).map((o) => ({ id: idFor(o.id), text: o.text, lang: o.lang }));
  if (new Set(options.map((o) => o.id)).size !== options.length) throw new Error(`${it.key}: option id collision`);
  return { options, answerKey: idFor(it.answer) };
}

/** @param loaded result of loadContent() that passed checkContent() */
export function buildDiagnosticBundle(loaded, { gitSha = null } = {}) {
  const items = diagnosticItems(loaded.files)
    .map(({ lang, skill, demo, keyConfidence, review, data: it }) => {
      const { options, answerKey } = servedOptions(it);
      const prompt = { stem: it.prompt.stem, stem_lang: it.prompt.stem_lang };
      if (it.prompt.passage !== undefined) prompt.passage = it.prompt.passage;
      prompt.options = options;
      const row = {
        id: contentId(it.key),
        key: it.key,
        language_code: lang,
        skill,
        level_code: it.level,
        difficulty: it.difficulty ?? defaultDifficulty(lang, it.level),
        item_type: it.item_type,
        prompt,
        answer_key: answerKey,
        explanation: it.explanation,
        key_confidence: keyConfidence,
        status: 'published',
        is_demo: demo,
        reviewed_by: review.reviewed_by,
        reviewed_at: review.reviewed_at,
      };
      return { ...row, content_hash: hashRow(row) };
    })
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const bundle = { bundle_version: DIAGNOSTIC_BUNDLE_VERSION, git_sha: gitSha, items };
  const parsed = diagnosticBundleSchema.safeParse(bundle);
  if (!parsed.success) throw new Error(`Bundle does not match diagnosticBundleSchema:\n${formatIssues(parsed.error).join('\n')}`);
  return bundle;
}

/** The seed.sql statement importing the diagnostic bank (runs after the lesson import). */
export function renderDiagnosticSql(bundle) {
  const json = canonicalJson(bundle, 2);
  if (json.includes(DOLLAR_TAG)) throw new Error(`Content must not contain the text ${DOLLAR_TAG}`);
  return `select content_private.import_diagnostic_bundle(${DOLLAR_TAG}${json}${DOLLAR_TAG}::jsonb);\n`;
}
