import { useCallback, useRef, useState } from 'react';
import type { AdminFoundUser, AdminStaffMember, StaffRole } from '@linguo/shared';
import { getSupabase } from '@/lib/supabase';
import { adminErrorCode, adminErrorMessage } from './error-map';
import { findAdminUser, grantStaffRole, listAdminStaff } from './staff';
import { useAdminResource, type AdminResourceState } from './useAdminOverview';

export type StaffActionOutcome<T = null> = { ok: true; value: T } | { ok: false; code: string | null; message: string };

export interface AdminStaffState extends AdminResourceState<AdminStaffMember[]> {
  /** admin_grant_role; `role` null revokes. On success the list is reloaded. */
  setRole: (userId: string, role: StaffRole | null) => Promise<StaffActionOutcome<StaffRole | null>>;
  /** admin_find_user by email or user id; value null = no such account. */
  findUser: (query: string) => Promise<StaffActionOutcome<AdminFoundUser | null>>;
  /** User id whose role is being saved, while a change runs. */
  savingUserId: string | null;
}

function failure(error: unknown): { ok: false; code: string | null; message: string } {
  return { ok: false, code: adminErrorCode(error), message: adminErrorMessage(error) };
}

/** Staff list + role changes for /quan-tri/nhan-su (admin only). One change at a time. */
export function useAdminStaff(): AdminStaffState {
  const resource = useAdminResource('staff', listAdminStaff);
  const { reload } = resource;
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const savingRef = useRef(false);

  const setRole = useCallback(
    async (userId: string, role: StaffRole | null): Promise<StaffActionOutcome<StaffRole | null>> => {
      const client = getSupabase();
      if (!client) return failure(new Error('supabase_unavailable'));
      if (savingRef.current) return { ok: false, code: null, message: 'Đang lưu, vui lòng đợi.' };
      savingRef.current = true;
      setSavingUserId(userId);
      try {
        const result = await grantStaffRole(client, userId, role);
        reload();
        return { ok: true, value: result.role };
      } catch (error) {
        return failure(error);
      } finally {
        savingRef.current = false;
        setSavingUserId(null);
      }
    },
    [reload],
  );

  const findUser = useCallback(async (query: string): Promise<StaffActionOutcome<AdminFoundUser | null>> => {
    const client = getSupabase();
    if (!client) return failure(new Error('supabase_unavailable'));
    try {
      return { ok: true, value: await findAdminUser(client, query) };
    } catch (error) {
      return failure(error);
    }
  }, []);

  return { ...resource, setRole, findUser, savingUserId };
}
