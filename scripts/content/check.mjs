// Cross-file content checks (spec 2 §4.3). Every message is `<file>: <message>`.
// Grading checks call the shared TS grader (`gradeResponse` from @linguo/shared): every accepted
// answer / blank entry / word order must grade `correct`; every mcq/listen distractor and every
// `known_wrong` answer must grade `incorrect`.
import * as shared from '@linguo/shared';
import { indexContent } from './load.mjs';

const { LEVELS, REQUIRED_BLOCKS, EXERCISE_STAGES, isGoalForLanguage, isLevelOf, levelOrdinal } = shared;

export const DEMO_HEADER = '# DEMO — chưa kiểm duyệt';

/** The shared grader, or undefined while it is not exported by @linguo/shared. */
export function sharedGrader() {
  return typeof shared.gradeResponse === 'function' ? shared.gradeResponse : undefined;
}

const q = (s) => JSON.stringify(s);

function nfcError(raw) {
  if (raw.normalize('NFC') === raw) return null;
  const lines = raw.split('\n');
  const line = lines.findIndex((l) => l.normalize('NFC') !== l) + 1;
  return `text is not NFC-normalized (line ${line})`;
}

function reviewErrors(data, demo) {
  const errors = [];
  if (demo && (data.reviewed_at || data.reviewed_by)) {
    errors.push('demo: true but reviewed_at/reviewed_by is set (demo content is unreviewed)');
  }
  if (!demo && ['approved', 'published'].includes(data.status) && !data.reviewed_at) {
    errors.push(`status ${data.status} requires reviewed_at unless the file is demo: true`);
  }
  return errors;
}

function levelError(lang, level, field = 'level') {
  return isLevelOf(lang, level) ? null : `${field} ${q(level)} is not a ${lang} level (${LEVELS[lang].join(', ')})`;
}

/** Shape checks that zod cannot express because they relate prompt and answer. */
function answerShapeErrors(ex) {
  const errors = [];
  if (ex.type === 'mcq' || ex.type === 'listen') {
    const ids = ex.prompt.options.map((o) => o.id);
    if (!ids.includes(ex.answer.correct_option_id)) {
      errors.push(`answer correct_option_id ${q(ex.answer.correct_option_id)} is not an option (${ids.join(', ')})`);
    }
  }
  if (ex.type === 'word_bank') {
    const ids = new Set(ex.prompt.tokens.map((t) => t.id));
    ex.answer.orders.forEach((order, i) => {
      for (const id of order) if (!ids.has(id)) errors.push(`word_bank order ${i} token ${q(id)} is not a token`);
      if (new Set(order).size !== order.length) errors.push(`word_bank order ${i} uses a token twice`);
    });
  }
  if (ex.type === 'fill_blank') {
    const promptIds = ex.prompt.blanks.map((b) => b.id).sort();
    const answerIds = Object.keys(ex.answer.blanks).sort();
    if (promptIds.join() !== answerIds.join()) {
      errors.push(`fill_blank answer blanks (${answerIds.join(', ')}) do not match prompt blanks (${promptIds.join(', ')})`);
    }
  }
  return errors;
}

/** Runs the grader over every accepted answer and every distractor of one exercise. */
function gradingErrors(ex, grade) {
  const errors = [];
  const input = { type: ex.type, answer: ex.answer, rubric: ex.rubric, knownWrong: ex.known_wrong, lang: ex.answer_lang };
  const expect = (response, want, what) => {
    const { verdict } = grade(input, response);
    if (want === 'correct' && verdict !== 'correct') errors.push(`${what} grades ${verdict}, expected correct`);
    if (want === 'incorrect' && verdict !== 'incorrect') errors.push(`${what} grades ${verdict}, expected incorrect`);
  };

  if (ex.type === 'mcq' || ex.type === 'listen') {
    for (const o of ex.prompt.options) {
      if (o.id === ex.answer.correct_option_id) expect({ option_id: o.id }, 'correct', `correct option ${q(o.id)}`);
      else expect({ option_id: o.id }, 'incorrect', `distractor option ${q(o.id)}`);
    }
  }
  if (ex.type === 'word_bank') {
    ex.answer.orders.forEach((order, i) => expect({ token_ids: order }, 'correct', `word_bank order ${i}`));
  }
  if (ex.type === 'translate') {
    for (const a of ex.answer.accepted) expect({ text: a }, 'correct', `accepted answer ${q(a)}`);
    for (const kw of ex.known_wrong) expect({ text: kw.answer }, 'incorrect', `known_wrong answer ${q(kw.answer)}`);
  }
  if (ex.type === 'fill_blank') {
    const blanks = ex.answer.blanks;
    const base = Object.fromEntries(Object.entries(blanks).map(([id, list]) => [id, list[0]]));
    for (const [id, list] of Object.entries(blanks)) {
      for (const a of list) expect({ blanks: { ...base, [id]: a } }, 'correct', `accepted answer ${q(a)} for blank ${q(id)}`);
      for (const kw of ex.known_wrong) {
        expect({ blanks: { ...base, [id]: kw.answer } }, 'incorrect', `known_wrong answer ${q(kw.answer)} in blank ${q(id)}`);
      }
    }
  }
  return errors;
}

