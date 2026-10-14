import { useEffect, useRef } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router';
import type { StudySession } from '@linguo/shared';
import { Button, buttonClasses } from '@/components/ui/Button';
import { SolidCard } from '@/components/ui/SolidCard';
import { SessionSummaryButton } from './SessionSummaryButton';

interface Props {
  session: StudySession;
  onPlanAgain: () => void;
  /** Learner language and level for the AI recap; omitted hides "Tóm tắt phiên bằng AI". */
  learner?: { language: 'en' | 'ko'; level: string } | null;
}

/** Whole minutes for display; a started minute counts once something was done. */
function minutesOf(seconds: number): number {
  return seconds <= 0 ? 0 : Math.max(1, Math.round(seconds / 60));
}

/** End of a session: time, activities, and a calm word — no streak pressure (spec 6 §4). */
export function CompletionView({ session, onPlanAgain, learner }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { activities } = session.plan;
  const done = activities.filter((a) => a.status === 'done').length;
  const skipped = activities.filter((a) => a.status === 'skipped').length;
  const minutes = minutesOf(activities.reduce((sum, a) => sum + a.seconds_spent, 0));

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const stats: Array<[string, string]> = [
    ['Thời gian', `${minutes} phút`],
    ['Hoạt động', `${done}/${activities.length}`],
  ];

  return (
    <SolidCard className="space-y-5">
      <section aria-labelledby="session-done-title" className="space-y-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 aria-hidden className="mt-0.5 size-6 shrink-0 text-success" />
          <div className="min-w-0 space-y-1">
            <h2 id="session-done-title" ref={headingRef} tabIndex={-1} className="text-xl font-bold tracking-[-0.02em] focus:outline-none">
              Hoàn thành phiên học
            </h2>
            <p className="text-[15px] text-muted">
              {done > 0
                ? 'Mỗi phiên nhỏ đều cộng dồn. Nghỉ ngơi một chút, mai mình học tiếp nhé.'
                : 'Hôm nay nhẹ nhàng cũng được. Khi sẵn sàng, mình học tiếp nhé.'}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-3">
          {stats.map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-text/5 px-4 py-3">
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="text-xl font-bold">{value}</dd>
            </div>
          ))}
        </dl>
        {skipped > 0 && <p className="text-sm text-muted">Đã bỏ qua {skipped} hoạt động — không sao cả.</p>}
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
    </SolidCard>
  );
}
