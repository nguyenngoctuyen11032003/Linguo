import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import { Link } from 'react-router';
import type { StudySession } from '@linguo/shared';
import { Button, buttonClasses } from '@/components/ui/Button';
import { sessionMinutes } from './session-summary';
import { SessionSummaryButton } from './SessionSummaryButton';

interface Props {
  session: StudySession;
  onPlanAgain: () => void;
  /** Learner language and level for the AI recap; omitted hides "Tóm tắt phiên bằng AI". */
  learner?: { language: 'en' | 'ko' | 'ja'; level: string } | null;
}

/** End of a session: time, activities, and a calm word — no streak pressure (spec 6 §4). */
export function CompletionView({ session, onPlanAgain, learner }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { activities } = session.plan;
  const done = activities.filter((a) => a.status === 'done').length;
  const skipped = activities.filter((a) => a.status === 'skipped').length;
  const minutes = sessionMinutes(session);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const stats: Array<[string, string]> = [
    ['Thời gian', `${minutes} phút`],
    ['Hoạt động', `${done}/${activities.length}`],
  ];

  return (
    <section aria-labelledby="session-done-title" className="space-y-5">
      <div className="relative isolate overflow-hidden rounded-[2rem] bg-[image:var(--hero-bg)] p-5 text-white shadow-[0_24px_60px_-24px_rgb(7_11_18/0.8)] ring-1 ring-white/10 ring-inset">
        <span aria-hidden="true" className="absolute -right-16 -top-24 -z-10 size-64 rounded-full bg-accent/30 blur-3xl" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <h2
              id="session-done-title"
              ref={headingRef}
              tabIndex={-1}
              className="font-display text-[clamp(34px,10vw,44px)] font-extrabold uppercase leading-none focus:outline-none"
            >
              Hoàn thành phiên học
            </h2>
            <p className="text-[14px] leading-snug text-white/75">
              {done > 0
                ? 'Mỗi phiên nhỏ đều cộng dồn. Nghỉ ngơi một chút, mai mình học tiếp nhé.'
                : 'Hôm nay nhẹ nhàng cũng được. Khi sẵn sàng, mình học tiếp nhé.'}
            </p>
          </div>
          <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-full bg-[#7ee2ae] text-[#06251a] shadow-[0_4px_0_#2f9a6a]">
            <Check className="size-6" strokeWidth={3.5} />
          </span>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-4">
          {stats.map(([label, value], i) => (
            <div key={label} className={i === 1 ? 'border-l border-white/12 pl-4' : undefined}>
              <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-white/65">{label}</dt>
              <dd className="stat-num mt-2 bg-gradient-to-b from-white to-white/55 bg-clip-text pr-1 text-[clamp(40px,13vw,56px)] text-transparent">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        {skipped > 0 && <p className="mt-5 border-t border-white/12 pt-4 text-[14px] text-white/75">Đã bỏ qua {skipped} hoạt động — không sao cả.</p>}
      </div>
      <div className="flex flex-col gap-2">
          <Link to="/app" className={buttonClasses('accent', 'lg', true)}>
            Về trang chủ
          </Link>
          {learner && <SessionSummaryButton session={session} learner={learner} />}
          <Button variant="ghost" block onClick={onPlanAgain}>
            Học thêm một phiên
          </Button>
      </div>
    </section>
  );
}
