import type { AdminAiUsage, AdminAnalytics, AdminAnalyticsRange } from '@linguo/shared';
import { getAiUsage, getAnalytics } from './analytics';
import { useAdminResource, type AdminResourceState } from './useAdminOverview';

export interface AdminAnalyticsData {
  analytics: AdminAnalytics;
  aiUsage: AdminAiUsage;
}

/** admin_analytics + admin_ai_usage (admin only) for one range, loaded together; the previous range stays while loading. */
export function useAdminAnalytics(range: AdminAnalyticsRange): AdminResourceState<AdminAnalyticsData> {
  return useAdminResource(`analytics:${range}`, async (client) => {
    const [analytics, aiUsage] = await Promise.all([getAnalytics(client, range), getAiUsage(client, range)]);
    return { analytics, aiUsage };
  });
}
