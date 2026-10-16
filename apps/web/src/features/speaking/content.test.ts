import { describe, expect, it } from 'vitest';
import { payload } from '../lesson-player/lesson-fixtures';
import { FALLBACK_SENTENCES, openPromptsFor, ROLE_PLAYS, SENTENCE_MAX_CHARS, sentencesFromLesson } from './content';

function lessonWith(body: unknown[]) {
  const p = payload();
  return { ...p, lesson: { ...p.lesson, body } } as ReturnType<typeof payload>;
}

const example = (target: string, lang: 'en' | 'ko' = 'en') => ({ type: 'example', target, target_lang: lang, translation: { vi: `vi:${target}` } });

describe('sentencesFromLesson', () => {
  it('takes short example sentences of the target language with their translation', () => {
    const lesson = lessonWith([{ type: 'explain', text: { vi: 'x' } }, example('Hello'), example('안녕하세요', 'ko'), example('Good morning')]);
    expect(sentencesFromLesson(lesson, 'en').map((s) => [s.text, s.translation])).toEqual([
      ['Hello', 'vi:Hello'],
      ['Good morning', 'vi:Good morning'],
    ]);
  });
  it('skips long paragraphs and A:/B: dialogues', () => {
    const lesson = lessonWith([example('x'.repeat(SENTENCE_MAX_CHARS + 1)), example("A: What's the matter? B: I've got a headache."), example('My back hurts.')]);
    expect(sentencesFromLesson(lesson, 'en').map((s) => s.text)).toEqual(['My back hurts.']);
  });
  it('gives each sentence a stable unique id', () => {
    const ids = sentencesFromLesson(lessonWith([example('One'), example('Two')]), 'en').map((s) => s.id);
    expect(new Set(ids).size).toBe(2);
  });
});

describe('fixed practice content', () => {
  it('has fallback sentences, open prompts and role-plays for every language', () => {
    for (const lang of ['en', 'ko', 'ja'] as const) {
      expect(FALLBACK_SENTENCES[lang].length).toBeGreaterThan(2);
      expect(openPromptsFor(lang, null).length).toBeGreaterThan(2);
      for (const script of ROLE_PLAYS[lang]) {
        expect(script.turns.some((t) => t.speaker === 'you')).toBe(true);
        expect(script.turns[0]?.speaker).toBe('partner');
      }
    }
  });
  it('puts a lesson-specific open prompt first', () => {
    expect(openPromptsFor('en', 'Chào hỏi')[0]?.question).toContain('Chào hỏi');
  });
});
