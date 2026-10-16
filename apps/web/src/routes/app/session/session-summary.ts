import { SESSION_SUMMARY_MAX_ACTIVITIES, SESSION_SUMMARY_MAX_ERROR_TAGS, type StudySession, type SummarizeSessionRequestInput } from '@linguo/shared';
import type { SessionMistake } from '@/features/session/service';

const TAG_RE = /^[a-z][a-z0-9_]{0,39}$/;
const clamp = (n: number, max: number) => Math.max(0, Math.min(max, Math.round(n)));
/** Whole minutes for display: rounded, and a started minute counts once something was done (at least 1). */
const minutesOf = (seconds: number) => (seconds <= 0 ? 0 : Math.max(1, Math.round(seconds / 60)));

/** Minutes spent in the session, as the completion screen, the AI request and its fallback all show them. */
export function sessionMinutes(session: StudySession): number {
  return minutesOf(session.plan.activities.reduce((sum, a) => sum + a.seconds_spent, 0));
}

/** What the learner still reads when the AI cannot write the recap: the completion screen's numbers, no AI. */
export function sessionSummaryFallback(session: StudySession): { title: string; body: string } {
  const { activities } = session.plan;
  const done = activities.filter((a) => a.status === 'done').length;
  const minutes = sessionMinutes(session);
  const time = minutes > 0 ? `, khoảng ${minutes} phút` : '';
  return { title: 'Phiên học hôm nay', body: `Bạn đã hoàn thành ${done}/${activities.length} hoạt động${time}.` };
}

/**
 * The compact summary `summarize_session` receives (spec 8.2 #9): per activity only its kind, status and minutes,
 * plus counted error tags. No titles, no question or answer text, nothing that identifies the learner.
 * The tags are the exercise types of today's recap mistakes (the recap carries no finer error tags).
 */
export function buildSessionSummaryRequest(
  session: StudySession,
  learner: { language: 'en' | 'ko'; level: string },
  mistakes: readonly SessionMistake[],
): Extract<SummarizeSessionRequestInput, { task: 'summarize_session' }> {
  const activities = session.plan.activities.slice(0, SESSION_SUMMARY_MAX_ACTIVITIES).map((a) => ({
    kind: a.kind,
    status: a.status,
    minutes: clamp(a.status === 'done' ? minutesOf(a.seconds_spent) : a.minutes, 120),
  }));

  const counts = new Map<string, number>();
  for (const m of mistakes) {
    if (TAG_RE.test(m.exercise_type)) counts.set(m.exercise_type, (counts.get(m.exercise_type) ?? 0) + 1);
  }
  const error_tags = [...counts]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, SESSION_SUMMARY_MAX_ERROR_TAGS)
    .map(([tag, count]) => ({ tag, count: clamp(count, 999) }));

  return {
    task: 'summarize_session',
    language: learner.language,
    level: learner.level,
    minutes: clamp(sessionMinutes(session), 300),
    activities,
    error_tags,
  };
}
