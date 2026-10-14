import { useEffect } from 'react';
import { BADGES, type BadgeKey, type Motivation } from '@linguo/shared';
import { useToast } from '@/components/ui/Toast';
import { track } from '@/features/analytics';

/**
 * Badges already celebrated in this tab, as `pathId:badgeKey`. get_progress_dashboard reports a badge in
 * `new_badges` only on the call that awarded it, but the same response can be rendered again (StrictMode,
 * remounts, Home then Tiến độ), so the toast is guarded here too.
 */
const celebrated = new Set<string>();

/** Test helper: forget which badges were celebrated. */
export function resetCelebratedBadges(): void {
  celebrated.clear();
}

export function badgeToastMessage(keys: BadgeKey[]): string {
  const titles = keys.map((key) => `"${BADGES[key].title_vi}"`);
  if (keys.length === 1) return `Bạn vừa nhận huy hiệu ${titles[0]}.`;
  return `Bạn vừa nhận ${keys.length} huy hiệu mới: ${titles.join(', ')}.`;
}

/** Shows one toast per newly earned set of badges (once per badge and path) and records `badge_earned`. */
export function useBadgeToast(pathId: string | null, motivation: Motivation | null | undefined): void {
  const toast = useToast();
  const fresh = motivation?.new_badges;

  useEffect(() => {
    if (!pathId || !fresh || fresh.length === 0) return;
    const keys = fresh.filter((key) => !celebrated.has(`${pathId}:${key}`));
    if (keys.length === 0) return;
    for (const key of keys) {
      celebrated.add(`${pathId}:${key}`);
      track('badge_earned', { badge: key });
    }
    toast.show({ tone: 'success', message: badgeToastMessage(keys) });
  }, [pathId, fresh, toast]);
}
