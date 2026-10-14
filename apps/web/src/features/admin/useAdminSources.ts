import type { AdminSource } from '@linguo/shared';
import { listAdminSources } from './service';
import { useAdminResource, type AdminResourceState } from './useAdminOverview';

/** admin_list_sources() (editor+). */
export function useAdminSources(): AdminResourceState<AdminSource[]> {
  return useAdminResource('sources', listAdminSources);
}
