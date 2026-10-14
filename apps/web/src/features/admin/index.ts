export { adminErrorCode, adminErrorMessage } from './error-map';
export {
  ADMIN_AUDIT_DEFAULT_LIMIT,
  ADMIN_KIND_LABELS_VI,
  ADMIN_REPORT_PAGE_SIZE,
  REPORT_RESOLVE_STATUSES,
  REPORT_STATUS_LABELS_VI,
  REPORT_TARGET_LABELS_VI,
  STAFF_ROLE_LABELS_VI,
  adminContentPath,
  getAdminOverview,
  getStaffRole,
  hasStaffRole,
  listAdminAuditLog,
  listAdminReports,
  listAdminSources,
  reportTargetToAdminKind,
  resolveAdminReports,
  type AdminReportQuery,
  type ReportResolveStatus,
} from './service';
export { useAdminAudit } from './useAdminAudit';
export { useAdminOverview, useAdminResource, type AdminResourceState } from './useAdminOverview';
export { useAdminReports, type AdminReportsState } from './useAdminReports';
export { useAdminSources } from './useAdminSources';
export { StaffRoleContext, useAdminRole, useStaffRole, type StaffRoleState } from './useStaffRole';
export { useAdminAnalytics, type AdminAnalyticsData } from './useAdminAnalytics';
export { useAdminContentDetail, useAdminContentList, type AdminContentDetailState, type SetStatusInput, type SetStatusOutcome } from './useAdminContent';
export { yamlHint, type YamlHint } from './yaml-hint';