/** Depth-first search for prerequisite cycles; returns each cycle once as a key path. */
function findCycles(graph) {
  const cycles = [];
  const state = new Map(); // key → 'visiting' | 'done'
  const stack = [];
  const visit = (key) => {
    state.set(key, 'visiting');
    stack.push(key);
    for (const next of graph.get(key) ?? []) {
      if (!graph.has(next)) continue;
      if (state.get(next) === 'visiting') cycles.push([...stack.slice(stack.indexOf(next)), next]);
      else if (!state.has(next)) visit(next);
    }
    stack.pop();
    state.set(key, 'done');
  };
  for (const key of [...graph.keys()].sort()) if (!state.has(key)) visit(key);
  return cycles;
}

/**
 * @param loaded result of loadContent()
 * @param options.grade grader with the `gradeResponse` signature (default: the shared one)
 * @returns string[] of `<file>: <message>` errors (empty when the content is valid)
 */
export function checkContent(loaded, { grade = sharedGrader() } = {}) {
  const errors = [...loaded.errors];
  const err = (file, message) => errors.push(`${file}: ${message}`);
  const { sources, items, programs, units, lessons } = indexContent(loaded.files);

  // --- per file: NFC, demo header -------------------------------------------------------------
  const sourcesFiles = loaded.files.filter((f) => f.kind === 'sources');
  if (sourcesFiles.length === 0 && !loaded.errors.some((e) => e.includes('sources.yaml'))) {
    err(`${loaded.label}/sources.yaml`, 'missing (every row needs a licensed source)');
  }
  for (const f of loaded.files) {
    const nfc = nfcError(f.raw);
    if (nfc) err(f.file, nfc);
    if (f.data.demo === true && !f.raw.startsWith(DEMO_HEADER)) err(f.file, `demo file must start with "${DEMO_HEADER}"`);
  }

  // --- keys --------------------------------------------------------------------------------------
  const seen = new Map();
  const claimKey = (file, key, lang) => {
    if (seen.has(key)) err(file, `duplicate key ${q(key)} (also in ${seen.get(key)})`);
    else seen.set(key, file);
    const prefix = lang ?? 'src';
    if (!key.startsWith(`${prefix}:`)) err(file, `key ${q(key)} must start with "${prefix}:"`);
  };
  for (const s of sources) claimKey(s.file, s.data.key);
  for (const i of items) claimKey(i.file, i.data.key, i.lang);
  for (const p of programs) claimKey(p.file, p.data.key, p.lang);
  for (const u of units) claimKey(u.file, u.data.key, u.lang);
  for (const l of lessons) {
    claimKey(l.file, l.data.key, l.lang);
    for (const ex of l.data.exercises) claimKey(l.file, ex.key, l.lang);
  }

  const sourceKeys = new Set(sources.map((s) => s.data.key));
  const requireSource = (file, key) => {
    if (!sourceKeys.has(key)) err(file, `unknown source ${q(key)} (not in sources.yaml)`);
  };
  const itemByKey = new Map(items.map((i) => [i.data.key, i]));
  const lessonByKey = new Map(lessons.map((l) => [l.data.key, l]));

  // --- items -------------------------------------------------------------------------------------
  for (const i of items) {
    requireSource(i.file, i.source);
    const lvl = levelError(i.lang, i.data.level, `item ${q(i.data.key)} level`);
    if (lvl) err(i.file, lvl);
  }

  // --- programs ----------------------------------------------------------------------------------
  for (const p of programs) {
    const d = p.data;
    requireSource(p.file, d.source);
    if (d.language !== p.lang) err(p.file, `language ${q(d.language)} does not match folder ${q(p.lang)}`);
    for (const e of reviewErrors(d, d.demo)) err(p.file, e);
    const from = levelError(p.lang, d.level_from, 'level_from');
    const to = levelError(p.lang, d.level_to, 'level_to');
    if (from) err(p.file, from);
    if (to) err(p.file, to);
    if (!from && !to && levelOrdinal(p.lang, d.level_from) > levelOrdinal(p.lang, d.level_to)) {
      err(p.file, `level_from ${q(d.level_from)} is above level_to ${q(d.level_to)}`);
    }
    if (d.kind === 'core' && d.goal_types.length) err(p.file, 'kind core must have no goal_types');
    if (d.kind === 'goal' && !d.goal_types.length) err(p.file, 'kind goal needs at least one goal_type');
    for (const g of d.goal_types) if (!isGoalForLanguage(p.lang, g)) err(p.file, `goal_type ${q(g)} is not a ${p.lang} goal`);
  }

  // --- units -------------------------------------------------------------------------------------
  const unitOrder = new Map();
  for (const u of units) {
    if (!u.program) {
      err(u.file, 'no program.yaml in the program folder');
      continue;
    }
    for (const e of reviewErrors(u.data, u.data.demo)) err(u.file, e);
    const slot = `${u.program.data.key}#${u.data.order_index}`;
    if (unitOrder.has(slot)) err(u.file, `order_index ${u.data.order_index} already used by ${unitOrder.get(slot)}`);
    else unitOrder.set(slot, u.file);
  }

  // --- lessons -----------------------------------------------------------------------------------
  const lessonOrder = new Map();
  const introducedBy = new Map();
  for (const l of lessons) {
    const d = l.data;
    if (!l.unit) {
      err(l.file, 'no unit.yaml in the unit folder');
      continue;
    }
    for (const e of reviewErrors(d, d.demo)) err(l.file, e);
    const slot = `${l.unit.data.key}#${d.order_index}`;
    if (lessonOrder.has(slot)) err(l.file, `order_index ${d.order_index} already used by ${lessonOrder.get(slot)}`);
    else lessonOrder.set(slot, l.file);

    const lvl = levelError(l.lang, d.level);
    if (lvl) err(l.file, lvl);
    else if (l.program && !levelError(l.lang, l.program.data.level_from) && !levelError(l.lang, l.program.data.level_to)) {
      const o = levelOrdinal(l.lang, d.level);
      if (o < levelOrdinal(l.lang, l.program.data.level_from) || o > levelOrdinal(l.lang, l.program.data.level_to)) {
        err(l.file, `level ${q(d.level)} is outside the program range ${l.program.data.level_from}–${l.program.data.level_to}`);
      }
    }

    const blockTypes = new Set(d.body.map((b) => b.type));
    for (const t of REQUIRED_BLOCKS) if (!blockTypes.has(t)) err(l.file, `missing block ${t}`);
    const stages = new Set(d.exercises.map((e) => e.stage));
    for (const s of EXERCISE_STAGES) if (!stages.has(s)) err(l.file, `missing stage ${s} (every lesson needs recognition, recall and application exercises)`);

    for (const pre of d.prerequisites) {
      const target = lessonByKey.get(pre);
      if (!target) err(l.file, `unknown prerequisite ${q(pre)}`);
      else if (pre === d.key) err(l.file, 'lesson lists itself as a prerequisite');
      else if (target.lang !== l.lang) err(l.file, `prerequisite ${q(pre)} is in another language (${target.lang})`);
    }
    if (new Set(d.prerequisites).size !== d.prerequisites.length) err(l.file, 'duplicate prerequisite');

    const linked = new Set();
    for (const link of d.items) {
      const item = itemByKey.get(link.item);
      if (!item) err(l.file, `unknown item ${q(link.item)}`);
      else if (item.lang !== l.lang) err(l.file, `item ${q(link.item)} is in another language (${item.lang})`);
      if (linked.has(link.item)) err(l.file, `item ${q(link.item)} linked twice`);
      linked.add(link.item);
      if (link.role === 'introduce') {
        if (introducedBy.has(link.item)) err(l.file, `item ${q(link.item)} is already introduced by ${introducedBy.get(link.item)}`);
        else introducedBy.set(link.item, d.key);
      }
    }

    d.exercises.forEach((ex, i) => {
      const at = `exercises[${i}] ${q(ex.key)}`;
      if (ex.item) {
        const item = itemByKey.get(ex.item);
        if (!item) err(l.file, `${at}: unknown item ${q(ex.item)}`);
        else if (item.lang !== l.lang) err(l.file, `${at}: item ${q(ex.item)} is in another language (${item.lang})`);
      }
      const shape = answerShapeErrors(ex);
      for (const e of shape) err(l.file, `${at}: ${e}`);
      if (shape.length) return; // grading a malformed key would only add noise
      if (!grade) {
        err(l.file, `${at}: cannot verify answers: gradeResponse is not exported by @linguo/shared`);
        return;
      }
      for (const e of gradingErrors(ex, grade)) err(l.file, `${at}: ${e}`);
    });
  }

  // --- prerequisite cycles -----------------------------------------------------------------------
  const graph = new Map(lessons.map((l) => [l.data.key, l.data.prerequisites]));
  for (const cycle of findCycles(graph)) err(lessonByKey.get(cycle[0]).file, `prerequisite cycle: ${cycle.join(' → ')}`);

  return errors;
}
