import { useCallback, useRef, useState } from 'react';
import type { AdminContentDetail, AdminContentKind, AdminContentList, ContentStatus, ReportTargetKind } from '@linguo/shared';
import { getSupabase } from '@/lib/supabase';
import { getContent, listContent, setContentStatus, type ContentFilters } from './content';
import { adminErrorCode, adminErrorMessage } from './error-map';
import { getAdminItemOpenReports } from './service';
import { useAdminResource, type AdminResourceState } from './useAdminOverview';

/** admin_list_content for the given filters (spec 11 §4 "Nội dung"); the previous page stays while the next loads. */
export function useAdminContentList(filters: ContentFilters): AdminResourceState<AdminContentList> {
  const { kind, language, status, search, page } = filters;
  const key = `content:${kind}:${language ?? '*'}:${status ?? '*'}:${search.trim()}:${page}`;
  return useAdminResource(key, (client) => listContent(client, { kind, language, status, search, page }));
}

export interface SetStatusInput {
  status: ContentStatus;
  note: string;
  force: boolean;
}

export type SetStatusOutcome = { ok: true; status: ContentStatus } | { ok: false; code: string | null; message: string };

export interface AdminContentDetailState extends AdminResourceState<AdminContentDetail> {
  /** Calls admin_set_status; on success the detail is reloaded (status, reviewer, revisions). */
  changeStatus: (input: SetStatusInput) => Promise<SetStatusOutcome>;
  saving: boolean;
}

const NEVER = new Promise<never>(() => {});

/** admin_get_content + admin_set_status for one row. Stays 'loading' while kind or id is missing. */
export function useAdminContentDetail(kind: AdminContentKind | null, id: string | null): AdminContentDetailState {
  const resource = useAdminResource(`content-detail:${kind ?? ''}:${id ?? ''}`, (client) =>
    kind && id ? getContent(client, kind, id) : NEVER,
  );
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const { reload } = resource;

  const changeStatus = useCallback(
    async (input: SetStatusInput): Promise<SetStatusOutcome> => {
      const client = getSupabase();
      if (!client || !kind || !id) return { ok: false, code: null, message: adminErrorMessage(new Error('supabase_unavailable')) };
      if (savingRef.current) return { ok: false, code: null, message: 'Đang lưu, vui lòng đợi.' };
      savingRef.current = true;
      setSaving(true);
      try {
        const status = await setContentStatus(client, { kind, id, status: input.status, note: input.note, force: input.force });
        reload();
        return { ok: true, status };
      } catch (error) {
        return { ok: false, code: adminErrorCode(error), message: adminErrorMessage(error) };
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [kind, id, reload],
  );

  // While another row loads the resource keeps the previous row's data; never hand it out for a different id/kind.
  if (resource.data !== null && (resource.data.id !== id || resource.data.kind !== kind)) {
    return { ...resource, status: resource.status === 'error' ? 'error' : 'loading', data: null, changeStatus, saving };
  }
  return { ...resource, changeStatus, saving };
}

interface ItemOpenReports {
  kind: ReportTargetKind;
  id: string;
  count: number;
}

/**
 * admin_item_open_reports for one reportable row (spec 11 §4 "Báo lỗi liên quan"), so the count survives a refresh
 * or a direct link. data is null while kind or id is missing, while loading, or when it belongs to another row.
 */
export function useAdminItemOpenReports(kind: ReportTargetKind | null, id: string | null): AdminResourceState<number> {
  const resource = useAdminResource<ItemOpenReports>(`item-open-reports:${kind ?? ''}:${id ?? ''}`, (client) =>
    kind && id ? getAdminItemOpenReports(client, kind, id).then((count) => ({ kind, id, count })) : NEVER,
  );
  const own = resource.data && resource.data.kind === kind && resource.data.id === id ? resource.data.count : null;
  return { ...resource, data: own };
}
