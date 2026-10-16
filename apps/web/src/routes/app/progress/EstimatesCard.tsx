import { useId } from 'react';
import { CircleDashed, Gauge } from 'lucide-react';
import { Link } from 'react-router';
import { DEFAULT_TIMEZONE, SKILLS, type SkillEstimate } from '@linguo/shared';
import { buttonClasses } from '@/components/ui/Button';
import { SolidCard } from '@/components/ui/SolidCard';
import { useProfile } from '@/features/profile/ProfileProvider';
import { cn } from '@/lib/cn';
import { levelLabel } from '../diagnostic/labels';
import { ESTIMATE_CONFIDENCE_LABELS, ESTIMATE_SOURCE_LABELS, formatDay, SKILL_LABELS } from './labels';

interface EstimatesCardProps {
  estimates: SkillEstimate[];
  pathId: string;
}

/** Competence layer: one estimate per skill, always labelled as an estimate with its confidence, source and date. */
export function EstimatesCard({ estimates, pathId }: EstimatesCardProps) {
  const headingId = useId();
  const { profile } = useProfile();
  const timeZone = profile?.timezone ?? DEFAULT_TIMEZONE;
  const diagnosticHref = `/app/kiem-tra/${pathId}`;
  const bySkill = new Map(estimates.map((e) => [e.skill, e]));

  return (
    <SolidCard className="p-5 lg:p-6">
      <section aria-labelledby={headingId} className="space-y-4">
        <div className="min-w-0">
          <h2 id={headingId} className="flex items-center gap-2 text-xl font-extrabold tracking-[-0.02em]">
            <Gauge aria-hidden className="size-5 text-primary" strokeWidth={2.1} />
            Năng lực ước lượng
          </h2>
          <div className="min-w-0">
            <p className="mt-0.5 text-[13px] leading-snug text-muted">Trình độ từng kỹ năng là ước lượng, không phải điểm thi. Độ tin cậy cho biết nên tin bao nhiêu.</p>
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
            <ul className="grid grid-cols-2 gap-2.5 xl:grid-cols-1">
              {SKILLS.map((skill) => {
                const estimate = bySkill.get(skill);
                return (
                  <li key={skill} className={cn('min-w-0 rounded-[1.25rem] bg-text/[0.04] p-3.5', estimate && 'col-span-2 sm:col-span-1')}>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-[15px] font-semibold leading-snug">{SKILL_LABELS[skill]}</h3>
                      {estimate && (
                        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-semibold text-muted">Ước lượng</span>
                      )}
                    </div>
                    {estimate ? (
                      <div className="mt-1 space-y-0.5 text-[13px] leading-snug">
                        <p className="stat-num pb-1 pt-1.5 text-[34px]">{levelLabel(estimate.level_code)}</p>
                        <p>Độ tin cậy: {ESTIMATE_CONFIDENCE_LABELS[estimate.confidence]}</p>
                        <p className="text-muted">
                          Nguồn: {ESTIMATE_SOURCE_LABELS[estimate.source]}
                          {estimate.sample_size > 0 && `, dựa trên ${estimate.sample_size} câu`}
                        </p>
                        <p className="text-muted">Cập nhật ngày {formatDay(estimate.assessed_at, timeZone)}</p>
                      </div>
                    ) : (
                      <p className="mt-1 flex items-start gap-1.5 text-[13px] leading-snug text-muted">
                        <CircleDashed aria-hidden className="mt-px size-4 shrink-0" />
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
