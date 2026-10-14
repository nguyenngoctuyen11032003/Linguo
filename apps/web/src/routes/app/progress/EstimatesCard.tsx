import { useId } from 'react';
import { CircleDashed, Gauge } from 'lucide-react';
import { Link } from 'react-router';
import { SKILLS, type SkillEstimate } from '@linguo/shared';
import { buttonClasses } from '@/components/ui/Button';
import { SolidCard } from '@/components/ui/SolidCard';
import { levelLabel } from '../diagnostic/labels';
import { ESTIMATE_CONFIDENCE_LABELS, ESTIMATE_SOURCE_LABELS, formatDay, SKILL_LABELS } from './labels';

interface EstimatesCardProps {
  estimates: SkillEstimate[];
  pathId: string;
}

/** Competence layer: one estimate per skill, always labelled as an estimate with its confidence, source and date. */
export function EstimatesCard({ estimates, pathId }: EstimatesCardProps) {
  const headingId = useId();
  const diagnosticHref = `/app/kiem-tra/${pathId}`;
  const bySkill = new Map(estimates.map((e) => [e.skill, e]));

  return (
    <SolidCard>
      <section aria-labelledby={headingId} className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <Gauge aria-hidden className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 id={headingId} className="text-lg font-bold tracking-[-0.02em]">
              Năng lực ước lượng
            </h2>
            <p className="text-sm text-muted">Trình độ từng kỹ năng là ước lượng, không phải điểm thi. Độ tin cậy cho biết nên tin bao nhiêu.</p>
          </div>
        </div>

        {estimates.length === 0 ? (
          <div className="space-y-3">
            <p className="text-[15px]">
              Chưa có ước lượng nào. Bài kiểm tra đầu vào mất vài phút và giúp Linguo chọn bài vừa sức với bạn.
            </p>
            <Link to={diagnosticHref} className={buttonClasses('primary', 'md')}>
              Làm kiểm tra đầu vào
            </Link>
          </div>
        ) : (
          <>
            <ul className="grid gap-3 sm:grid-cols-2">
              {SKILLS.map((skill) => {
                const estimate = bySkill.get(skill);
                return (
                  <li key={skill} className="min-w-0 rounded-2xl bg-text/5 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold">{SKILL_LABELS[skill]}</h3>
                      {estimate && (
                        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-semibold text-muted">Ước lượng</span>
                      )}
                    </div>
                    {estimate ? (
                      <div className="mt-1 space-y-0.5 text-sm">
                        <p className="text-2xl font-bold leading-tight tracking-[-0.02em]">{levelLabel(estimate.level_code)}</p>
                        <p>Độ tin cậy: {ESTIMATE_CONFIDENCE_LABELS[estimate.confidence]}</p>
                        <p className="text-muted">
                          Nguồn: {ESTIMATE_SOURCE_LABELS[estimate.source]}
                          {estimate.sample_size > 0 && `, dựa trên ${estimate.sample_size} câu`}
                        </p>
                        <p className="text-muted">Cập nhật ngày {formatDay(estimate.assessed_at)}</p>
                      </div>
                    ) : (
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                        <CircleDashed aria-hidden className="size-4 shrink-0" />
                        Chưa có ước lượng
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
            <Link to={diagnosticHref} className={buttonClasses('ghost', 'md')}>
              Làm lại kiểm tra đầu vào
            </Link>
          </>
        )}
      </section>
    </SolidCard>
  );
}
