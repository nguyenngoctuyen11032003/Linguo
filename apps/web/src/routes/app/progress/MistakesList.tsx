import { useId } from 'react';
import { ChevronRight, Sprout } from 'lucide-react';
import { Link } from 'react-router';
import { DEFAULT_TIMEZONE, type Mistake } from '@linguo/shared';
import { SolidCard } from '@/components/ui/SolidCard';
import { useProfile } from '@/features/profile/ProfileProvider';
import { formatDay } from './labels';

/** Exercises answered wrong most often in the window, each linking back to its lesson. */
export function MistakesList({ mistakes }: { mistakes: Mistake[] }) {
  const headingId = useId();
  const { profile } = useProfile();
  const timeZone = profile?.timezone ?? DEFAULT_TIMEZONE;
  return (
    <SolidCard>
      <section aria-labelledby={headingId} className="space-y-3">
        <div>
          <h2 id={headingId} className="text-lg font-bold tracking-[-0.02em]">
            Lỗi thường gặp
          </h2>
          {mistakes.length > 0 && <p className="text-sm text-muted">Những câu bạn hay nhầm nhất. Ôn lại bài là cách nhanh nhất để nhớ chắc.</p>}
        </div>
        {mistakes.length === 0 ? (
          <div className="flex items-start gap-3 rounded-2xl bg-text/5 p-4">
            <Sprout aria-hidden className="mt-0.5 size-5 shrink-0 text-success-text" />
            <div>
              <p className="font-semibold">Không có lỗi nào lặp lại trong khoảng này</p>
              <p className="text-sm text-muted">Sai là một phần của việc học. Khi có câu bạn hay nhầm, chúng sẽ hiện ở đây để bạn ôn lại.</p>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {mistakes.map((m, i) => (
              <li key={`${m.lesson_id}-${i}`} className="min-w-0 py-3 first:pt-0 last:pb-0">
                <p className="font-medium [overflow-wrap:anywhere]">{m.prompt}</p>
                <p className="mt-0.5 text-sm text-muted">
                  Sai {m.wrong_count} lần · gần nhất {formatDay(m.last_wrong_at, timeZone)}
                </p>
                <Link
                  to={`/app/hoc-tap/bai/${m.lesson_id}`}
                  className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline"
                >
                  Học lại bài {m.lesson_title}
                  <ChevronRight aria-hidden className="size-4 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </SolidCard>
  );
}
