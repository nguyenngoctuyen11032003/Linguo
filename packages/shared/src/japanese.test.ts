import { describe, expect, it } from 'vitest';
import { aiRequestSchema } from './ai/contract';
import { AVAILABLE_LANGUAGE_CODES, isLanguageAvailable, LANGUAGE_CODES, LANGUAGES } from './constants';
import { contentKeySchema, itemSchema, ITEM_TYPES, TARGET_LANGS } from './content/authoring';
import { ANSWER_LANGS } from './content/exercises';
import { diagnosticFileSchema } from './diagnostic/authoring';
import { EXAM_FAMILIES, examScoringSchema } from './exam/contract';
import { createPathSchema } from './learning/schemas';
import { PERSONAL_LANGUAGES } from './personal-vocab/contract';

// Japanese is the third learnable language: wired end to end but hidden until its content is published.
describe('Japanese (ja) plumbing', () => {
  it('is a known language that is not offered yet', () => {
    expect(LANGUAGE_CODES).toEqual(['en', 'ko', 'ja']);
    expect(LANGUAGES.ja).toEqual({ code: 'ja', short: 'JA', nameVi: 'Tiếng Nhật', nativeName: '日本語', available: false });
    expect(isLanguageAvailable('ja')).toBe(false);
    expect(AVAILABLE_LANGUAGE_CODES).toEqual(['en', 'ko']);
  });

  it('is accepted by every language enum of the contracts', () => {
    expect(TARGET_LANGS).toContain('ja');
    expect(ANSWER_LANGS).toContain('ja');
    expect(PERSONAL_LANGUAGES).toContain('ja');
    expect(ITEM_TYPES).toContain('kana');
    expect(EXAM_FAMILIES).toContain('jlpt');
  });

  it('accepts ja content keys and kana items with a reading', () => {
    for (const key of ['ja:item:kana-a', 'ja:lesson:n5-desu', 'ja:exam:jlpt-n5-mock-1', 'ja:examq:jlpt-n5-m1-l01', 'ja:diag:voc-n5-neko']) {
      expect(contentKeySchema.safeParse(key).success, key).toBe(true);
    }
    expect(contentKeySchema.safeParse('jp:item:kana-a').success).toBe(false);
    const item = itemSchema.parse({
      key: 'ja:item:gakkou',
      type: 'vocab',
      level: 'n5',
      difficulty: 1,
      front: { text: '学校', reading: 'がっこう', romanization: 'gakkō' },
      back: { meaning: { vi: 'trường học' } },
    });
    expect(item.front.reading).toBe('がっこう');
    expect(itemSchema.safeParse({ ...item, key: 'ja:item:a', type: 'kana', front: { text: 'あ', romanization: 'a' } }).success).toBe(true);
  });

  it('creates ja learning paths with JLPT goals and levels only', () => {
    const base = { language: 'ja', startPoint: 'new', currentLevel: 'kana', weeklyMinutes: [30, 30, 30, 30, 30, 0, 0], targetDate: null } as const;
    expect(createPathSchema.safeParse({ ...base, goalType: 'jlpt', targetLevel: 'n3' }).success).toBe(true);
    expect(createPathSchema.safeParse({ ...base, goalType: 'kana_basics', targetLevel: 'n5' }).success).toBe(true);
    expect(createPathSchema.safeParse({ ...base, goalType: 'topik_i', targetLevel: 'n5' }).success).toBe(false);
    expect(createPathSchema.safeParse({ ...base, goalType: 'jlpt', targetLevel: 'topik2' }).success).toBe(false);
    expect(createPathSchema.safeParse({ ...base, goalType: 'jlpt', targetLevel: 'kana' }).success).toBe(false);
  });

  it('validates a ja diagnostic file', () => {
    const file = {
      schema_version: 1,
      demo: true,
      language: 'ja',
      skill: 'vocabulary',
      items: [
        {
          key: 'ja:diag:voc-n5-neko',
          level: 'n5',
          item_type: 'mcq',
          prompt: {
            stem: 'Từ nào có nghĩa là “con mèo”?',
            stem_lang: 'vi',
            options: [
              { id: 'a', text: 'ねこ', lang: 'ja' },
              { id: 'b', text: 'いぬ', lang: 'ja' },
            ],
          },
          answer: 'a',
          explanation: { vi: '「ねこ」là con mèo.' },
        },
      ],
    };
    expect(diagnosticFileSchema.safeParse(file).success).toBe(true);
  });

  it('JLPT scoring uses section_max and bands like TOPIK', () => {
    const scoring = {
      verified: false,
      source_note_vi: 'Thang điểm theo cấu trúc JLPT tại thời điểm soạn, chưa đối chiếu.',
      section_max: { reading: 120, listening: 60 },
      bands: [{ level_code: 'n5', min_total: 80 }],
      pass_ratio: null,
    };
    expect(examScoringSchema.safeParse(scoring).success).toBe(true);
  });

  it('AI requests accept ja with JLPT levels', () => {
    expect(aiRequestSchema.safeParse({ task: 'explain_concept', language: 'ja', level: 'n5', concept: 'は và が' }).success).toBe(true);
    expect(aiRequestSchema.safeParse({ task: 'explain_concept', language: 'ja', level: 'kana', concept: 'あ' }).success).toBe(true);
    expect(aiRequestSchema.safeParse({ task: 'explain_concept', language: 'jp', level: 'n5', concept: 'x' }).success).toBe(false);
  });
});
