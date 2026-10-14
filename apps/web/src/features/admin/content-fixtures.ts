import type { AdminAiUsage, AdminAnalytics, AdminContentDetail, AdminContentList, AdminContentRow } from '@linguo/shared';

// Shared test fixtures for the admin content + analytics pages (spec 11 §4).

export const EXERCISE_ID = 'e0000000-0000-4000-8000-000000000001';
export const ITEM_ID = 'e0000000-0000-4000-8000-000000000002';
export const QUESTION_ID = 'e0000000-0000-4000-8000-000000000003';
export const LESSON_ID = 'e0000000-0000-4000-8000-000000000004';
export const SOURCE_ID = 'e0000000-0000-4000-8000-0000000000aa';

export function contentRowFixture(overrides: Partial<AdminContentRow> = {}): AdminContentRow {
  return {
    id: LESSON_ID,
    kind: 'lesson',
    key: 'en:lesson:i-am',
    label: 'Tôi là…',
    language_code: 'en',
    status: 'published',
    is_demo: true,
    version: 2,
    updated_at: '2026-10-10T08:00:00Z',
    open_reports: 0,
    ...overrides,
  };
}

export function contentListFixture(count = 3, total = count): AdminContentList {
  const items = Array.from({ length: count }, (_, i) =>
    contentRowFixture({
      id: `e0000000-0000-4000-8000-1000000000${String(i).padStart(2, '0')}`,
      key: `en:lesson:l${i}`,
      label: `Bài ${i + 1}`,
      open_reports: i === 0 ? 2 : 0,
    }),
  );
  return { items, total };
}

const SOURCE = {
  id: SOURCE_ID,
  key: 'src:linguo-demo',
  name: 'Linguo demo',
  license: 'own',
  attribution: null,
  url: null,
};

export function exerciseDetailFixture(overrides: Partial<AdminContentDetail> = {}): AdminContentDetail {
  return {
    kind: 'exercise',
    id: EXERCISE_ID,
    key: 'en:exercise:i-am-mcq-is',
    status: 'approved',
    is_demo: false,
    version: 3,
    reviewed_by: null,
    reviewed_at: null,
    row: {
      id: EXERCISE_ID,
      key: 'en:exercise:i-am-mcq-is',
      source_id: SOURCE_ID,
      lesson_id: LESSON_ID,
      item_id: null,
      order_index: 1,
      exercise_type: 'mcq',
      stage: 'recognition',
      answer_lang: 'en',
      difficulty: 1,
      prompt: {
        stem: 'Chọn từ đúng cho chỗ trống: She ___ a teacher.',
        stem_lang: 'vi',
        options: [
          { id: 'p3a', text: 'am', lang: 'en' },
          { id: 'f8e', text: 'is', lang: 'en' },
          { id: 'y1m', text: 'are', lang: 'en' },
        ],
      },
      status: 'approved',
      is_demo: false,
      version: 3,
      content_hash: 'a'.repeat(64),
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-10T00:00:00Z',
    },
    private: {
      answer_key: { correct_option_id: 'f8e' },
      rubric: {},
      known_wrong: [],
      explanation: { vi: 'She là ngôi thứ ba số ít, nên đi với is.' },
      display_answer: 'is',
    },
    source: SOURCE,
    revisions: [
      { version: 3, content_hash: 'c'.repeat(64), created_at: '2026-10-10T00:00:00Z', detail: null },
      { version: 2, content_hash: 'b'.repeat(64), created_at: '2026-10-05T00:00:00Z', detail: null },
    ],
    repo_path: 'content/en/programs/foundation/units/01-greetings/lessons/02-i-am.yaml',
    ...overrides,
  };
}

export function itemDetailFixture(): AdminContentDetail {
  return {
    kind: 'learning_item',
    id: ITEM_ID,
    key: 'en:item:hello',
    status: 'published',
    is_demo: true,
    version: 1,
    reviewed_by: null,
    reviewed_at: null,
    row: {
      id: ITEM_ID,
      key: 'en:item:hello',
      language_code: 'en',
      item_type: 'vocab',
      level_code: 'pre_a1',
      difficulty: 1,
      skill_tags: ['vocabulary'],
      front: { text: 'hello', ipa: '/həˈləʊ/' },
      back: { meaning: { vi: 'xin chào' }, examples: [{ target: "Hello, I'm Minh.", translation: { vi: 'Xin chào, mình là Minh.' } }] },
      audio_path: null,
    },
    private: null,
    source: SOURCE,
    revisions: [],
    repo_path: 'content/en/items/greetings.yaml',
  };
}

export function examQuestionDetailFixture(): AdminContentDetail {
  return {
    kind: 'exam_question',
    id: QUESTION_ID,
    key: 'en:examq:cefr-a2-m1-l01',
    status: 'published',
    is_demo: true,
    version: null,
    reviewed_by: null,
    reviewed_at: null,
    row: {
      id: QUESTION_ID,
      key: 'en:examq:cefr-a2-m1-l01',
      seq: 1,
      section: 'reading',
      kind: 'mcq',
      question_type: 'cefr_read_detail',
      level_code: 'a2',
      points: 1,
      prompt: {
        instruction_vi: 'Đọc và chọn đáp án đúng.',
        stem: 'What time will they see the film?',
        stem_lang: 'en',
        audio_asset_id: null,
        options: [
          { id: 'a', text: '6:00', lang: 'en' },
          { id: 'c', text: '8:00', lang: 'en' },
        ],
      },
    },
    private: { answer: 'c', explanation: { vi: 'Họ chọn suất 8 giờ.' }, script: 'Woman: Shall we…' },
    source: null,
    revisions: [],
    repo_path: 'content/exams/en/cefr-a2-mock-1.yaml',
  };
}

export function lessonDetailFixture(): AdminContentDetail {
  return {
    kind: 'lesson',
    id: LESSON_ID,
    key: 'en:lesson:i-am',
    status: 'draft',
    is_demo: false,
    version: 1,
    reviewed_by: null,
    reviewed_at: null,
    row: { id: LESSON_ID, key: 'en:lesson:i-am', title: { vi: 'Tôi là…' }, level_code: 'pre_a1', objectives: [{ vi: 'Giới thiệu bản thân' }] },
    private: null,
    source: null,
    revisions: [],
    repo_path: null,
  };
}

export function analyticsFixture(days = 7): AdminAnalytics {
  return {
    days,
    daily: Array.from({ length: days }, (_, i) => ({
      day: `2026-10-${String(1 + i).padStart(2, '0')}`,
      dau: 10 + i,
      lessons_completed: 20 + i,
      review_sessions: 5,
      exam_attempts: i % 2,
    })),
    wau: 42,
    onboarding_completed: 30,
    funnel: { signed_up: 100, onboarded: 80, first_lesson: 60, third_lesson: 30, returned_day7: 15 },
  };
}

export function aiUsageFixture(days = 7): AdminAiUsage {
  return {
    days,
    by_task: [
      { task: 'explain_concept', status: 'ok', count: 120 },
      { task: 'explain_concept', status: 'error', count: 3 },
      { task: 'analyze_error', status: 'ok', count: 40 },
    ],
    cache_hit_rate: 0.375,
    latency_p50_ms: 820,
    latency_p95_ms: 2450.4,
    reports_by_reason: { wrong: 4, unclear: 1 },
  };
}
