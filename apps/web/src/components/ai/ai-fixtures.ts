import type { AiError, AiSuccess } from '@linguo/shared';

export const QUOTA = { used: 3, limit: 20, resets_at: '2026-10-13T17:00:00Z' };

export function aiSuccess(task: AiSuccess['task'], data: unknown, overrides: Partial<AiSuccess> = {}): AiSuccess {
  return { task, prompt_version: 'v1', data, cached: false, ai_generated: true, response_id: 'usage-1', quota: QUOTA, ...overrides };
}

export const EXPLAIN_DATA = {
  summary: 'Present perfect nối quá khứ với hiện tại.',
  explanation_md: 'Dùng **have/has + V3**.',
  examples: [{ target: 'I have lived here for two years.', vi: 'Tôi đã sống ở đây hai năm.' }],
  common_mistakes: ['Dùng với mốc thời gian quá khứ cụ thể.'],
  confidence: 'high',
  uncertainty: null,
};

export const ANALYZE_DATA = {
  verdict: 'incorrect',
  error_type: 'Chia động từ',
  explanation_md: 'Chủ ngữ số ít cần **has**.',
  corrected: 'She has finished.',
  tip_vi: 'Nhìn chủ ngữ trước khi chọn have/has.',
};

export const PRACTICE_DATA = {
  items: [
    { question: 'I ___ here since 2020.', options: ['live', 'have lived', 'lived'], answer: 'have lived', explanation_vi: 'Có "since" nên dùng present perfect.' },
    { question: 'She ___ to Paris last year.', options: ['has gone', 'went'], answer: 'went', explanation_vi: 'Mốc "last year" dùng quá khứ đơn.' },
  ],
};

export function aiError(error: AiError['error'], overrides: Partial<AiError> = {}): AiError {
  return { error, message: 'x', retry_after_sec: null, quota: null, ...overrides };
}

export const SENTENCE_DATA = {
  translation_vi: 'Tôi là học sinh.',
  alternative_meanings: ['Tôi đang là học sinh (nhấn mạnh nghề).'],
  tokens: [
    { text: '저', pos: 'pronoun', meaning_vi: 'tôi' },
    { text: '는', pos: 'particle', meaning_vi: 'tiểu từ chủ đề' },
    { text: '학생', pos: 'noun', meaning_vi: 'học sinh' },
    { text: '이에요', pos: 'ending', meaning_vi: 'là (lịch sự)' },
  ],
  components: [{ label: 'topic', text: '저는', note_vi: 'Chủ đề của câu.' }],
  grammar_points: [{ pattern: '-이에요/예요', explanation_vi: 'Đuôi câu "là" lịch sự.' }],
  confidence: 'high',
  uncertainty: null,
};

export const SUMMARY_DATA = {
  recap_vi: 'Hôm nay bạn đã học 12 phút và ôn thẻ rất đều.',
  errors_to_remember: [{ tag: 'article', note_vi: 'Nhớ a/an/the trước danh từ đếm được.' }],
  next_step_vi: 'Mai ôn 10 thẻ đầu tiên nhé.',
};

export const PLAN_LESSON_ID = '11111111-1111-4111-8111-111111111111';

export const PLAN_DATA = {
  summary_vi: 'Ưu tiên học lại bài present simple rồi ôn thẻ trắc nghiệm.',
  steps: [
    { kind: 'redo_lesson', target: PLAN_LESSON_ID, cards: null, reason_vi: 'Bạn sai bài này 4 lần.' },
    { kind: 'review_cards', target: 'mcq', cards: 10, reason_vi: 'Trắc nghiệm còn nhiều lỗi.' },
  ],
};

export const WRITING_DATA = {
  criteria: [
    { key: 'content', points: 3, comment_vi: 'Có phim và giờ gặp, còn thiếu chỗ gặp.' },
    { key: 'language', points: 2, comment_vi: 'Viết "Let\'s" có dấu nháy.' },
  ],
  overall_vi: 'Bài rõ ý; bổ sung chỗ gặp.',
  corrected_version: "Hi Alex, let's watch Toy Story on Saturday at 6 outside the cinema. See you, Lan",
};
