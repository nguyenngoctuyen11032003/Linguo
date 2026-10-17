// Exam practice forms (spec 9 §2): content/exams/<en|ko|ja|de>/<form>.yaml → checks → bundle for
// public.import_exam_content_bundle(jsonb). Loading lives in load.mjs (kind `exam`); checkContent()
// claims the form and question keys with every other key and calls examErrors().
import * as shared from '@linguo/shared';
import { canonicalJson, hashRow, sha256Hex } from './hash.mjs';
import { contentId } from './ids.mjs';
import { formatIssues } from './load.mjs';
import { seededShuffle } from './build.mjs';

const { LEVELS, EXAM_BUNDLE_VERSION, EXAM_SECTIONS, GOETHE_PASS_RATIO, examBundleSchema, gradeExamAnswer, isCefrLikeFamily, isLevelOf, levelOrdinal, normalizeExamText } = shared;

const DOLLAR_TAG = '$exam$';
const q = (s) => JSON.stringify(s);

/** Exam family → language of its forms. */
export const FAMILY_LANGUAGE = { topik_i: 'ko', topik_ii: 'ko', cefr: 'en', jlpt: 'ja', goethe: 'de' };

/** Comparison form of an option text: NFC, case-folded, single spaces. */
const norm = (s) => s.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');

/** Loaded exam files: [{ file, lang, data }]. */
export function examFiles(files) {
  return files.filter((f) => f.kind === 'exam');
}

function levelError(lang, level, field) {
  return isLevelOf(lang, level) ? null : `${field} ${q(level)} is not a ${lang} level (${LEVELS[lang].join(', ')})`;
}

/** Rules for one question that zod cannot express (kind ↔ answer/options/rubric, listening script). */
function questionErrors(qn) {
  const errors = [];
  const p = qn.prompt;
  if (qn.kind === 'mcq') {
    if (!p.options) errors.push('mcq needs prompt.options');
    else {
      const ids = p.options.map((o) => o.id);
      if (new Set(ids).size !== ids.length) errors.push('duplicate option id');
      const texts = p.options.map((o) => norm(o.text));
      if (new Set(texts).size !== texts.length) errors.push('duplicate option text');
      if (typeof qn.answer !== 'string') errors.push('mcq answer must be the id of one option');
      else if (!ids.includes(qn.answer)) errors.push(`answer ${q(qn.answer)} is not an option id (${ids.join(', ')})`);
      else {
        for (const id of ids) {
          if (gradeExamAnswer('mcq', id, qn.answer) !== (id === qn.answer)) errors.push(`option ${q(id)} grades wrongly`);
        }
      }
    }
  } else if (p.options) errors.push(`prompt.options is only for mcq (kind ${qn.kind})`);

  if (qn.kind === 'short_text') {
    if (!Array.isArray(qn.answer)) errors.push('short_text answer must be a list of accepted answers');
    else {
      const seen = new Map();
      for (const a of qn.answer) {
        const n = normalizeExamText(a);
        if (n === '') errors.push(`accepted answer ${q(a)} is empty after normalisation`);
        else if (gradeExamAnswer('short_text', a, qn.answer) !== true) errors.push(`accepted answer ${q(a)} does not grade correct`);
        if (seen.has(n)) errors.push(`accepted answers ${q(seen.get(n))} and ${q(a)} are the same after normalisation`);
        else seen.set(n, a);
      }
    }
  }

  if (qn.kind === 'essay') {
    if (qn.answer !== undefined) errors.push('essay has no answer (it is not auto-graded)');
    if (!qn.rubric?.length) errors.push('essay needs a rubric');
    else {
      const keys = qn.rubric.map((r) => r.key);
      if (new Set(keys).size !== keys.length) errors.push('duplicate rubric key');
    }
    if (p.min_chars !== undefined && p.max_chars !== undefined && p.min_chars > p.max_chars) {
      errors.push(`min_chars ${p.min_chars} is above max_chars ${p.max_chars}`);
    }
  } else {
    if (qn.answer === undefined) errors.push(`${qn.kind} needs an answer`);
    if (qn.rubric !== undefined) errors.push('rubric is only for essay');
    if (qn.sample_answer !== undefined) errors.push('sample_answer is only for essay');
    if (p.min_chars !== undefined || p.max_chars !== undefined) errors.push('min_chars/max_chars are only for essay');
  }

  if (qn.section === 'listening') {
    if (p.script === undefined && p.audio_asset_id === null) errors.push('listening needs prompt.script or prompt.audio_asset_id');
  } else if (p.script !== undefined || p.audio_asset_id !== null) {
    errors.push('prompt.script and prompt.audio_asset_id are only for listening');
  }
  if (qn.section === 'writing' && qn.kind === 'mcq') errors.push('writing questions are short_text or essay');
  if (qn.section !== 'writing' && qn.kind !== 'mcq') errors.push(`${qn.kind} belongs to the writing section`);
  return errors;
}

