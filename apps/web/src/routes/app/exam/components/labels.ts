import { LEVEL_INFO, type ExamFamily, type ExamMode, type ExamSection } from '@linguo/shared';

/** Shown on every form card and on the result page (PRD §9: never presented as an official paper). */
export const SIMULATED_LABEL = 'Bài luyện mô phỏng — không phải đề thi chính thức';
export const ESTIMATE_LABEL = 'Quy đổi tham khảo, không phải kết quả chính thức';
export const UNVERIFIED_SCORING_LABEL = 'Thang điểm chưa được đối chiếu với quy chế hiện hành';

export const FAMILY_LABELS: Record<ExamFamily, string> = {
  topik_i: 'TOPIK I',
  topik_ii: 'TOPIK II',
  cefr: 'CEFR',
  jlpt: 'JLPT',
};

export const SECTION_LABELS: Record<ExamSection, string> = {
  listening: 'Nghe',
  reading: 'Đọc',
  writing: 'Viết',
};

export const MODE_LABELS: Record<ExamMode, string> = {
  full: 'Thi thử toàn bài',
  section: 'Luyện theo phần',
  question_type: 'Luyện theo dạng câu',
};

/** Target language of a family: what the learner reads, hears and writes. */
export function familyLanguage(family: ExamFamily): 'en' | 'ko' | 'ja' {
  if (family === 'cefr') return 'en';
  return family === 'jlpt' ? 'ja' : 'ko';
}

/** Curated names for the drill tags used by the demo forms; anything else goes through the fallback. */
const QUESTION_TYPE_LABELS: Record<string, string> = {
  topik_i_listen_response: 'Nghe — chọn câu đáp lại',
  topik_i_listen_topic: 'Nghe — chủ đề hội thoại',
  topik_i_listen_place: 'Nghe — địa điểm',
  topik_i_listen_detail: 'Nghe — chi tiết',
  topik_i_listen_main_idea: 'Nghe — ý chính',
  topik_i_read_topic: 'Đọc — chủ đề',
  topik_i_read_blank: 'Đọc — điền chỗ trống',
  topik_i_read_detail: 'Đọc — chi tiết',
  topik_i_read_main_idea: 'Đọc — ý chính',
  topik_i_read_order: 'Đọc — sắp xếp câu',
  topik_ii_listen_response: 'Nghe — chọn câu đáp lại',
  topik_ii_listen_detail: 'Nghe — chi tiết',
  topik_ii_listen_main_idea: 'Nghe — ý chính',
  topik_ii_read_blank: 'Đọc — điền chỗ trống',
  topik_ii_read_detail: 'Đọc — chi tiết',
  topik_ii_read_main_idea: 'Đọc — ý chính',
  topik_ii_read_headline: 'Đọc — tiêu đề báo',
  topik_ii_write_51: 'Viết — điền câu (kiểu câu 51)',
  topik_ii_write_52: 'Viết — điền câu (kiểu câu 52)',
  topik_ii_write_53: 'Viết — đoạn văn theo dữ liệu (kiểu câu 53)',
  cefr_listen_gist: 'Nghe — ý chính',
  cefr_listen_detail: 'Nghe — chi tiết',
  cefr_read_gist: 'Đọc — ý chính',
  cefr_read_detail: 'Đọc — chi tiết',
  cefr_read_sign: 'Đọc — biển báo, thông báo',
  cefr_write_email: 'Viết — email ngắn',
  jlpt_listen_task: 'Nghe — hiểu nhiệm vụ',
  jlpt_listen_point: 'Nghe — nắm điểm chính',
  jlpt_listen_gist: 'Nghe — ý chính',
  jlpt_listen_utterance: 'Nghe — chọn câu nói phù hợp',
  jlpt_listen_response: 'Nghe — chọn câu đáp lại',
  jlpt_read_kanji_reading: 'Đọc — cách đọc kanji',
  jlpt_read_kanji_writing: 'Đọc — cách viết kanji',
  jlpt_read_vocab: 'Đọc — từ vựng theo ngữ cảnh',
  jlpt_read_paraphrase: 'Đọc — từ gần nghĩa',
  jlpt_read_usage: 'Đọc — cách dùng từ',
  jlpt_read_grammar: 'Đọc — ngữ pháp',
  jlpt_read_order: 'Đọc — sắp xếp câu',
  jlpt_read_detail: 'Đọc — hiểu chi tiết',
  jlpt_read_info: 'Đọc — tìm thông tin',
};

const TAG_SECTIONS: Record<string, string> = {
  listen: 'Nghe',
  listening: 'Nghe',
  read: 'Đọc',
  reading: 'Đọc',
  write: 'Viết',
  writing: 'Viết',
};

const TAG_WORDS: Record<string, string> = {
  detail: 'chi tiết',
  gist: 'ý chính',
  main: 'ý chính',
  idea: '',
  topic: 'chủ đề',
  blank: 'điền chỗ trống',
  order: 'sắp xếp',
  response: 'câu đáp lại',
  email: 'email',
  essay: 'bài luận',
  vocab: 'từ vựng',
  grammar: 'ngữ pháp',
};

/**
 * Vietnamese name of a drill tag. Unknown tags stay readable: the family prefix is dropped, the skill becomes
 * "Nghe / Đọc / Viết", a trailing number becomes "câu 51", other words are translated when known.
 */
export function questionTypeLabel(tag: string): string {
  const known = QUESTION_TYPE_LABELS[tag];
  if (known) return known;
  const parts = tag
    .replace(/^(topik_ii|topik_i|cefr|jlpt)_/, '')
    .split('_')
    .filter(Boolean);
  const head = parts[0] !== undefined ? TAG_SECTIONS[parts[0]] : undefined;
  const rest = (head ? parts.slice(1) : parts)
    .map((word) => (/^\d+$/.test(word) ? `câu ${word}` : (TAG_WORDS[word] ?? word)))
    .filter(Boolean);
  const tail = [...new Set(rest)].join(' ');
  if (head && tail) return `${head} — ${tail}`;
  return head ?? (tail || tag);
}

/** "A2", "TOPIK 1"; unknown codes are shown as-is. */
export function levelLabel(code: string | null | undefined): string {
  if (!code) return '—';
  return (LEVEL_INFO as Record<string, { label: string } | undefined>)[code]?.label ?? code;
}

export function levelRangeLabel(from: string, to: string): string {
  return from === to ? levelLabel(from) : `${levelLabel(from)}–${levelLabel(to)}`;
}

/** "27/10/2026"; unparseable input is returned as-is. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

/** Scores may be fractional after scaling: at most one decimal, Vietnamese decimal comma. */
export function formatScore(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
}

/** Spec 9 §4 routes; the pages themselves are mounted by the router. */
export const examResultHref = (attemptId: string) => `/app/luyen-thi/ket-qua/${attemptId}`;
export const examRunnerHref = (attemptId: string) => `/app/luyen-thi/lam-bai/${attemptId}`;

/** Spec 9 §4: localStorage key of the essay self-assessment checklist, per attempt and question. */
export const rubricStorageKey = (attemptId: string, questionId: string) => `linguo:exam-rubric:${attemptId}:${questionId}`;

/** Counted in code points so a Hangul syllable or an emoji is one character, as the learner sees it. */
export function charCount(text: string): number {
  return Array.from(text).length;
}

export function isAnswered(answer: string | null): boolean {
  return answer !== null && answer.trim() !== '';
}
