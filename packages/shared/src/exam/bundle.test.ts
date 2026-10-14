import { describe, expect, it } from 'vitest';
import { examBundleSchema } from './bundle';

const HASH = 'a'.repeat(64);

const question = {
  id: '6f1c2b8e-1d3a-5b4c-8d9e-0f1a2b3c4d5e',
  key: 'ko:examq:mock-l01',
  seq: 1,
  section: 'listening',
  kind: 'mcq',
  question_type: 'topik_i_listen_place',
  level_code: 'topik1',
  points: 3,
  prompt: { instruction_vi: 'Nghe và chọn.', stem: '어디입니까?', stem_lang: 'ko', audio_asset_id: null, options: [{ id: 'o12345678', text: '은행', lang: 'ko' }, { id: 'o87654321', text: '시장', lang: 'ko' }] },
  answer: 'o12345678',
  explanation: { vi: 'Giải thích.' },
  script: '남자: 돈을 찾고 싶어요.',
  rubric: null,
  sample_answer: null,
  content_hash: HASH,
};

const form = {
  id: '0b6f3a52-7c1d-5e4f-8a9b-1c2d3e4f5a6b',
  key: 'ko:exam:mock',
  language_code: 'ko',
  family: 'topik_i',
  title_vi: 'Đề',
  description_vi: 'Mô tả',
  level_from: 'topik1',
  level_to: 'topik2',
  source_key: 'src:linguo-demo',
  time_limits: { listening: 15 },
  scoring: { verified: false, source_note_vi: 'Chưa đối chiếu.', section_max: { listening: 100 }, bands: [{ level_code: 'topik1', min_total: 80 }], pass_ratio: null },
  is_demo: true,
  content_hash: HASH,
  reviewed_by: null,
  reviewed_at: null,
  questions: [question],
};

describe('examBundleSchema', () => {
  it('accepts a minimal bundle', () => {
    expect(examBundleSchema.safeParse({ bundle_version: 1, forms: [form] }).success).toBe(true);
  });

  it('keeps the script out of the public prompt', () => {
    const leaked = { ...question, prompt: { ...question.prompt, script: 'x' } };
    expect(examBundleSchema.safeParse({ bundle_version: 1, forms: [{ ...form, questions: [leaked] }] }).success).toBe(false);
  });

  it('accepts short_text and essay keys', () => {
    const short = { ...question, kind: 'short_text', answer: ['가', '나'], script: null };
    const essay = { ...question, kind: 'essay', answer: null, script: null, rubric: [{ key: 'content', label_vi: 'Nội dung', description_vi: 'x', max_points: 10 }], sample_answer: '예문' };
    expect(examBundleSchema.safeParse({ bundle_version: 1, forms: [{ ...form, questions: [short, essay] }] }).success).toBe(true);
  });

  it('rejects unknown fields and other bundle versions', () => {
    expect(examBundleSchema.safeParse({ bundle_version: 2, forms: [] }).success).toBe(false);
    expect(examBundleSchema.safeParse({ bundle_version: 1, forms: [{ ...form, status: 'published' }] }).success).toBe(false);
  });
});
