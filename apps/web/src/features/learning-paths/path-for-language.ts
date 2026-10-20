import type { LearningPath } from './service';

/**
 * The learner's path to use for a language: an active one first, then the newest. Null when there is none (a class or
 * an exam of a language the learner has not started). Mirrors public.teacher_member_path, which picks the path whose
 * progress a teacher sees.
 */
export function pathForLanguage(paths: readonly LearningPath[], language: string): LearningPath | null {
  const ofLanguage = paths.filter((p) => p.language === language);
  if (ofLanguage.length === 0) return null;
  const ranked = [...ofLanguage].sort(
    (a, b) => Number(b.status === 'active') - Number(a.status === 'active') || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
  );
  return ranked[0] ?? null;
}
