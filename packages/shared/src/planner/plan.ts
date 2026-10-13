import {
  SESSION_LENGTHS,
  type CandidateLesson,
  type PlannerSkill,
  type SessionActivity,
  type SessionInputs,
  type SessionLength,
  type SessionPlan,
} from './contract';

// Spec 6 §2: pure, deterministic session planner. No I/O, no clock.

const MIN_MINUTES = 5;
const MAX_MINUTES = 120;
const SECONDS_PER_DUE_CARD = 12;
const SECONDS_PER_NEW_CARD = 30;
const MAX_REVIEW_LIMIT = 500;
const LONG_BREAK_DAYS = 4;
const SHORT_SESSION = 15;
const RECAP_FROM = 30;
const FALLBACK_MINUTES = 5;

const PRIORITY = { overdue: 90, inProgress: 80, due: 75, lesson: 60, weakBase: 50, recap: 10 } as const;

const SKILL_VI: Record<PlannerSkill, string> = {
  vocabulary: 'Từ vựng',
  grammar: 'Ngữ pháp',
  reading: 'Đọc hiểu',
  listening: 'Nghe',
  writing: 'Viết',
  speaking: 'Nói',
};

const LANGUAGE_VI: Record<SessionInputs['language_code'], string> = { en: 'tiếng Anh', ko: 'tiếng Hàn' };

type Draft = Omit<SessionActivity, 'id' | 'status' | 'seconds_spent'>;

const clampMinutes = (minutes: number) =>
  Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.floor(Number.isFinite(minutes) ? minutes : MIN_MINUTES)));

const truncate = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);

/** Session length closest to the daily goal (ties pick the shorter one); 15 when there is no goal. */
export function nearestSessionLength(goalMinutes: number): SessionLength {
  if (!(goalMinutes > 0)) return 15;
  let best: SessionLength = SESSION_LENGTHS[0];
  for (const length of SESSION_LENGTHS) {
    if (Math.abs(length - goalMinutes) < Math.abs(best - goalMinutes)) best = length;
  }
  return best;
}

/** Minutes needed to review `due` due cards (12 s each) and `newCards` new cards (30 s each). */
export function estimateReviewMinutes(due: number, newCards: number): number {
  return Math.ceil((due * SECONDS_PER_DUE_CARD + newCards * SECONDS_PER_NEW_CARD) / 60);
}

/** Cards that fit in `minutes`: due cards first, then new cards. */
function cardsThatFit(minutes: number, due: number, newCards: number): number {
  const seconds = minutes * 60;
  const dueTaken = Math.min(due, Math.floor(seconds / SECONDS_PER_DUE_CARD));
  const newTaken = Math.min(newCards, Math.floor((seconds - dueTaken * SECONDS_PER_DUE_CARD) / SECONDS_PER_NEW_CARD));
  return dueTaken + newTaken;
}

type WeakSkill = { skill: PlannerSkill; accuracy: number | null; confidence: string };

function pickWeakSkill(inputs: SessionInputs): WeakSkill | null {
  let weakest: WeakSkill | null = null;
  for (const s of inputs.skills) {
    if (s.recent_accuracy === null) continue;
    if (weakest === null || s.recent_accuracy < (weakest.accuracy ?? Infinity)) {
      weakest = { skill: s.skill, accuracy: s.recent_accuracy, confidence: s.confidence };
    }
  }
  if (weakest) return weakest;
  const unsure = inputs.skills.find((s) => s.confidence === 'self_reported' || s.confidence === 'low');
  return unsure ? { skill: unsure.skill, accuracy: null, confidence: unsure.confidence } : null;
}

