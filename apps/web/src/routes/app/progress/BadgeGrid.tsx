import { useId } from 'react';
import {
  Award,
  BookOpen,
  Brain,
  BrainCircuit,
  CalendarCheck,
  CalendarHeart,
  Compass,
  Flag,
  Library,
  Lock,
  Repeat,
  Repeat2,
  Target,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { BADGE_KEYS, BADGES, type Motivation } from '@linguo/shared';
import { cn } from '@/lib/cn';
import { formatDay } from './labels';

/** lucide icon names used by the BADGES catalogue; unknown names fall back to Award. */
const ICONS: Record<string, LucideIcon> = {
  Flag,
  BookOpen,
  Library,
  Repeat,
  Repeat2,
  Brain,
  BrainCircuit,
  CalendarCheck,
  CalendarHeart,
  Compass,
  Trophy,
  Target,
};

/** Every badge of the catalogue: earned ones first (newest first) with their date, then locked ones with how to earn them. */
export function BadgeGrid({ badges }: { badges: Motivation['badges'] }) {
  const headingId = useId();
  const earnedAt = new Map(badges.map((b) => [b.key, b.earned_at]));
  const earned = [...badges].sort((a, b) => b.earned_at.localeCompare(a.earned_at)).map((b) => b.key);
  const locked = BADGE_KEYS.filter((key) => !earnedAt.has(key));

  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className="font-bold">
        Huy hiệu ({earned.length}/{BADGE_KEYS.length})
      </h3>
      <ul className="mt-3 grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 lg:grid-cols-3">
        {[...earned, ...locked].map((key) => {
          const info = BADGES[key];
          const date = earnedAt.get(key);
          const Icon = date ? (ICONS[info.icon] ?? Award) : Lock;
          const label = date
            ? `${info.title_vi}: đã đạt ngày ${formatDay(date)}`
            : `${info.title_vi}: chưa đạt. ${info.description_vi}`;
          return (
            <li
              key={key}
              aria-label={label}
              className={cn(
                'flex min-w-0 items-start gap-3 rounded-2xl p-3',
                date ? 'border border-gold/40 bg-gold/10' : 'border border-dashed border-border',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'inline-flex size-9 shrink-0 items-center justify-center rounded-xl',
                  date ? 'bg-gold/20 text-gold' : 'bg-text/5 text-muted',
                )}
              >
                <Icon className="size-5" />
              </span>
              <div className="min-w-0">
                <p className={cn('font-semibold leading-snug', !date && 'text-muted')}>{info.title_vi}</p>
                {date ? (
                  <p className="text-xs text-muted">Đã đạt ngày {formatDay(date)}</p>
                ) : (
                  <p className="text-xs text-muted">
                    <span className="font-semibold">Chưa đạt</span> · {info.description_vi}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
