import {
  examFormSummarySchema,
  examHistoryEntrySchema,
  examResultSchema,
  examServedQuestionSchema,
  type ExamFormSummary,
  type ExamHistoryEntry,
  type ExamResult,
  type ExamServedQuestion,
} from '@linguo/shared';

// Test fixtures for the presentational exam components, parsed with the contract schemas so they
// break loudly if the RPC shapes change. Original demo content, not taken from any official paper.

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const FORM_ID = uuid(1);
export const ATTEMPT_ID = uuid(2);

export const TOPIK_FORM: ExamFormSummary = examFormSummarySchema.parse({
  form_id: FORM_ID,
  key: 'topik-i-mock-1',
  language_code: 'ko',
  family: 'topik_i',
  title_vi: 'TOPIK I — Đề luyện số 1',
  description_vi: 'Nghe và đọc ở trình độ sơ cấp.',
  level_from: 'topik1',
  level_to: 'topik2',
  is_demo: true,
  sections: [
    { section: 'listening', question_count: 10, minutes: 15 },
    { section: 'reading', question_count: 14, minutes: 25 },
  ],
  question_types: [
    { question_type: 'topik_i_listen_response', section: 'listening', count: 4 },
    { question_type: 'topik_i_listen_detail', section: 'listening', count: 6 },
    { question_type: 'topik_i_read_topic', section: 'reading', count: 5 },
    { question_type: 'topik_i_read_mystery_9', section: 'reading', count: 9 },
  ],
  scoring_verified: false,
  last_attempt: { attempt_id: ATTEMPT_ID, submitted_at: '2026-10-10T09:00:00Z', total: 62, max: 96 },
});

export const CEFR_FORM: ExamFormSummary = examFormSummarySchema.parse({
  ...TOPIK_FORM,
  form_id: uuid(3),
  key: 'cefr-a2-mock-1',
  language_code: 'en',
  family: 'cefr',
  title_vi: 'CEFR A2 — Đề luyện số 1',
  level_from: 'a2',
  level_to: 'a2',
  is_demo: false,
  sections: [
    { section: 'listening', question_count: 8, minutes: null },
    { section: 'reading', question_count: 10, minutes: 20 },
    { section: 'writing', question_count: 1, minutes: 20 },
  ],
  question_types: [{ question_type: 'cefr_write_email', section: 'writing', count: 1 }],
  scoring_verified: true,
  last_attempt: null,
});

export const MCQ_QUESTION: ExamServedQuestion = examServedQuestionSchema.parse({
  question_id: uuid(11),
  seq: 1,
  section: 'reading',
  kind: 'mcq',
  question_type: 'topik_i_read_topic',
  points: 4,
  prompt: {
    instruction_vi: 'Đọc đoạn văn và chọn chủ đề phù hợp.',
    stem: '무엇에 대한 이야기입니까?',
    stem_lang: 'ko',
    passage: '저는 주말마다 공원에서 자전거를 탑니다.\n날씨가 좋으면 친구와 같이 갑니다.',
    audio_asset_id: null,
    options: [
      { id: 'a', text: '운동', lang: 'ko' },
      { id: 'b', text: '음식', lang: 'ko' },
      { id: 'c', text: '여행', lang: 'ko' },
      { id: 'd', text: '날씨', lang: 'ko' },
    ],
  },
  answer: null,
  flagged: false,
});

export const SHORT_QUESTION: ExamServedQuestion = examServedQuestionSchema.parse({
  question_id: uuid(12),
  seq: 2,
  section: 'writing',
  kind: 'short_text',
  question_type: 'topik_ii_write_51',
  points: 5,
  prompt: {
    instruction_vi: 'Điền một câu phù hợp vào chỗ trống.',
    stem: '내일 같이 영화를 보러 갈까요? 시간이 ( ㉠ ).',
    stem_lang: 'ko',
    audio_asset_id: null,
  },
  answer: '시간이 있어요',
  flagged: true,
});