function weakReason(weak: WeakSkill): string {
  const name = SKILL_VI[weak.skill];
  if (weak.accuracy !== null) {
    return `${name} đang đúng ${Math.round(weak.accuracy * 100)}% trong 2 tuần qua — luyện thêm một chút sẽ vững hơn`;
  }
  if (weak.confidence === 'self_reported') {
    return `Bạn tự đánh giá kỹ năng ${name.toLowerCase()} còn mới — luyện nhẹ nhàng để quen dần`;
  }
  return `Kỹ năng ${name.toLowerCase()} chưa có nhiều bài làm — luyện thêm để hệ thống hiểu bạn hơn`;
}

function lessonDraft(lesson: CandidateLesson, minutes: number, inputs: SessionInputs, backlog: boolean): Draft {
  const resuming = lesson.run_status === 'in_progress';
  const reason = resuming
    ? 'Bạn đang học dở bài này — học tiếp để giữ mạch nhé'
    : backlog
      ? 'Một bài ngắn để giữ nhịp, không cần học dồn'
      : `Bài tiếp theo trong lộ trình ${LANGUAGE_VI[inputs.language_code]}`;
  return {
    kind: 'lesson',
    minutes,
    lesson_id: lesson.lesson_id,
    review_limit: null,
    title_vi: truncate(resuming ? `Học tiếp: ${lesson.title_vi}` : lesson.title_vi, 120),
    reason_vi: reason,
    priority: resuming ? PRIORITY.inProgress : PRIORITY.lesson,
  };
}

function reviewReason(due: number, overdue: number, newCards: number, limit: number, backlog: boolean): string {
  if (backlog) {
    if (limit >= due) return `${due} thẻ đến hạn — ôn lại nhẹ nhàng để lấy lại nhịp`;
    return `${due} thẻ đang chờ — ôn trước ${limit} thẻ quan trọng nhất, phần còn lại chia dần cho các ngày sau`;
  }
  const parts: string[] = [];
  if (due > 0) {
    parts.push(overdue > 0 ? `${due} thẻ đến hạn, ${overdue} thẻ quá hạn` : `${due} thẻ đến hạn hôm nay`);
    if (newCards > 0) parts.push(`${newCards} thẻ mới`);
  } else {
    parts.push(`${newCards} thẻ mới đang chờ bạn làm quen`);
  }
  let reason = parts.join(', ');
  if (limit < due + newCards) reason += ` — hôm nay ôn ${limit} thẻ, phần còn lại để lần sau`;
  return reason;
}

function focusText(
  inputs: SessionInputs,
  drafts: Draft[],
  backlog: boolean,
  longBreak: boolean,
): string {
  const review = drafts.find((d) => d.kind === 'review');
  const resume = drafts.find((d) => d.kind === 'lesson' && d.priority === PRIORITY.inProgress);
  const hasLesson = drafts.some((d) => d.kind === 'lesson' || d.kind === 'practice');
  if (longBreak) {
    return review
      ? `Quay lại nhẹ nhàng: ôn ${review.review_limit} thẻ quan trọng nhất trước`
      : 'Chào mừng bạn quay lại! Bắt đầu nhẹ nhàng với một bài ngắn';
  }
  if (backlog && review) return `Ưu tiên ôn tập: ${review.review_limit} thẻ quan trọng nhất trước`;
  if (review && inputs.due_count > 0) {
    return hasLesson
      ? `Ôn ${inputs.due_count} thẻ đến hạn, rồi ${resume ? 'học tiếp bài đang dở' : 'học bài mới'}`
      : `Ôn ${inputs.due_count} thẻ đến hạn để giữ nhịp ghi nhớ`;
  }
  if (resume) return 'Học tiếp bài đang dở và làm quen kiến thức mới';
  if (hasLesson) return 'Hôm nay không có thẻ đến hạn — dành thời gian cho bài mới';
  if (review) return 'Làm quen vài thẻ mới để mở rộng vốn từ';
  return 'Bạn đang theo kịp lộ trình — xem lại nhẹ nhàng là đủ';
}