/**
 * File and question rules zod cannot express. Keys are claimed (unique, `<lang>:` prefix) by checkContent.
 * @param sourceKeys keys defined in sources.yaml
 * @returns string[] of `<file>: <message>`
 */
export function examErrors(files, { sourceKeys = new Set() } = {}) {
  const errors = [];
  const err = (file, message) => errors.push(`${file}: ${message}`);
  const typeOwner = new Map(); // `${family}/${question_type}` → { section, kind, file }

  for (const f of examFiles(files)) {
    const d = f.data;
    const lang = f.lang;
    const form = d.form;
    if (d.language !== lang) err(f.file, `language ${q(d.language)} does not match folder ${q(lang)}`);
    if (FAMILY_LANGUAGE[form.family] !== d.language) err(f.file, `family ${form.family} is a ${FAMILY_LANGUAGE[form.family]} exam, not ${d.language}`);
    if (!sourceKeys.has(form.source_key)) err(f.file, `unknown source ${q(form.source_key)} (not in sources.yaml)`);

    // Review.
    if (d.demo && (d.reviewed_by || d.reviewed_at)) err(f.file, 'demo: true but reviewed_at/reviewed_by is set (demo content is unreviewed)');
    if (!d.demo && (!d.reviewed_by || !d.reviewed_at)) err(f.file, 'demo: false requires reviewed_at and reviewed_by (forms import as published)');
    if (d.demo && form.scoring.verified) err(f.file, 'demo: true requires scoring.verified false (a demo scale is never verified)');

    // Levels.
    const from = levelError(lang, form.level_from, 'level_from');
    const to = levelError(lang, form.level_to, 'level_to');
    if (from) err(f.file, from);
    if (to) err(f.file, to);
    const range = !from && !to ? [levelOrdinal(lang, form.level_from), levelOrdinal(lang, form.level_to)] : null;
    if (range && range[0] > range[1]) err(f.file, `level_from ${q(form.level_from)} is above level_to ${q(form.level_to)}`);

    // Sections: contiguous, in listening → reading → writing order, each timed.
    const sections = [];
    for (const qn of d.questions) if (sections.at(-1) !== qn.section) sections.push(qn.section);
    if (new Set(sections).size !== sections.length) err(f.file, `questions of a section must be contiguous (order: ${sections.join(' → ')})`);
    const ordered = [...new Set(sections)].sort((a, b) => EXAM_SECTIONS.indexOf(a) - EXAM_SECTIONS.indexOf(b));
    if (new Set(sections).size === sections.length && ordered.join() !== sections.join()) {
      err(f.file, `sections must follow the order ${EXAM_SECTIONS.join(' → ')} (got ${sections.join(' → ')})`);
    }
    const used = new Set(sections);
    for (const s of used) if (form.time_limits[s] === undefined) err(f.file, `time_limits.${s} is missing (section ${s} has questions)`);
    for (const s of Object.keys(form.time_limits)) if (!used.has(s)) err(f.file, `time_limits.${s} is set but the section has no questions`);

    // Scoring.
    const sc = form.scoring;
    for (const s of Object.keys(sc.section_max)) if (!used.has(s)) err(f.file, `scoring.section_max.${s} is set but the section has no questions`);
    if (isCefrLikeFamily(form.family)) {
      // cefr and goethe: no score conversion, a section passes at pass_ratio of its points.
      if (sc.bands.length) err(f.file, `${form.family} forms have no score bands (bands: [])`);
      if (sc.pass_ratio === null) err(f.file, `${form.family} forms need scoring.pass_ratio`);
      else if (form.family === 'goethe' && sc.pass_ratio !== GOETHE_PASS_RATIO) err(f.file, `goethe forms need scoring.pass_ratio ${GOETHE_PASS_RATIO}`);
    } else {
      if (!sc.bands.length) err(f.file, `${form.family} forms need scoring.bands`);
      if (sc.pass_ratio !== null) err(f.file, `${form.family} forms have pass_ratio null`);
      for (const s of used) if (sc.section_max[s] === undefined) err(f.file, `scoring.section_max.${s} is missing (section ${s} has questions)`);
      const maxTotal = Object.values(sc.section_max).reduce((a, b) => a + b, 0);
      sc.bands.forEach((b, i) => {
        const lvl = levelError(lang, b.level_code, `scoring.bands[${i}].level_code`);
        if (lvl) err(f.file, lvl);
        if (i > 0 && b.min_total <= sc.bands[i - 1].min_total) err(f.file, `scoring.bands must be ascending by min_total (bands[${i}])`);
        if (b.min_total > maxTotal) err(f.file, `scoring.bands[${i}].min_total ${b.min_total} is above the section_max total ${maxTotal}`);
      });
    }

    // Questions.
    for (const qn of d.questions) {
      const at = `question ${q(qn.key)}`;
      const lvl = levelError(lang, qn.level_code, 'level_code');
      if (lvl) err(f.file, `${at}: ${lvl}`);
      else if (range && (levelOrdinal(lang, qn.level_code) < range[0] || levelOrdinal(lang, qn.level_code) > range[1])) {
        err(f.file, `${at}: level_code ${q(qn.level_code)} is outside the form range ${form.level_from}–${form.level_to}`);
      }
      if (!qn.question_type.startsWith(`${form.family}_`)) err(f.file, `${at}: question_type must start with "${form.family}_"`);
      const slot = `${form.family}/${qn.question_type}`;
      const owner = typeOwner.get(slot);
      if (!owner) typeOwner.set(slot, { section: qn.section, kind: qn.kind });
      else if (owner.section !== qn.section || owner.kind !== qn.kind) {
        err(f.file, `${at}: question_type ${qn.question_type} is ${owner.section}/${owner.kind} elsewhere in ${form.family} (one section and kind per type)`);
      }
      for (const e of questionErrors(qn)) err(f.file, `${at}: ${e}`);
    }
  }

  return errors;
}

