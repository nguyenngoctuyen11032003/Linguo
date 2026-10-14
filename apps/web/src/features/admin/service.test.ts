import { describe, expect, it } from 'vitest';
import { fakeClient } from '../../../tests/unit/fake-supabase';
import { auditEntryFixture, overviewFixture, REPORT_A1, REPORT_A2, reportListFixture, sourceFixture } from './admin-fixtures';
import {
  adminContentPath,
  getAdminOverview,
  getStaffRole,
  hasStaffRole,
  listAdminAuditLog,
  listAdminReports,
  listAdminSources,
  reportTargetToAdminKind,
  resolveAdminReports,
} from './service';

describe('getStaffRole', () => {
  it('returns the role or null', async () => {
    const staff = fakeClient({}, { staff_role: { data: 'reviewer' } });
    await expect(getStaffRole(staff)).resolves.toBe('reviewer');
    expect(staff.rpcCalls).toEqual([['staff_role', {}]]);
    await expect(getStaffRole(fakeClient({}, { staff_role: { data: null } }))).resolves.toBeNull();
  });

  it('rejects unknown roles and rethrows RPC errors', async () => {
    await expect(getStaffRole(fakeClient({}, { staff_role: { data: 'owner' } }))).rejects.toThrow('invalid_payload');
    const error = { message: 'not_authenticated', code: 'P0001' };
    await expect(getStaffRole(fakeClient({}, { staff_role: { data: null, error } }))).rejects.toBe(error);
  });
});

describe('admin reads', () => {
  it('parses the overview', async () => {
    const client = fakeClient({}, { admin_content_overview: { data: overviewFixture() } });
    await expect(getAdminOverview(client)).resolves.toEqual(overviewFixture());
    await expect(getAdminOverview(fakeClient({}, { admin_content_overview: { data: { counts: 'x' } } }))).rejects.toThrow('invalid_payload');
  });

  it('parses sources, treating null as an empty list', async () => {
    await expect(listAdminSources(fakeClient({}, { admin_list_sources: { data: [sourceFixture()] } }))).resolves.toEqual([sourceFixture()]);
    await expect(listAdminSources(fakeClient({}, { admin_list_sources: { data: null } }))).resolves.toEqual([]);
  });

  it('pages the report queue and passes null filters', async () => {
    const client = fakeClient({}, { admin_list_reports: { data: reportListFixture() } });
    const result = await listAdminReports(client, { status: null, kind: 'exercise', page: 2 });
    expect(result.groups).toHaveLength(2);
    expect(client.rpcCalls).toEqual([['admin_list_reports', { p_status: null, p_kind: 'exercise', p_limit: 20, p_offset: 40 }]]);
  });

  it('reads the audit log with a limit', async () => {
    const client = fakeClient({}, { admin_audit_log_recent: { data: [auditEntryFixture()] } });
    await expect(listAdminAuditLog(client, 50)).resolves.toEqual([auditEntryFixture()]);
    expect(client.rpcCalls).toEqual([['admin_audit_log_recent', { p_limit: 50 }]]);
  });

  it('rethrows staff_forbidden', async () => {
    const error = { message: 'staff_forbidden', code: '42501' };
    await expect(listAdminAuditLog(fakeClient({}, { admin_audit_log_recent: { data: null, error } }))).rejects.toBe(error);
  });
});

describe('resolveAdminReports', () => {
  it('sends the ids, status and trimmed note', async () => {
    const client = fakeClient({}, { admin_resolve_report: { data: { updated: 2 } } });
    await expect(resolveAdminReports(client, [REPORT_A1, REPORT_A2], 'fixed', '  Đã sửa  ')).resolves.toBe(2);
    expect(client.rpcCalls).toEqual([
      ['admin_resolve_report', { p_report_ids: [REPORT_A1, REPORT_A2], p_status: 'fixed', p_resolution_note: 'Đã sửa' }],
    ]);
  });

  it('sends an empty note as null and skips an empty selection', async () => {
    const client = fakeClient({}, { admin_resolve_report: { data: { updated: 1 } } });
    await resolveAdminReports(client, [REPORT_A1], 'rejected', '   ');
    expect(client.rpcCalls[0]?.[1]).toMatchObject({ p_resolution_note: null });
    await expect(resolveAdminReports(client, [], 'fixed', '')).resolves.toBe(0);
    expect(client.rpcCalls).toHaveLength(1);
  });

  it('refuses a note longer than 500 characters', async () => {
    const client = fakeClient({}, { admin_resolve_report: { data: { updated: 1 } } });
    await expect(resolveAdminReports(client, [REPORT_A1], 'fixed', 'x'.repeat(501))).rejects.toThrow('note_too_long');
    expect(client.rpcCalls).toHaveLength(0);
  });
});

describe('helpers', () => {
  it('maps report targets to admin content paths', () => {
    expect(reportTargetToAdminKind('learning_item')).toBe('learning_item');
    expect(reportTargetToAdminKind('exam_question')).toBe('exam_question');
    expect(adminContentPath('exercise', REPORT_A1)).toBe(`/quan-tri/noi-dung/exercise/${REPORT_A1}`);
  });

  it('ranks staff roles', () => {
    expect(hasStaffRole('admin', 'reviewer')).toBe(true);
    expect(hasStaffRole('reviewer', 'reviewer')).toBe(true);
    expect(hasStaffRole('editor', 'admin')).toBe(false);
    expect(hasStaffRole(null, 'editor')).toBe(false);
  });
});
