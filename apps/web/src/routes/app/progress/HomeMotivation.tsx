import { useProgressDashboard } from '@/features/progress/useProgressDashboard';
import { MotivationStrip } from './MotivationStrip';
import { useBadgeToast } from './useBadgeToast';

/**
 * Home's motivation strip for the current path. Renders nothing while loading, on error, or when the learner has
 * switched motivation off (the dashboard then answers `motivation: null`).
 */
export function HomeMotivation({ pathId }: { pathId: string }) {
  const { data } = useProgressDashboard(pathId, 7);
  const motivation = data?.motivation ?? null;
  useBadgeToast(pathId, motivation);
  if (!motivation) return null;
  return <MotivationStrip motivation={motivation} />;
}
