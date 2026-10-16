import { Clock, Target } from 'lucide-react';
import type { LessonBlock, LessonPayload } from '@linguo/shared';

type Objective = Extract<LessonBlock, { type: 'objective' }>;

export function StepObjective({ lesson }: { lesson: LessonPayload['lesson'] }) {
  const intro = lesson.body.filter((b): b is Objective => b.type === 'objective');
  return (
    <div className="space-y-5">
      <p className="inline-flex items-center gap-2 rounded-full bg-text/[0.05] px-3 py-1.5 text-[14px] font-semibold text-muted ring-1 ring-border ring-inset">
        <Clock aria-hidden className="size-4" />
        Khoảng {lesson.estimated_minutes} phút
      </p>
      {intro.map((block, i) => (
        <p key={i}>{block.text.vi}</p>
      ))}
      {lesson.objectives.length > 0 && (
        <section aria-labelledby="lesson-objectives" className="card space-y-3 p-5">
          <h3 id="lesson-objectives" className="eyebrow flex items-center gap-1.5">
            <Target aria-hidden className="size-3.5 text-accent" />
            Mục tiêu bài học
          </h3>
          <ol className="space-y-3">
            {lesson.objectives.map((objective, i) => (
              <li key={i} className="flex gap-3">
                <span aria-hidden="true" className="stat-num w-7 shrink-0 pt-1 text-[24px] text-primary">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="font-medium">{objective.vi}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
