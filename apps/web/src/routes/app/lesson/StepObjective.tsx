import { Clock, Target } from 'lucide-react';
import type { LessonBlock, LessonPayload } from '@linguo/shared';

type Objective = Extract<LessonBlock, { type: 'objective' }>;

export function StepObjective({ lesson }: { lesson: LessonPayload['lesson'] }) {
  const intro = lesson.body.filter((b): b is Objective => b.type === 'objective');
  return (
    <div className="space-y-5">
      <p className="inline-flex items-center gap-2 text-[15px] text-muted">
        <Clock aria-hidden className="size-4" />
        Khoảng {lesson.estimated_minutes} phút
      </p>
      {intro.map((block, i) => (
        <p key={i}>{block.text.vi}</p>
      ))}
      {lesson.objectives.length > 0 && (
        <section aria-labelledby="lesson-objectives" className="space-y-2">
          <h2 id="lesson-objectives" className="text-base font-bold">
            Mục tiêu bài học
          </h2>
          <ul className="space-y-2">
            {lesson.objectives.map((objective, i) => (
              <li key={i} className="flex gap-3">
                <Target aria-hidden className="mt-1 size-4 shrink-0 text-primary" />
                <span>{objective.vi}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
