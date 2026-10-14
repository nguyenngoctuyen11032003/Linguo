import type { AdminAuditEntry } from '@linguo/shared';
import { ADMIN_AUDIT_DEFAULT_LIMIT, listAdminAuditLog } from './service';
import { useAdminResource, type AdminResourceState } from './useAdminOverview';

/** admin_audit_log_recent(p_limit) (admin only). */
export function useAdminAudit(limit = ADMIN_AUDIT_DEFAULT_LIMIT): AdminResourceState<AdminAuditEntry[]> {
  return useAdminResource(`audit:${limit}`, (client) => listAdminAuditLog(client, limit));
}