export const ESSAY_QUESTION: ExamServedQuestion = examServedQuestionSchema.parse({
  question_id: uuid(13),
  seq: 3,
  section: 'writing',
  kind: 'essay',
  question_type: 'cefr_write_email',
  points: 20,
  prompt: {
    instruction_vi: 'Viết email ngắn cho bạn.',
    stem: 'Write an email to your friend about your weekend.',
    stem_lang: 'en',
    audio_asset_id: null,
    min_chars: 20,
    max_chars: 40,
  },
  answer: null,
  flagged: false,
});

export const LISTEN_QUESTION: ExamServedQuestion = examServedQuestionSchema.parse({
  question_id: uuid(14),
  seq: 4,
  section: 'listening',
  kind: 'mcq',
  question_type: 'topik_i_listen_response',
  points: 4,
  prompt: {
    instruction_vi: 'Nghe và chọn câu đáp lại phù hợp.',
    stem: '알맞은 대답을 고르십시오.',
    stem_lang: 'ko',
    audio_asset_id: null,
    tts_text: '가방이 있어요?',
    options: [
      { id: 'a', text: '네, 가방이 있어요.', lang: 'ko' },
      { id: 'b', text: '아니요, 학생이에요.', lang: 'ko' },
    ],
  },
  answer: 'a',
  flagged: false,
});

export const QUESTIONS: ExamServedQuestion[] = [LISTEN_QUESTION, MCQ_QUESTION, SHORT_QUESTION, ESSAY_QUESTION].map((q, i) => ({
  ...q,
  seq: i + 1,
}));

const BASE_RESULT = {
  attempt_id: ATTEMPT_ID,
  form_id: FORM_ID,
  form_title_vi: 'TOPIK I — Đề luyện số 1',
  family: 'topik_i',
  mode: 'full',
  status: 'submitted',
  started_at: '2026-10-12T08:00:00Z',
  submitted_at: '2026-10-12T08:40:00Z',
  total: 8,
  max: 13,
  by_section: [
    { section: 'listening', points: 4, max: 4, correct: 1, total: 1, scaled: 100 },
    { section: 'reading', points: 0, max: 4, correct: 0, total: 1, scaled: 0 },
    { section: 'writing', points: 4, max: 5, correct: 1, total: 1, scaled: 80 },
  ],
  by_question_type: [
    { question_type: 'topik_i_listen_response', section: 'listening', points: 4, max: 4, correct: 1, total: 1 },
    { question_type: 'topik_i_read_topic', section: 'reading', points: 0, max: 4, correct: 0, total: 2 },
    { question_type: 'topik_ii_write_51', section: 'writing', points: 4, max: 5, correct: 3, total: 4 },
  ],
  estimated_level: { level_code: 'topik1', scaled_total: 92.5, label_vi: 'TOPIK 1' },
  cefr_sections: null,
  scoring_verified: false,
  scoring_source_vi: 'Thang điểm TOPIK tại thời điểm soạn, cần đối chiếu quy chế hiện hành.',
  review: [
    {
      question_id: LISTEN_QUESTION.question_id,
      seq: 1,
      section: 'listening',
      kind: 'mcq',
      question_type: 'topik_i_listen_response',
      points: 4,
      prompt: { ...LISTEN_QUESTION.prompt, script: '가: 가방이 있어요?\n나: 네, 가방이 있어요.' },
      answer: 'a',
      is_correct: true,
      correct_answer: 'a',
      explanation: { vi: 'Câu hỏi "có túi không" nên đáp "có".' },
      rubric: null,
      sample_answer: null,
    },
    {
      question_id: MCQ_QUESTION.question_id,
      seq: 2,
      section: 'reading',
      kind: 'mcq',
      question_type: 'topik_i_read_topic',
      points: 4,
      prompt: MCQ_QUESTION.prompt,
      answer: 'b',
      is_correct: false,
      correct_answer: 'a',
      explanation: { vi: 'Đạp xe là một môn thể thao (운동).' },
      rubric: null,
      sample_answer: null,
    },
    {
      question_id: SHORT_QUESTION.question_id,
      seq: 3,
      section: 'writing',
      kind: 'short_text',
      question_type: 'topik_ii_write_51',
      points: 5,
      prompt: SHORT_QUESTION.prompt,
      answer: null,
      is_correct: false,
      correct_answer: '시간이 있어요',
      explanation: { vi: 'Cần một câu trả lời về thời gian rảnh.' },
      rubric: null,
      sample_answer: null,
    },
    {
      question_id: ESSAY_QUESTION.question_id,
      seq: 4,
      section: 'writing',
      kind: 'essay',
      question_type: 'cefr_write_email',
      points: 20,
      prompt: ESSAY_QUESTION.prompt,
      answer: 'Hi Sam, I went hiking on Saturday.',
      is_correct: null,
      correct_answer: null,
      explanation: { vi: 'Email cần lời chào, nội dung chính và lời kết.' },
      rubric: [
        { key: 'task', label_vi: 'Hoàn thành yêu cầu', description_vi: 'Nêu đủ các ý được hỏi.', max_points: 10 },
        { key: 'language', label_vi: 'Ngôn ngữ', description_vi: 'Dùng từ và ngữ pháp chính xác.', max_points: 10 },
      ],
      sample_answer: 'Hi Sam,\nLast weekend I went hiking with my sister.\nBest, Lan',
    },
  ],
};