/** Builds a session plan of at most `minutes` from the server-provided inputs. */
export function planSession(inputs: SessionInputs, minutes: number): SessionPlan {
  const total = clampMinutes(minutes);
  const short = total <= SHORT_SESSION;
  const due = inputs.due_count;
  const longBreak = (inputs.days_since_last_study ?? 0) >= LONG_BREAK_DAYS;

  const defaultReview = Math.max(due > 0 ? 5 : 0, Math.round(total * 0.2));
  const backlog = estimateReviewMinutes(due, 0) > 2 * defaultReview || longBreak;
  const newCards = backlog ? 0 : inputs.new_card_count;
  const recapMinutes = total >= RECAP_FROM ? Math.max(3, Math.round(total * 0.1)) : 0;

  const drafts: Draft[] = [];

  // Review
  const neededReview = estimateReviewMinutes(due, newCards);
  let review: Draft | null = null;
  let reviewBudget = 0;
  if (neededReview > 0) {
    reviewBudget = Math.min(
      total - recapMinutes,
      Math.max(due > 0 ? 5 : 0, Math.round(total * (backlog ? 0.5 : 0.2))),
    );
    const reviewMinutes = Math.max(1, Math.min(reviewBudget, neededReview));
    review = {
      kind: 'review',
      minutes: reviewMinutes,
      lesson_id: null,
      review_limit: 0,
      title_vi: due > 0 ? 'Ôn tập thẻ đến hạn' : 'Làm quen thẻ mới',
      reason_vi: '',
      priority: inputs.overdue_count > 0 ? PRIORITY.overdue : PRIORITY.due,
    };
    drafts.push(review);
  }
  const reviewMinutes = review?.minutes ?? 0;

  // Lessons: in_progress first, then path order.
  const ordered = [
    ...inputs.next_lessons.filter((l) => l.run_status === 'in_progress'),
    ...inputs.next_lessons.filter((l) => l.run_status !== 'in_progress'),
  ];
  const used = new Set<string>();
  let remaining = 0;
  const addLessons = (budget: number, maxCount: number) => {
    remaining += budget;
    let added = 0;
    for (const lesson of ordered) {
      if (added >= maxCount || remaining < 1) break;
      if (used.has(lesson.lesson_id)) continue;
      const isFirstLesson = !drafts.some((d) => d.kind === 'lesson');
      if (!isFirstLesson && remaining < 5) break;
      const m = Math.min(lesson.estimated_minutes, remaining);
      drafts.push(lessonDraft(lesson, m, inputs, backlog));
      used.add(lesson.lesson_id);
      remaining -= m;
      added += 1;
    }
  };

  if (short) {
    // Review plus at most one lesson; none in a short backlog session that has cards to review.
    if (!(backlog && review)) addLessons(total - reviewMinutes, 1);
  } else if (backlog) {
    addLessons(Math.min(total - recapMinutes - reviewMinutes, Math.round(total * 0.2)), 1);
    remaining = 0;
    addWeak(Math.round(total * 0.2), false);
  } else {
    const lessonBudget = Math.round(total * 0.3) + (reviewBudget - reviewMinutes);
    // First new lesson, then the weak-skill lesson, then more new lessons with what is left.
    addLessons(lessonBudget, 1);
    addWeak(Math.round(total * 0.3), true);
    addLessons(0, Infinity);
  }

  function addWeak(budget: number, spillToLessons: boolean) {
    const weak = pickWeakSkill(inputs);
    const lesson = weak ? ordered.find((l) => !used.has(l.lesson_id) && l.skills.includes(weak.skill)) : undefined;
    if (!weak || !lesson) {
      if (spillToLessons) addLessons(budget, Infinity);
      return;
    }
    const free = total - recapMinutes - drafts.reduce((s, d) => s + d.minutes, 0);
    const m = Math.min(lesson.estimated_minutes, budget, free);
    if (m < 1) return;
    used.add(lesson.lesson_id);
    drafts.push({
      kind: 'practice',
      minutes: m,
      lesson_id: lesson.lesson_id,
      review_limit: null,
      title_vi: truncate(`Luyện ${SKILL_VI[weak.skill].toLowerCase()}: ${lesson.title_vi}`, 120),
      reason_vi: weakReason(weak),
      priority: PRIORITY.weakBase + (weak.accuracy === null ? 0 : Math.round((1 - weak.accuracy) * 20)),
    });
  }

  // Nothing to do at all: one short, honest recap.
  if (drafts.length === 0) {
    return finalize(total, [
      {
        kind: 'recap',
        minutes: Math.min(FALLBACK_MINUTES, total),
        lesson_id: null,
        review_limit: null,
        title_vi: 'Xem lại kiến thức đã học',
        reason_vi: 'Hôm nay chưa có thẻ cần ôn hay bài mới mở khóa — vài phút xem lại là đủ, bạn đang làm tốt',
        priority: PRIORITY.recap,
      },
    ], 'Bạn đang theo kịp lộ trình — xem lại nhẹ nhàng là đủ', backlog);
  }

  if (recapMinutes > 0) {
    drafts.push({
      kind: 'recap',
      minutes: recapMinutes,
      lesson_id: null,
      review_limit: null,
      title_vi: 'Tổng kết phiên học',
      reason_vi: 'Nhìn lại những gì vừa học giúp bạn nhớ lâu hơn',
      priority: PRIORITY.recap,
    });
  }

  // Unused minutes extend the review up to what the cards need (not in backlog mode).
  if (review && !backlog) {
    const planned = drafts.reduce((s, d) => s + d.minutes, 0);
    review.minutes = Math.min(neededReview, review.minutes + Math.max(0, total - planned));
  }
  if (review) {
    const limit = backlog
      ? Math.min(due, Math.floor((review.minutes * 60) / SECONDS_PER_DUE_CARD))
      : cardsThatFit(review.minutes, due, newCards);
    review.review_limit = Math.min(MAX_REVIEW_LIMIT, Math.max(1, limit));
    review.reason_vi = reviewReason(due, inputs.overdue_count, newCards, review.review_limit, backlog);
  }

  return finalize(total, drafts, focusText(inputs, drafts, backlog, longBreak), backlog);
}

