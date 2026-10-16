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
import { BADGE_KEYS, BADGES, DEFAULT_TIMEZONE, type Motivation } from '@linguo/shared';
import { useProfile } from '@/features/profile/ProfileProvider';
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
  const { profile } = useProfile();
  const timeZone = profile?.timezone ?? DEFAULT_TIMEZONE;
  const earnedAt = new Map(badges.map((b) => [b.key, b.earned_at]));
  const earned = [...badges].sort((a, b) => b.earned_at.localeCompare(a.earned_at)).map((b) => b.key);
  const locked = BADGE_KEYS.filter((key) => !earnedAt.has(key));

  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className="eyebrow">
        Huy hiệu ({earned.length}/{BADGE_KEYS.length})
      </h3>
      <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {[...earned, ...locked].map((key) => {
          const info = BADGES[key];
          const date = earnedAt.get(key);
          const Icon = date ? (ICONS[info.icon] ?? Award) : Lock;
          const label = date
            ? `${info.title_vi}: đã đạt ngày ${formatDay(date, timeZone)}`
            : `${info.title_vi}: chưa đạt. ${info.description_vi}`;
          return (
            <li
              key={key}
              aria-label={label}
              className={cn(
                'flex min-w-0 flex-col items-center gap-2 rounded-2xl p-2.5 pt-3 text-center',
                date ? 'bg-gold/10 ring-1 ring-gold/30 ring-inset' : 'bg-text/[0.03]',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'inline-flex size-12 shrink-0 items-center justify-center rounded-full',
                  date
                    ? 'bg-gradient-to-b from-[#f6cf6a] to-[#c98a1b] text-[#3a2604] shadow-[0_4px_0_#8f6417,0_8px_18px_-8px_#c98a1b]'
                    : 'border-2 border-dashed border-border text-muted',
                )}
              >
                <Icon className="size-5" strokeWidth={2.2} />
              </span>
              <div className="min-w-0">
                <p className={cn('text-[13px] font-bold leading-tight', !date && 'text-muted')}>{info.title_vi}</p>
                {date ? (
                  <p className="mt-0.5 text-xs text-muted">Đã đạt ngày {formatDay(date, timeZone)}</p>
                ) : (
                  <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted">
                    <span className="sr-only">Chưa đạt · </span>
                    {info.description_vi}
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
