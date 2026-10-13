import type { PathLesson } from '@linguo/shared';

export interface UnitGroup {
  id: string;
  title: string;
  lessons: PathLesson[];
}

export interface ProgramGroup {
  id: string;
  title: string;
  /** Any lesson of the program is unreviewed demo content. */
  isDemo: boolean;
  units: UnitGroup[];
}

/** Programs in first-seen order, then unit order, then lesson order (stable). */
export function orderPathLessons(lessons: PathLesson[]): PathLesson[] {
  const programRank = new Map<string, number>();
  for (const lesson of lessons) if (!programRank.has(lesson.program_id)) programRank.set(lesson.program_id, programRank.size);
  return [...lessons].sort(
    (a, b) =>
      (programRank.get(a.program_id) ?? 0) - (programRank.get(b.program_id) ?? 0) ||
      a.unit_order - b.unit_order ||
      a.lesson_order - b.lesson_order,
  );
}

export function groupPathLessons(lessons: PathLesson[]): ProgramGroup[] {
  const programs: ProgramGroup[] = [];
  for (const lesson of orderPathLessons(lessons)) {
    let program = programs.find((p) => p.id === lesson.program_id);
    if (!program) {
      program = { id: lesson.program_id, title: lesson.program_title.vi, isDemo: false, units: [] };
      programs.push(program);
    }
    program.isDemo ||= lesson.is_demo;
    let unit = program.units.find((u) => u.id === lesson.unit_id);
    if (!unit) {
      unit = { id: lesson.unit_id, title: lesson.unit_title.vi, lessons: [] };
      program.units.push(unit);
    }
    unit.lessons.push(lesson);
  }
  return programs;
}

/** Home "next lesson": the first lesson in progress, else the first not-started one whose prerequisites are met. */
export function pickNextLesson(lessons: PathLesson[]): PathLesson | null {
  const ordered = orderPathLessons(lessons);
  return (
    ordered.find((l) => l.run_status === 'in_progress') ??
    ordered.find((l) => l.run_status === 'not_started' && l.prerequisites_met) ??
    null
  );
}

/** Titles of the prerequisites not completed yet (all known prerequisites when none can be told apart). */
export function pendingPrerequisiteTitles(lesson: PathLesson, lessons: PathLesson[]): string[] {
  const known = lesson.prerequisite_ids.flatMap((id) => lessons.filter((l) => l.lesson_id === id));
  const pending = known.filter((l) => l.run_status !== 'completed');
  return (pending.length > 0 ? pending : known).map((l) => l.title.vi);
}
