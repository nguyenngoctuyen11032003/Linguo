import type { AdminAnalytics } from '@linguo/shared';
import { formatCount } from '@/features/admin/analytics';
import { formatAdminDate } from '@/features/admin/content';
import { cn } from '@/lib/cn';

type Day = AdminAnalytics['daily'][number];

const SLOT = 20;
const BAR = 12;
const HEIGHT = 100;
const HEADROOM = 1.1;

function dayMonth(day: string): string {
  const [, m = '', d = ''] = day.slice(0, 10).split('-');
  return `${d}/${m}`;
}

/** Which bars get an axis label: all up to 14 days, else about eight evenly spread, always the last one. */
function showLabel(i: number, count: number): boolean {
  if (count <= 14) return true;
  const step = Math.ceil(count / 8);
  return (count - 1 - i) % step === 0;
}

/**
 * Daily active users as bars (hand-drawn SVG, spec 11 §4). Screen readers get a summary label and a hidden table
 * with every day's numbers.
 */
export function DailyChart({ daily }: { daily: Day[] }) {
  const count = daily.length;
  const max = Math.max(1, ...daily.map((d) => d.dau)) * HEADROOM;
  const width = Math.max(1, count) * SLOT;
  const peak = daily.reduce<Day | null>((best, d) => (best === null || d.dau > best.dau ? d : best), null);
  const avg = count > 0 ? daily.reduce((s, d) => s + d.dau, 0) / count : 0;
  const summary =
    count === 0
      ? 'Chưa có dữ liệu người dùng hoạt động.'
      : `Người dùng hoạt động mỗi ngày trong ${count} ngày: trung bình ${formatCount(Math.round(avg))}, cao nhất ${formatCount(peak?.dau ?? 0)} vào ${formatAdminDate(peak?.day ?? null)}, ngày gần nhất ${formatCount(daily.at(-1)?.dau ?? 0)}.`;

  return (
    <figure className="m-0 min-w-0">
      <svg role="img" aria-label={summary} viewBox={`0 0 ${width} ${HEIGHT}`} preserveAspectRatio="none" className="block h-44 w-full overflow-visible">
        <line x1="0" y1={HEIGHT} x2={width} y2={HEIGHT} className="stroke-border" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {daily.map((d, i) => {
          const h = d.dau > 0 ? Math.max(2, (d.dau / max) * HEIGHT) : 0;
          return h > 0 ? (
            <rect
              key={d.day}
              data-day={d.day}
              x={i * SLOT + (SLOT - BAR) / 2}
              y={HEIGHT - h}
              width={BAR}
              height={h}
              rx={2}
              className={i === count - 1 ? 'fill-accent' : 'fill-primary'}
            />
          ) : null;
        })}
      </svg>
      <div
        aria-hidden="true"
        className="mt-1 grid text-[11px] leading-tight text-muted"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, count)}, minmax(0, 1fr))` }}
      >
        {daily.map((d, i) => (
          <span key={d.day} className={cn('whitespace-nowrap', i === count - 1 ? 'text-right' : 'text-center')}>
            {showLabel(i, count) ? dayMonth(d.day) : ''}
          </span>
        ))}
      </div>
      <figcaption className="mt-2 text-xs text-muted">Số người dùng hoạt động theo ngày (DAU); cột cuối là ngày gần nhất.</figcaption>
      <div className="sr-only">
        <table>
          <caption>Hoạt động theo ngày</caption>
          <thead>
            <tr>
              <th scope="col">Ngày</th>
              <th scope="col">Người dùng hoạt động</th>
              <th scope="col">Bài hoàn thành</th>
              <th scope="col">Phiên ôn</th>
              <th scope="col">Lượt thi</th>
            </tr>
          </thead>
          <tbody>
            {daily.map((d) => (
              <tr key={d.day}>
                <th scope="row">{formatAdminDate(d.day)}</th>
                <td>{d.dau}</td>
                <td>{d.lessons_completed}</td>
                <td>{d.review_sessions}</td>
                <td>{d.exam_attempts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
