import { describe, expect, it } from 'vitest';
import { aiRequestSchema } from './ai/contract';
import { AVAILABLE_LANGUAGE_CODES, isLanguageAvailable, LANGUAGE_CODES, LANGUAGES } from './constants';
import { contentKeySchema, itemSchema, TARGET_LANGS } from './content/authoring';
import { ANSWER_LANGS } from './content/exercises';
import { diagnosticFileSchema } from './diagnostic/authoring';
import { examBundleSchema } from './exam/bundle';
import {
  CEFR_LIKE_EXAM_FAMILIES,
  EXAM_FAMILIES,
  EXAM_FAMILY_LANGUAGE,
  GOETHE_PASS_RATIO,
  examFileSchema,
  examScoringSchema,
  isCefrLikeFamily,
} from './exam/contract';
import {
  allowedTargets,
  availableLevels,
  GOALS_BY_LANGUAGE,
  isGoalForLanguage,
  isLevelOf,
  LEVELS,
} from './learning/levels';
import { createPathSchema } from './learning/schemas';
import { PERSONAL_LANGUAGES } from './personal-vocab/contract';

// German is the fourth language, released to learners (available: true) now that content/de ships.
describe('German (de) plumbing', () => {
  it('is a known language that learners can pick', () => {
    expect(LANGUAGE_CODES).toEqual(['en', 'ko', 'ja', 'de']);
    expect(LANGUAGES.de).toEqual({ code: 'de', short: 'DE', nameVi: 'Tiếng Đức', nativeName: 'Deutsch', available: true });
    expect(isLanguageAvailable('de')).toBe(true);
    expect(AVAILABLE_LANGUAGE_CODES).toContain('de');
  });

  it('is accepted by every language enum of the contracts', () => {
    expect(TARGET_LANGS).toContain('de');
    expect(ANSWER_LANGS).toContain('de');
    expect(PERSONAL_LANGUAGES).toContain('de');
    expect(EXAM_FAMILIES).toContain('goethe');
  });

  it('accepts de content keys and German items with article and plural', () => {
    for (const key of ['de:item:a1u03-kaffee', 'de:lesson:a1u03-l1', 'de:exam:goethe-a1-mock-1', 'de:examq:goethe-a1-m1-l01', 'de:diag:voc-a1-tisch']) {
      expect(contentKeySchema.safeParse(key).success, key).toBe(true);
    }
    expect(contentKeySchema.safeParse('ge:item:tisch').success).toBe(false);
    const item = itemSchema.parse({
      key: 'de:item:a1u02-tisch',
      type: 'vocab',
      level: 'a1',
      difficulty: 1,
      front: { text: 'der Tisch, -e' },
      back: { meaning: { vi: 'cái bàn' } },
    });
    expect(item.front.text).toBe('der Tisch, -e');
  });

  it('uses the CEFR scale pre_a1..b2 (no c1/c2) and the foundation / daily / goethe / skill goals', () => {
    expect(LEVELS.de).toEqual(['pre_a1', 'a1', 'a2', 'b1', 'b2']);
    expect(isLevelOf('de', 'b2')).toBe(true);
    expect(isLevelOf('de', 'c1')).toBe(false);
    expect(isLevelOf('de', 'n5')).toBe(false);
    expect(GOALS_BY_LANGUAGE.de).toEqual(['foundation', 'daily_communication', 'goethe', 'skill_focus']);
    expect(isGoalForLanguage('de', 'goethe')).toBe(true);
    expect(isGoalForLanguage('de', 'cefr')).toBe(false);
    expect(isGoalForLanguage('de', 'jlpt')).toBe(false);
    expect(isGoalForLanguage('en', 'goethe')).toBe(false);
  });

  it('creates de learning paths with de goals and CEFR levels only', () => {
    const base = { language: 'de', startPoint: 'new', currentLevel: 'pre_a1', weeklyMinutes: [30, 30, 30, 30, 30, 0, 0], targetDate: null } as const;
    // Goals of other languages and levels outside the scale are rejected whatever the content ceiling is.
    expect(createPathSchema.safeParse({ ...base, goalType: 'jlpt', targetLevel: 'a1' }).success).toBe(false);
    expect(createPathSchema.safeParse({ ...base, goalType: 'cefr', targetLevel: 'a1' }).success).toBe(false);
    expect(createPathSchema.safeParse({ ...base, goalType: 'goethe', targetLevel: 'c1' }).success).toBe(false);
    expect(createPathSchema.safeParse({ ...base, goalType: 'goethe', targetLevel: 'n5' }).success).toBe(false);
    expect(createPathSchema.safeParse({ ...base, goalType: 'goethe', targetLevel: 'pre_a1' }).success).toBe(false);
    expect(createPathSchema.safeParse({ ...base, currentLevel: 'c1', goalType: 'goethe', targetLevel: 'b2' }).success).toBe(false);
    // Every (current, target) pair that has content is a valid Goethe path; the set grows with CONTENT_MAX_LEVEL.
    for (const goalType of ['foundation', 'daily_communication', 'goethe', 'skill_focus'] as const) {
      for (const currentLevel of availableLevels('de')) {
        for (const targetLevel of allowedTargets('de', goalType, currentLevel)) {
          expect(createPathSchema.safeParse({ ...base, startPoint: 'some', currentLevel, goalType, targetLevel }).success, `${goalType} ${currentLevel}→${targetLevel}`).toBe(true);
        }
      }
    }
  });

  it('validates a de diagnostic file', () => {
    const file = {
      schema_version: 1,
      demo: true,
      language: 'de',
      skill: 'vocabulary',
      items: [
        {
          key: 'de:diag:voc-a1-tisch',
          level: 'a1',
          item_type: 'mcq',
          prompt: {
            stem: 'Từ nào có nghĩa là “cái bàn”?',
            stem_lang: 'vi',
            options: [
              { id: 'a', text: 'der Tisch', lang: 'de' },
              { id: 'b', text: 'der Stuhl', lang: 'de' },
            ],
          },
          answer: 'a',
          explanation: { vi: '„der Tisch“ là cái bàn.' },
        },
      ],
    };
    expect(diagnosticFileSchema.safeParse(file).success).toBe(true);
  });

  it('AI requests accept de with CEFR levels', () => {
    expect(aiRequestSchema.safeParse({ task: 'explain_concept', language: 'de', level: 'a1', concept: 'der / die / das' }).success).toBe(true);
    expect(aiRequestSchema.safeParse({ task: 'explain_concept', language: 'de', level: 'pre_a1', concept: 'ä ö ü' }).success).toBe(true);
    expect(aiRequestSchema.safeParse({ task: 'explain_concept', language: 'ge', level: 'a1', concept: 'x' }).success).toBe(false);
  });
});