function finalize(total: number, drafts: Draft[], focus: string, backlog: boolean): SessionPlan {
  // Highest priority first; stable for equal priorities (path order).
  const sorted = drafts
    .map((d, i) => ({ d, i }))
    .sort((a, b) => b.d.priority - a.d.priority || a.i - b.i)
    .map(({ d }) => d);
  return {
    minutes: total,
    activities: sorted.map((d, i) => ({ ...d, id: `a${i + 1}`, status: 'pending', seconds_spent: 0 })),
    focus_vi: truncate(focus, 160),
    backlog_mode: backlog,
  };
}

/** Keeps the highest-priority activities that fit in `minutes`; trims the last one if needed. */
export function shortenPlan(plan: SessionPlan, minutes: number): SessionPlan {
  const total = clampMinutes(minutes);
  const byPriority = plan.activities
    .map((a, i) => ({ a, i }))
    .sort((x, y) => y.a.priority - x.a.priority || x.i - y.i);
  const kept = new Map<number, SessionActivity>();
  let remaining = total;
  for (const { a, i } of byPriority) {
    if (remaining < 1) break;
    if (a.minutes <= remaining) {
      kept.set(i, a);
      remaining -= a.minutes;
      continue;
    }
    const trimmed: SessionActivity = { ...a, minutes: remaining };
    if (a.kind === 'review' && a.review_limit !== null) {
      trimmed.review_limit = Math.max(1, Math.floor((a.review_limit * remaining) / a.minutes));
    }
    kept.set(i, trimmed);
    remaining = 0;
  }
  const activities = [...kept.entries()].sort(([x], [y]) => x - y).map(([, a]) => a);
  return { ...plan, minutes: total, activities };
}
