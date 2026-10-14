import { useCallback, useState } from 'react';
import type { AdminReportList } from '@linguo/shared';
import { getSupabase } from '@/lib/supabase';
import { adminErrorMessage } from './error-map';
import { listAdminReports, resolveAdminReports, type AdminReportQuery, type ReportResolveStatus } from './service';
import { useAdminResource, type AdminResourceState } from './useAdminOverview';

export interface AdminReportsState extends AdminResourceState<AdminReportList> {
  /** Marks the reports, then reloads the queue. Resolves to the number updated; rejects with a Vietnamese message. */
  resolve: (reportIds: readonly string[], status: ReportResolveStatus, note: string) => Promise<number>;
  resolving: boolean;
}

/** admin_list_reports + admin_resolve_report (editor+), grouped by target. */
export function useAdminReports(query: AdminReportQuery): AdminReportsState {
  const key = `reports:${query.status ?? '*'}:${query.kind ?? '*'}:${query.page}:${query.pageSize ?? ''}`;
  const resource = useAdminResource(key, (client) => listAdminReports(client, query));
  const [resolving, setResolving] = useState(false);
  const { reload } = resource;

  const resolve = useCallback(
    async (reportIds: readonly string[], status: ReportResolveStatus, note: string) => {
      const client = getSupabase();
      if (!client) throw new Error(adminErrorMessage(new Error('supabase_unavailable')));
      setResolving(true);
      try {
        const updated = await resolveAdminReports(client, reportIds, status, note);
        reload();
        return updated;
      } catch (error) {
        throw new Error(adminErrorMessage(error), { cause: error });
      } finally {
        setResolving(false);
      }
    },
    [reload],
  );

  return { ...resource, resolve, resolving };
}