// Goethe-Zertifikat is judged per module (pass at 60%): goethe forms are scored like cefr, with no conversion.
describe('Goethe exam family', () => {
  const scoring = {
    verified: false,
    source_note_vi: 'Đạt khi đúng từ 60% mỗi phần (theo cách chấm từng modul của Goethe-Zertifikat); chưa đối chiếu.',
    section_max: { listening: 30, reading: 30 },
    bands: [],
    pass_ratio: 0.6,
  };

  it('belongs to de and is cefr-like', () => {
    expect(EXAM_FAMILY_LANGUAGE.goethe).toBe('de');
    expect(Object.keys(EXAM_FAMILY_LANGUAGE).sort()).toEqual([...EXAM_FAMILIES].sort());
    for (const family of EXAM_FAMILIES) expect(LANGUAGE_CODES).toContain(EXAM_FAMILY_LANGUAGE[family]);
    expect(CEFR_LIKE_EXAM_FAMILIES).toEqual(['cefr', 'goethe']);
    expect(isCefrLikeFamily('goethe')).toBe(true);
    expect(isCefrLikeFamily('cefr')).toBe(true);
    expect(isCefrLikeFamily('jlpt')).toBe(false);
    expect(isCefrLikeFamily('topik_i')).toBe(false);
    expect(GOETHE_PASS_RATIO).toBe(0.6);
  });

  it('scoring has no bands and a pass ratio, like cefr', () => {
    expect(examScoringSchema.safeParse(scoring).success).toBe(true);
    expect(examScoringSchema.safeParse({ ...scoring, pass_ratio: null }).success).toBe(true);
  });

  const question = {
    key: 'de:examq:goethe-a1-m1-l01',
    section: 'listening',
    kind: 'mcq',
    question_type: 'goethe_listen_detail',
    level_code: 'a1',
    points: 5,
    prompt: {
      instruction_vi: 'Nghe và chọn đáp án đúng.',
      stem: 'Wann beginnt der Kurs?',
      stem_lang: 'de',
      script: 'Der Kurs beginnt um acht Uhr.',
      options: [
        { id: 'a', text: 'Um acht Uhr.', lang: 'de' },
        { id: 'b', text: 'Um neun Uhr.', lang: 'de' },
      ],
    },
    answer: 'a',
    explanation: { vi: 'Thông báo nói “um acht Uhr”.' },
  };

  it('an authored goethe form parses (de language, goethe_ question types)', () => {
    const file = {
      schema_version: 1,
      demo: true,
      language: 'de',
      form: {
        key: 'de:exam:goethe-a1-mock-1',
        family: 'goethe',
        title_vi: 'Goethe A1 — Đề luyện 1',
        description_vi: 'Bài luyện mô phỏng theo cấu trúc Start Deutsch 1.',
        level_from: 'a1',
        level_to: 'a1',
        source_key: 'src:linguo-demo',
        time_limits: { listening: 20 },
        scoring,
      },
      questions: [question],
    };
    expect(examFileSchema.safeParse(file).success).toBe(true);
    expect(examFileSchema.safeParse({ ...file, form: { ...file.form, family: 'telc' } }).success).toBe(false);
  });

  it('a goethe bundle form parses', () => {
    const HASH = 'a'.repeat(64);
    const bundle = {
      bundle_version: 1,
      forms: [
        {
          id: '0b6f3a52-7c1d-5e4f-8a9b-1c2d3e4f5a6b',
          key: 'de:exam:goethe-a1-mock-1',
          language_code: 'de',
          family: 'goethe',
          title_vi: 'Đề',
          description_vi: 'Mô tả',
          level_from: 'a1',
          level_to: 'a1',
          source_key: 'src:linguo-demo',
          time_limits: { listening: 20 },
          scoring,
          is_demo: true,
          content_hash: HASH,
          reviewed_by: null,
          reviewed_at: null,
          questions: [
            {
              id: '6f1c2b8e-1d3a-5b4c-8d9e-0f1a2b3c4d5e',
              key: question.key,
              seq: 1,
              section: 'listening',
              kind: 'mcq',
              question_type: question.question_type,
              level_code: 'a1',
              points: 5,
              prompt: {
                instruction_vi: 'Nghe và chọn.',
                stem: 'Wann beginnt der Kurs?',
                stem_lang: 'de',
                audio_asset_id: null,
                options: [
                  { id: 'o12345678', text: 'Um acht Uhr.', lang: 'de' },
                  { id: 'o87654321', text: 'Um neun Uhr.', lang: 'de' },
                ],
              },
              answer: 'o12345678',
              explanation: { vi: 'Giải thích.' },
              script: 'Der Kurs beginnt um acht Uhr.',
              rubric: null,
              sample_answer: null,
              content_hash: HASH,
            },
          ],
        },
      ],
    };
    expect(examBundleSchema.safeParse(bundle).success).toBe(true);
    expect(examBundleSchema.safeParse({ ...bundle, forms: [{ ...bundle.forms[0], language_code: 'xx' }] }).success).toBe(false);
  });
});
