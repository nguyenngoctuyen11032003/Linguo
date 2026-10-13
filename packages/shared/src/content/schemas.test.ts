import { describe, expect, it } from 'vitest';
import { lessonFileSchema } from './authoring';
import { bundleSchema } from './bundle';
import { EXERCISE_TYPES, PROMPT_SCHEMAS, fillBlankPromptSchema, responseSchemaFor } from './exercises';
import { lessonPayloadSchema } from './rpc';

const options = [
  { id: 'a', text: 'Hello', lang: 'en' },
  { id: 'b', text: 'Goodbye', lang: 'en' },
];

const VALID_PROMPTS = {
  mcq: { stem: 'Chọn lời chào', stem_lang: 'vi', options, shuffle: true },
  fill_blank: { template: 'Nice to {{b1}} you', blanks: [{ id: 'b1' }] },
  word_bank: { instruction: 'Sắp xếp câu', tokens: [{ id: 'i', text: 'I' }, { id: 'am', text: 'am' }] },
  translate: { source_text: 'Xin chào', source_lang: 'vi', direction: 'vi_to_target' },
  listen: { audio_asset_id: null, fallback_text: 'Hello', options, shuffle: true },
} as const;

const LEAKS = [
  { correct_option_id: 'a' },
  { accepted: ['Hello'] },
  { orders: [['i', 'am']] },
  { answer: { blanks: { b1: ['meet'] } } },
];

describe('prompt schemas never carry answer keys', () => {
  for (const type of EXERCISE_TYPES) {
    it(`${type} accepts a valid prompt and rejects answer fields`, () => {
      const prompt = VALID_PROMPTS[type];
      expect(PROMPT_SCHEMAS[type].safeParse(prompt).success).toBe(true);
      for (const leak of LEAKS) expect(PROMPT_SCHEMAS[type].safeParse({ ...prompt, ...leak }).success).toBe(false);
    });
  }

  it('fill_blank rejects a blank id missing from the template', () => {
    const r = fillBlankPromptSchema.safeParse({ template: 'Nice to {{b1}} you', blanks: [{ id: 'b1' }, { id: 'b2' }] });
    expect(r.success).toBe(false);
  });
});

describe('responseSchemaFor', () => {
  it('mcq accepts option_id and give_up, rejects text', () => {
    const s = responseSchemaFor('mcq');
    expect(s.safeParse({ option_id: 'b' }).success).toBe(true);
    expect(s.safeParse({ give_up: true }).success).toBe(true);
    expect(s.safeParse({ text: 'b' }).success).toBe(false);
  });
});

const exercise = (key: string, extra: Record<string, unknown>) => ({
  key,
  explanation: { vi: 'Giải thích.' },
  display_answer: 'Hello',
  answer_lang: 'en',
  ...extra,
});

const lesson = {
  schema_version: 1,
  demo: true,
  key: 'en:lesson:greetings-hello',
  order_index: 0,
  level: 'A1',
  title: { vi: 'Chào hỏi' },
  objectives: [{ vi: 'Chào hỏi cơ bản' }],
  estimated_minutes: 10,
  skills: ['speaking'],
  body: [
    { type: 'objective', text: { vi: 'Mục tiêu' } },
    { type: 'explain', text: { vi: 'Giải thích' } },
    { type: 'example', target: 'Hello!', target_lang: 'en', translation: { vi: 'Xin chào!' } },
    { type: 'common_mistake', wrong: 'Hello you', right: 'Hello', target_lang: 'en', note: { vi: 'Không thêm you.' } },
    { type: 'summary', points: [{ vi: 'Hello = xin chào' }] },
  ],
  exercises: [
    exercise('en:ex:hello-mcq', {
      type: 'mcq',
      stage: 'recognition',
      prompt: VALID_PROMPTS.mcq,
      answer: { correct_option_id: 'a' },
    }),
    exercise('en:ex:hello-fill', {
      type: 'fill_blank',
      stage: 'recall',
      prompt: VALID_PROMPTS.fill_blank,
      answer: { blanks: { b1: ['meet'] } },
    }),
    exercise('en:ex:hello-translate', {
      type: 'translate',
      stage: 'application',
      prompt: VALID_PROMPTS.translate,
      answer: { accepted: ['Hello', 'Hi', 'Hello there'] },
    }),
  ],
};

describe('lessonFileSchema', () => {
  it('parses a minimal valid lesson with defaults', () => {
    const parsed = lessonFileSchema.parse(lesson);
    expect(parsed.status).toBe('draft');
    expect(parsed.exercises).toHaveLength(3);
    expect(parsed.exercises[0]!.rubric.punctuation).toBe('ignore');
  });

  it('rejects a lesson with only 2 exercises', () => {
    expect(lessonFileSchema.safeParse({ ...lesson, exercises: lesson.exercises.slice(0, 2) }).success).toBe(false);
  });
});

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const hash = 'a'.repeat(64);
const review = { status: 'published', is_demo: true, reviewed_by: null, reviewed_at: null, content_hash: hash };

const bundleExercise = {
  id: uuid(10),
  key: 'en:ex:hello-mcq',
  source_id: uuid(1),
  lesson_id: uuid(4),
  item_id: null,
  order_index: 0,
  exercise_type: 'mcq',
  stage: 'recognition',
  answer_lang: 'en',
  difficulty: 1,
  prompt: VALID_PROMPTS.mcq,
  ...review,
  key_data: {
    answer_key: { correct_option_id: 'a' },
    rubric: { punctuation: 'ignore', diacritics: 'strict', ko_spacing: 'lenient', typo_tolerance: 0, expand_contractions: true },
    known_wrong: [],
    explanation: { vi: 'Giải thích.' },
    display_answer: 'Hello',
  },
};

const bundle = {
  bundle_version: 1,
  git_sha: null,
  sources: [],
  programs: [],
  units: [],
  lessons: [],
  lesson_prerequisites: [],
  learning_items: [],
  lesson_items: [],
  exercises: [bundleExercise],
};

describe('bundleSchema', () => {
  it('accepts an exercise with key_data', () => {
    expect(bundleSchema.safeParse(bundle).success).toBe(true);
  });

  it('rejects an exercise without key_data', () => {
    const withoutKey: Record<string, unknown> = { ...bundleExercise };
    delete withoutKey.key_data;
    expect(bundleSchema.safeParse({ ...bundle, exercises: [withoutKey] }).success).toBe(false);
  });
});

describe('lessonPayloadSchema', () => {
  it('parses a sample payload', () => {
    const payload = {
      lesson: {
        id: uuid(4),
        key: 'en:lesson:greetings-hello',
        language_code: 'en',
        level_code: 'A1',
        title: { vi: 'Chào hỏi' },
        objectives: [{ vi: 'Chào hỏi cơ bản' }],
        body: lesson.body,
        estimated_minutes: 10,
        skills: ['speaking'],
        content_version: 1,
        is_demo: true,
        unit_title: { vi: 'Bài mở đầu' },
        program_title: { vi: 'Tiếng Anh cơ bản' },
      },
      items: [],
      exercises: [
        {
          id: uuid(10),
          key: 'en:ex:hello-mcq',
          version: 1,
          order_index: 0,
          type: 'mcq',
          stage: 'recognition',
          answer_lang: 'en',
          item_id: null,
          difficulty: 1,
          prompt: VALID_PROMPTS.mcq,
        },
      ],
      run: null,
      attempts: [],
    };
    expect(lessonPayloadSchema.safeParse(payload).success).toBe(true);
  });
});
