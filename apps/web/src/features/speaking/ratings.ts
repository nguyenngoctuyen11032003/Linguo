import { readString, removeKey, writeString } from '@/lib/storage';

// Spec 6.9: speaking is self-assessed on separate axes (never one overall grade) and no conclusion is drawn about the
// learner's level from a single recording. Only these 1–3 ratings may be kept, in this browser's localStorage: never
// the audio, never the transcript, and nothing is sent to a server.

export const RATING_AXES = [
  { id: 'clarity', label: 'Độ dễ hiểu', hint: 'Người nghe có hiểu bạn nói gì không?' },
  { id: 'sounds', label: 'Âm mục tiêu', hint: 'Những âm khó trong câu này đã rõ chưa?' },
  { id: 'rhythm', label: 'Nhịp và ngắt nghỉ', hint: 'Bạn ngắt nghỉ đúng chỗ, nhịp nói đều chứ?' },
  { id: 'fluency', label: 'Độ trôi chảy', hint: 'Bạn nói liền mạch hay hay khựng lại?' },
  { id: 'content', label: 'Hợp nội dung', hint: 'Bạn đã nói đúng điều cần nói chưa?' },
] as const;

export type RatingAxisId = (typeof RATING_AXES)[number]['id'];
export type RatingValue = 1 | 2 | 3;
export type Ratings = Partial<Record<RatingAxisId, RatingValue>>;

export const RATING_LABELS: Record<RatingValue, string> = { 1: 'Cần luyện thêm', 2: 'Tạm ổn', 3: 'Khá tốt' };

export type SpeakingMode = 'repeat' | 'open' | 'roleplay';
export type SpeakingLanguage = 'en' | 'ko';

export interface Reflection {
  /** ISO timestamp. */
  at: string;
  mode: SpeakingMode;
  lang: SpeakingLanguage;
  ratings: Ratings;
}

export const REFLECTION_KEY_PREFIX = 'linguo-speaking-v1:';
export const REFLECTIONS_MAX = 30;

const key = (userId: string) => `${REFLECTION_KEY_PREFIX}${userId}`;
const AXIS_IDS = new Set<string>(RATING_AXES.map((a) => a.id));
const MODES = new Set<string>(['repeat', 'open', 'roleplay']);

function sanitize(value: unknown): Reflection | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.at !== 'string' || typeof v.mode !== 'string' || !MODES.has(v.mode)) return null;
  if (v.lang !== 'en' && v.lang !== 'ko') return null;
  const ratings: Ratings = {};
  if (typeof v.ratings === 'object' && v.ratings !== null) {
    for (const [axis, rating] of Object.entries(v.ratings)) {
      if (AXIS_IDS.has(axis) && (rating === 1 || rating === 2 || rating === 3)) ratings[axis as RatingAxisId] = rating;
    }
  }
  return { at: v.at, mode: v.mode as SpeakingMode, lang: v.lang, ratings };
}

/** Saved self-assessments of this user on this device, oldest first; corrupt storage reads as empty. */
export function loadReflections(userId: string): Reflection[] {
  const raw = readString(key(userId));
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(sanitize).filter((r): r is Reflection => r !== null) : [];
  } catch {
    return [];
  }
}

/** Appends one reflection (only when at least one axis was rated) and keeps the newest REFLECTIONS_MAX. */
export function saveReflection(userId: string, reflection: Reflection): Reflection[] {
  const current = loadReflections(userId);
  if (Object.keys(reflection.ratings).length === 0) return current;
  const next = [...current, reflection].slice(-REFLECTIONS_MAX);
  writeString(key(userId), JSON.stringify(next));
  return next;
}

export function clearReflections(userId: string): void {
  removeKey(key(userId));
}