/** Served mcq options: shuffled by question key and re-labelled with opaque ids (diagnostic precedent). */
function servedOptions(qn) {
  const idFor = (authored) => `o${sha256Hex(`${qn.key}#${authored}`).slice(0, 8)}`;
  const options = seededShuffle(qn.prompt.options, qn.key).map((o) => ({ id: idFor(o.id), text: o.text, lang: o.lang }));
  if (new Set(options.map((o) => o.id)).size !== options.length) throw new Error(`${qn.key}: option id collision`);
  return { options, answer: idFor(qn.answer) };
}

function bundleQuestion(qn, seq) {
  // Authored options are replaced by the served ones (mcq only; other kinds have none).
  const { script, ...prompt } = qn.prompt;
  let answer = null;
  if (qn.kind === 'mcq') {
    const served = servedOptions(qn);
    prompt.options = served.options;
    answer = served.answer;
  } else if (qn.kind === 'short_text') {
    answer = qn.answer;
  }
  const row = {
    id: contentId(qn.key),
    key: qn.key,
    seq,
    section: qn.section,
    kind: qn.kind,
    question_type: qn.question_type,
    level_code: qn.level_code,
    points: qn.points,
    prompt,
    answer,
    explanation: qn.explanation,
    script: script ?? null,
    rubric: qn.rubric ?? null,
    sample_answer: qn.sample_answer ?? null,
  };
  return { ...row, content_hash: hashRow(row) };
}

/** @param loaded result of loadContent() that passed checkContent() */
export function buildExamBundle(loaded) {
  const forms = examFiles(loaded.files)
    .map(({ lang, data: d }) => {
      const questions = d.questions.map((qn, i) => bundleQuestion(qn, i + 1));
      const row = {
        id: contentId(d.form.key),
        key: d.form.key,
        language_code: lang,
        family: d.form.family,
        title_vi: d.form.title_vi,
        description_vi: d.form.description_vi,
        level_from: d.form.level_from,
        level_to: d.form.level_to,
        source_key: d.form.source_key,
        time_limits: d.form.time_limits,
        scoring: d.form.scoring,
        is_demo: d.demo,
        reviewed_by: d.reviewed_by,
        reviewed_at: d.reviewed_at,
      };
      return { ...row, content_hash: hashRow(row, questions.map((x) => x.content_hash)), questions };
    })
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const bundle = { bundle_version: EXAM_BUNDLE_VERSION, forms };
  const parsed = examBundleSchema.safeParse(bundle);
  if (!parsed.success) throw new Error(`Bundle does not match examBundleSchema:\n${formatIssues(parsed.error).join('\n')}`);
  return bundle;
}

/** The seed.sql statement importing the exam forms (runs after the diagnostic import). */
export function renderExamSql(bundle) {
  const json = canonicalJson(bundle, 2);
  if (json.includes(DOLLAR_TAG)) throw new Error(`Content must not contain the text ${DOLLAR_TAG}`);
  return `select public.import_exam_content_bundle(${DOLLAR_TAG}${json}${DOLLAR_TAG}::jsonb);\n`;
}
