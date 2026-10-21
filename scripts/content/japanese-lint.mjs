// Japanese content lint (language `ja`). Runs inside `pnpm content:check` (content-import.mjs) on the already loaded
// content. Only rules that caught or can catch real authoring mistakes:
//   E reading-kanji   item front.reading must be kana (furigana); a kanji there is a copy/paste slip
//                     (found: `reading: 代わりに` instead of かわりに)
//   E display-answer  a ja word_bank / translate display_answer must be one of the accepted answers (compared
//                     ignoring spaces and punctuation, like the grader; kana and kanji spellings are NOT folded, so the
//                     solution shown after a wrong answer is itself something the grader accepts)
//   W duplicate-lemma two vocab/phrase items with the same written form and reading (two cards for one word)
// Every message is `<file>: <path>: <message>`.

const KANJI = /[一-鿿々]/u;
// What the ja grader ignores before comparing: whitespace (incl. U+3000) and punctuation.
const STRIP = /[\s\u3000、。，．,.!?！？「」『』（）()・…～〜~:：;；"'“”‘’\-－ー—]/gu;
const norm = (s) => s.normalize('NFC').replace(STRIP, '').toLowerCase();

const walkExercises = (file) => (file.kind === 'lesson' ? file.data.exercises.map((ex, i) => [ex, i]) : []);

/**
 * @param files loaded content files (`{ file, kind, lang, data }`, see load.mjs)
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function japaneseLint(files) {
  const errors = [];
  const warnings = [];
  const seen = new Map();
  for (const f of files) {
    if (f.lang !== 'ja') continue;
    if (f.kind === 'items') {
      f.data.items.forEach((it, i) => {
        const reading = it.front.reading;
        if (reading && KANJI.test(reading)) {
          errors.push(`${f.file}: items[${i}].front.reading: ${JSON.stringify(reading)} contains kanji (the reading must be kana)`);
        }
        if (it.type === 'vocab' || it.type === 'phrase') {
          const key = `${it.front.text}|${reading ?? ''}`;
          if (seen.has(key)) warnings.push(`${f.file}: items[${i}]: ${it.front.text} (${it.key}) duplicates ${seen.get(key)} (two cards for one word)`);
          else seen.set(key, it.key);
        }
      });
    }
    for (const [ex, i] of walkExercises(f)) {
      const shown = norm(ex.display_answer);
      if (ex.type === 'translate' && ex.answer_lang === 'ja' && !ex.answer.accepted.some((a) => norm(a) === shown)) {
        errors.push(`${f.file}: exercises[${i}].display_answer: ${JSON.stringify(ex.display_answer)} is not one of the accepted answers`);
      }
      if (ex.type === 'word_bank') {
        const text = new Map(ex.prompt.tokens.map((t) => [t.id, t.text]));
        const ok = ex.answer.orders.some((order) => norm(order.map((id) => text.get(id) ?? '').join('')) === shown);
        if (!ok) errors.push(`${f.file}: exercises[${i}].display_answer: ${JSON.stringify(ex.display_answer)} does not match any accepted token order`);
      }
    }
  }
  return { errors, warnings };
}