export const TOPIK_RESULT: ExamResult = examResultSchema.parse(BASE_RESULT);

export const CEFR_RESULT: ExamResult = examResultSchema.parse({
  ...BASE_RESULT,
  family: 'cefr',
  form_title_vi: 'CEFR A2 — Đề luyện số 1',
  estimated_level: null,
  cefr_sections: [
    { section: 'reading', level_code: 'a2', reached: true },
    { section: 'listening', level_code: 'a2', reached: false },
  ],
  scoring_verified: true,
});

export const GOETHE_RESULT: ExamResult = examResultSchema.parse({
  ...BASE_RESULT,
  family: 'goethe',
  form_title_vi: 'Goethe A2 — Đề luyện số 1',
  estimated_level: null,
  cefr_sections: [
    { section: 'reading', level_code: 'a2', reached: true },
    { section: 'listening', level_code: 'a2', reached: false },
  ],
  scoring_verified: true,
});

export const HISTORY: ExamHistoryEntry[] = [
  {
    attempt_id: uuid(21),
    form_title_vi: 'TOPIK I — Đề luyện số 1',
    family: 'topik_i',
    mode: 'full',
    section: null,
    status: 'submitted',
    started_at: '2026-10-12T08:00:00Z',
    submitted_at: '2026-10-12T08:40:00Z',
    total: 62,
    max: 96,
    estimated_level_code: 'topik1',
    scoring_verified: false,
  },
  {
    attempt_id: uuid(22),
    form_title_vi: 'TOPIK I — Đề luyện số 1',
    family: 'topik_i',
    mode: 'section',
    section: 'reading',
    status: 'in_progress',
    started_at: '2026-10-13T08:00:00Z',
    submitted_at: null,
    total: null,
    max: null,
    estimated_level_code: null,
    scoring_verified: false,
  },
  {
    attempt_id: uuid(23),
    form_title_vi: 'TOPIK I — Đề luyện số 1',
    family: 'topik_i',
    mode: 'full',
    section: null,
    status: 'expired',
    started_at: '2026-10-09T08:00:00Z',
    submitted_at: '2026-10-09T08:41:00Z',
    total: 30,
    max: 96,
    estimated_level_code: null,
    scoring_verified: false,
  },
].map((e) => examHistoryEntrySchema.parse(e));
