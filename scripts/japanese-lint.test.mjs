// Run with: node --test scripts/japanese-lint.test.mjs   (no tsx needed: the lint only reads loaded content objects)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { japaneseLint } from './content/japanese-lint.mjs';

const item = (key, text, reading, type = 'vocab') => ({ key, type, front: { text, ...(reading ? { reading } : {}) } });
const itemsFile = (items, lang = 'ja') => ({ file: 'content/ja/items/x.yaml', kind: 'items', lang, data: { items } });
const lessonFile = (exercises) => ({ file: 'content/ja/programs/p/units/01-u/lessons/01-l.yaml', kind: 'lesson', lang: 'ja', data: { exercises } });

test('a kanji in front.reading is an error (the reading must be kana)', () => {
  const { errors } = japaneseLint([itemsFile([item('ja:item:a', '代わりに', '代わりに'), item('ja:item:b', '学校', 'がっこう')])]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /items\[0\]\.front\.reading/);
});

test('other languages are not checked', () => {
  assert.deepEqual(japaneseLint([itemsFile([item('ko:item:a', '학교', '学校')], 'ko')]), { errors: [], warnings: [] });
});

test('two cards for the same word (same text and reading) are a warning', () => {
  const { errors, warnings } = japaneseLint([itemsFile([item('ja:item:a', '挑戦', 'ちょうせん'), item('ja:item:b', '挑戦', 'ちょうせん')])]);
  assert.equal(errors.length, 0);
  assert.equal(warnings.length, 1);
});

test('display_answer must be gradable: translate (ignoring spaces and punctuation) and word_bank orders', () => {
  const good = lessonFile([
    { type: 'translate', answer_lang: 'ja', answer: { accepted: ['私は、学生です。'] }, display_answer: '私は 学生です' },
    { type: 'word_bank', prompt: { tokens: [{ id: 't1', text: 'わたしは' }, { id: 't2', text: 'がくせいです。' }] }, answer: { orders: [['t1', 't2']] }, display_answer: 'わたしはがくせいです。' },
  ]);
  assert.deepEqual(japaneseLint([good]).errors, []);
  const bad = lessonFile([
    { type: 'translate', answer_lang: 'ja', answer: { accepted: ['私は学生です。'] }, display_answer: '私は先生です。' },
    { type: 'word_bank', prompt: { tokens: [{ id: 't1', text: 'わたしは' }, { id: 't2', text: 'がくせいです。' }] }, answer: { orders: [['t1', 't2']] }, display_answer: 'わたしはせんせいです。' },
  ]);
  assert.equal(japaneseLint([bad]).errors.length, 2);
});

test('the real ja content passes', async () => {
  const { loadContent } = await import('./content/load.mjs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'content');
  const loaded = loadContent(root, { label: 'content' });
  assert.deepEqual(japaneseLint(loaded.files).errors, []);
});
