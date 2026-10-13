import type { ExamAttempt, ExamFormSummary, ExamHistoryEntry, ExamResult, ExamServedQuestion } from '@linguo/shared';

// Valid (zod-parseable) exam payloads shared by the exam unit tests and UI work. Original practice content
// ("bài luyện mô phỏng"), never copied from official papers.

export const PATH_ID = '30000000-0000-4000-8000-000000000001';
export const TOPIK_I_FORM_ID = 'e0000000-0000-4000-8000-000000000001';
export const TOPIK_II_FORM_ID = 'e0000000-0000-4000-8000-000000000002';
export const ATTEMPT_ID = 'e1000000-0000-4000-8000-000000000001';

/** Server clock of the in-progress fixture attempt: 10 minutes into a 70-minute mock. */
export const SERVER_NOW = '2026-10-13T02:10:00.000Z';
export const STARTED_AT = '2026-10-13T02:00:00.000Z';
export const DEADLINE_AT = '2026-10-13T03:10:00.000Z';

export function examQuestionId(n: number): string {
  return `e2000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

export function examHistoryAttemptId(n: number): string {
  return `e3000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

/** TOPIK I mini mock (listening + reading), last taken a week ago. */
export function topikIForm(overrides: Partial<ExamFormSummary> = {}): ExamFormSummary {
  return {
    form_id: TOPIK_I_FORM_ID,
    key: 'topik-i-mini-01',
    language_code: 'ko',
    family: 'topik_i',
    title_vi: 'TOPIK I — Đề mini số 1',
    description_vi: 'Bài luyện mô phỏng TOPIK I rút gọn: nghe và đọc, 20 câu, phù hợp trình độ sơ cấp.',
    level_from: 'topik1',
    level_to: 'topik2',
    is_demo: true,
    sections: [
      { section: 'listening', question_count: 10, minutes: 15 },
      { section: 'reading', question_count: 10, minutes: 20 },
    ],
    question_types: [
      { question_type: 'topik_i_listen_response', section: 'listening', count: 5 },
      { question_type: 'topik_i_listen_detail', section: 'listening', count: 5 },
      { question_type: 'topik_i_read_topic', section: 'reading', count: 4 },
      { question_type: 'topik_i_read_detail', section: 'reading', count: 6 },
    ],
    scoring_verified: false,
    last_attempt: {
      attempt_id: examHistoryAttemptId(2),
      submitted_at: '2026-10-06T09:24:00.000Z',
      total: 14,
      max: 20,
    },
    ...overrides,
  };
}

/** TOPIK II mini mock, never taken (the in-progress attempt below is on this form). */
export function topikIIForm(overrides: Partial<ExamFormSummary> = {}): ExamFormSummary {
  return {
    form_id: TOPIK_II_FORM_ID,
    key: 'topik-ii-mini-01',
    language_code: 'ko',
    family: 'topik_ii',
    title_vi: 'TOPIK II — Đề mini số 1',
    description_vi: 'Bài luyện mô phỏng TOPIK II rút gọn: nghe, đọc và viết (câu 51, câu 53).',
    level_from: 'topik3',
    level_to: 'topik4',
    is_demo: true,
    sections: [
      { section: 'listening', question_count: 1, minutes: 20 },
      { section: 'reading', question_count: 1, minutes: 20 },
      { section: 'writing', question_count: 2, minutes: 30 },
    ],
    question_types: [
      { question_type: 'topik_ii_listen_match', section: 'listening', count: 1 },
      { question_type: 'topik_ii_read_topic', section: 'reading', count: 1 },
      { question_type: 'topik_ii_write_51', section: 'writing', count: 1 },
      { question_type: 'topik_ii_write_53', section: 'writing', count: 1 },
    ],
    scoring_verified: false,
    last_attempt: null,
    ...overrides,
  };
}

const LISTENING: ExamServedQuestion = {
  question_id: examQuestionId(1),
  seq: 1,
  section: 'listening',
  kind: 'mcq',
  question_type: 'topik_ii_listen_match',
  points: 2,
  prompt: {
    instruction_vi: 'Nghe đoạn hội thoại và chọn nội dung giống với điều bạn nghe được.',
    stem: '들은 내용과 같은 것을 고르십시오.',
    stem_lang: 'ko',
    audio_asset_id: null,
    tts_text: '여자: 민수 씨, 내일 회의가 몇 시예요? 남자: 오후 두 시에서 세 시로 바뀌었어요. 장소는 그대로 3층 회의실이에요.',
    options: [
      { id: 'a', text: '회의 시간이 바뀌었습니다.', lang: 'ko' },
      { id: 'b', text: '회의 장소가 바뀌었습니다.', lang: 'ko' },
      { id: 'c', text: '회의가 취소되었습니다.', lang: 'ko' },
      { id: 'd', text: '회의는 오전에 합니다.', lang: 'ko' },
    ],
  },
  answer: null,
  flagged: false,
};

const READING: ExamServedQuestion = {
  question_id: examQuestionId(2),
  seq: 2,
  section: 'reading',
  kind: 'mcq',
  question_type: 'topik_ii_read_topic',
  points: 2,
  prompt: {
    instruction_vi: 'Đọc đoạn văn và chọn chủ đề phù hợp nhất.',
    stem: '무엇에 대한 이야기입니까?',
    stem_lang: 'ko',
    passage:
      '요즘 혼자 여행을 떠나는 사람들이 늘고 있다. 혼자 여행하면 일정을 마음대로 정할 수 있고, 여행지에서 새로운 사람을 만날 기회도 많다. 그래서 혼자 하는 여행을 위한 숙소와 상품도 다양해지고 있다.',
    audio_asset_id: null,
    options: [
      { id: 'a', text: '가족 여행의 장점', lang: 'ko' },
      { id: 'b', text: '혼자 하는 여행', lang: 'ko' },
      { id: 'c', text: '여행 비용을 줄이는 방법', lang: 'ko' },
      { id: 'd', text: '해외 유학 준비', lang: 'ko' },
    ],
  },
  answer: null,
  flagged: false,
};

const SHORT_TEXT: ExamServedQuestion = {
  question_id: examQuestionId(3),
  seq: 3,
  section: 'writing',
  kind: 'short_text',
  question_type: 'topik_ii_write_51',
  points: 5,
  prompt: {
    instruction_vi: 'Viết cụm từ thích hợp vào chỗ trống ㉠ (một câu ngắn).',
    stem: '다음 글의 ㉠에 들어갈 말을 쓰십시오.',
    stem_lang: 'ko',
    passage:
      '저는 다음 주에 이사를 합니다. 그런데 짐이 많아서 혼자 정리하기가 힘듭니다. 이번 주말에 시간이 있으면 저를 ( ㉠ )? 도와주시면 맛있는 점심을 사겠습니다.',
    audio_asset_id: null,
    max_chars: 200,
  },
  answer: null,
  flagged: false,
};

const ESSAY: ExamServedQuestion = {
  question_id: examQuestionId(4),
  seq: 4,
  section: 'writing',
  kind: 'essay',
  question_type: 'topik_ii_write_53',
  points: 30,
  prompt: {
    instruction_vi: 'Viết một đoạn văn 200–300 ký tự theo chủ đề dưới đây. Phần này không được chấm tự động.',
    stem: '‘혼자 사는 사람이 늘어나는 이유와 그 영향’에 대해 200~300자로 글을 쓰십시오.',
    stem_lang: 'ko',
    audio_asset_id: null,
    min_chars: 200,
    max_chars: 300,
  },
  answer: null,
  flagged: false,
};

/** One question of each kind: listening mcq (TTS), reading mcq, short_text, essay. */
export function examQuestions(): ExamServedQuestion[] {
  return [
    { ...LISTENING, answer: 'a' },
    { ...READING, flagged: true },
    { ...SHORT_TEXT },
    { ...ESSAY },
  ].map((q) => structuredClone(q));
}

/** A timed full TOPIK II mini mock, in progress: Q1 answered, Q2 flagged, Q3–Q4 blank. */
export function examAttempt(overrides: Partial<ExamAttempt> = {}): ExamAttempt {
  return {
    attempt_id: ATTEMPT_ID,
    form_id: TOPIK_II_FORM_ID,
    form_title_vi: 'TOPIK II — Đề mini số 1',
    family: 'topik_ii',
    mode: 'full',
    section: null,
    question_type: null,
    status: 'in_progress',
    started_at: STARTED_AT,
    deadline_at: DEADLINE_AT,
    server_now: SERVER_NOW,
    questions: examQuestions(),
    structure_warning_vi: null,
    ...overrides,
  };
}

/** The submitted result of the attempt above, with the essay review (rubric + sample answer). */
export function examResult(overrides: Partial<ExamResult> = {}): ExamResult {
  return {
    attempt_id: ATTEMPT_ID,
    form_id: TOPIK_II_FORM_ID,
    form_title_vi: 'TOPIK II — Đề mini số 1',
    family: 'topik_ii',
    mode: 'full',
    status: 'submitted',
    started_at: STARTED_AT,
    submitted_at: '2026-10-13T02:58:00.000Z',
    total: 7,
    max: 9,
    by_section: [
      { section: 'listening', points: 2, max: 2, correct: 1, total: 1, scaled: 100 },
      { section: 'reading', points: 0, max: 2, correct: 0, total: 1, scaled: 0 },
      { section: 'writing', points: 5, max: 5, correct: 1, total: 1, scaled: 100 },
    ],
    by_question_type: [
      { question_type: 'topik_ii_listen_match', section: 'listening', points: 2, max: 2, correct: 1, total: 1 },
      { question_type: 'topik_ii_read_topic', section: 'reading', points: 0, max: 2, correct: 0, total: 1 },
      { question_type: 'topik_ii_write_51', section: 'writing', points: 5, max: 5, correct: 1, total: 1 },
    ],
    estimated_level: { level_code: 'topik4', scaled_total: 200, label_vi: 'Ước lượng TOPIK 4 — quy đổi tham khảo' },
    cefr_sections: null,
    scoring_verified: false,
    scoring_source_vi: 'Thang điểm TOPIK II theo thông báo của NIIED (chưa đối chiếu với quy chế hiện hành).',
    review: [
      {
        question_id: examQuestionId(1),
        seq: 1,
        section: 'listening',
        kind: 'mcq',
        question_type: 'topik_ii_listen_match',
        points: 2,
        prompt: {
          ...structuredClone(LISTENING.prompt),
          script: '여자: 민수 씨, 내일 회의가 몇 시예요?\n남자: 오후 두 시에서 세 시로 바뀌었어요. 장소는 그대로 3층 회의실이에요.',
        },
        answer: 'a',
        is_correct: true,
        correct_answer: 'a',
        explanation: { vi: 'Người nam nói cuộc họp đổi từ 2 giờ sang 3 giờ chiều, còn địa điểm vẫn là phòng họp tầng 3.' },
        rubric: null,
        sample_answer: null,
      },
      {
        question_id: examQuestionId(2),
        seq: 2,
        section: 'reading',
        kind: 'mcq',
        question_type: 'topik_ii_read_topic',
        points: 2,
        prompt: structuredClone(READING.prompt),
        answer: 'c',
        is_correct: false,
        correct_answer: 'b',
        explanation: { vi: 'Cả đoạn nói về việc ngày càng nhiều người đi du lịch một mình và lợi ích của nó.' },
        rubric: null,
        sample_answer: null,
      },
      {
        question_id: examQuestionId(3),
        seq: 3,
        section: 'writing',
        kind: 'short_text',
        question_type: 'topik_ii_write_51',
        points: 5,
        prompt: structuredClone(SHORT_TEXT.prompt),
        answer: '도와줄 수 있어요',
        is_correct: true,
        correct_answer: '도와줄 수 있어요',
        explanation: { vi: 'Người viết nhờ giúp chuyển nhà nên cần một câu hỏi nhờ vả: "도와줄 수 있어요?" / "도와주시겠어요?".' },
        rubric: null,
        sample_answer: null,
      },
      {
        question_id: examQuestionId(4),
        seq: 4,
        section: 'writing',
        kind: 'essay',
        question_type: 'topik_ii_write_53',
        points: 30,
        prompt: structuredClone(ESSAY.prompt),
        answer: '요즘 혼자 사는 사람이 많아지고 있다. 그 이유는 결혼을 늦게 하는 사람이 늘었기 때문이다.',
        is_correct: null,
        correct_answer: null,
        explanation: { vi: 'Bài viết cần nêu ít nhất hai nguyên nhân và một ảnh hưởng, có câu mở và câu kết.' },
        rubric: [
          { key: 'content', label_vi: 'Nội dung', description_vi: 'Nêu rõ nguyên nhân và ảnh hưởng, đúng chủ đề.', max_points: 7 },
          { key: 'structure', label_vi: 'Bố cục', description_vi: 'Có mở đoạn, thân đoạn và kết đoạn, dùng từ nối hợp lý.', max_points: 7 },
          { key: 'language', label_vi: 'Ngôn ngữ', description_vi: 'Ngữ pháp và từ vựng đa dạng, chính xác, văn viết (-다).', max_points: 16 },
        ],
        sample_answer:
          '최근 혼자 사는 사람이 빠르게 늘고 있다. 그 이유는 첫째, 결혼을 늦게 하거나 하지 않는 사람이 많아졌기 때문이다. 둘째, 일자리 때문에 가족과 떨어져 사는 경우도 많다. 이러한 변화로 작은 집과 1인용 상품이 인기를 얻고 있다. 그러나 혼자 사는 사람들이 외로움을 느끼기 쉬우므로 사회적인 관심이 필요하다.',
      },
    ],
    ...overrides,
  };
}

/** Newest first, as exam_history returns them. */
export function examHistory(): ExamHistoryEntry[] {
  return [
    {
      attempt_id: examHistoryAttemptId(3),
      form_title_vi: 'TOPIK II — Đề mini số 1',
      family: 'topik_ii',
      mode: 'section',
      section: 'reading',
      status: 'submitted',
      started_at: '2026-10-11T12:00:00.000Z',
      submitted_at: '2026-10-11T12:18:00.000Z',
      total: 2,
      max: 2,
      estimated_level_code: null,
      scoring_verified: false,
    },
    {
      attempt_id: examHistoryAttemptId(2),
      form_title_vi: 'TOPIK I — Đề mini số 1',
      family: 'topik_i',
      mode: 'full',
      section: null,
      status: 'submitted',
      started_at: '2026-10-06T08:50:00.000Z',
      submitted_at: '2026-10-06T09:24:00.000Z',
      total: 14,
      max: 20,
      estimated_level_code: 'topik2',
      scoring_verified: false,
    },
    {
      attempt_id: examHistoryAttemptId(1),
      form_title_vi: 'TOPIK I — Đề mini số 1',
      family: 'topik_i',
      mode: 'full',
      section: null,
      status: 'expired',
      started_at: '2026-10-01T10:00:00.000Z',
      submitted_at: '2026-10-01T10:35:30.000Z',
      total: 6,
      max: 20,
      estimated_level_code: null,
      scoring_verified: false,
    },
  ];
}
