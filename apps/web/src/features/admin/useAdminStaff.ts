import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminFoundUser, AdminStaffHistoryEntry, AdminStaffMember, AdminTeacher, StaffRole } from '@linguo/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { getSupabase } from '@/lib/supabase';
import { adminErrorCode, adminErrorMessage } from './error-map';
import {
  STAFF_HISTORY_PAGE_SIZE,
  findAdminUser,
  grantStaffRole,
  listAdminStaff,
  listAdminTeachers,
  listStaffHistory,
  setTeacherStatus,
} from './staff';
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

export interface AdminTeachersState extends AdminResourceState<AdminTeacher[]> {
  /** grant_teacher_role; `grant` false revokes. On success the list is reloaded. */
  setTeacher: (userId: string, grant: boolean) => Promise<StaffActionOutcome<boolean>>;
  /** User id whose teacher status is being saved, while a change runs. */
  savingTeacherId: string | null;
}

/** Teacher list + grant/revoke for the teacher section of /quan-tri/nhan-su (admin only). One change at a time. */
export function useAdminTeachers(): AdminTeachersState {
  const resource = useAdminResource('teachers', listAdminTeachers);
  const { reload } = resource;
  const [savingTeacherId, setSavingTeacherId] = useState<string | null>(null);
  const savingRef = useRef(false);

  const setTeacher = useCallback(
    async (userId: string, grant: boolean): Promise<StaffActionOutcome<boolean>> => {
      const client = getSupabase();
      if (!client) return failure(new Error('supabase_unavailable'));
      if (savingRef.current) return { ok: false, code: null, message: 'Đang lưu, vui lòng đợi.' };
      savingRef.current = true;
      setSavingTeacherId(userId);
      try {
        const result = await setTeacherStatus(client, userId, grant);
        reload();
        return { ok: true, value: result.is_teacher };
      } catch (error) {
        return failure(error);
      } finally {
        savingRef.current = false;
        setSavingTeacherId(null);
      }
    },
    [reload],
  );

  return { ...resource, setTeacher, savingTeacherId };
}

export interface AdminStaffHistoryState {
  status: 'loading' | 'ready' | 'error';
  /** Newest first; grows with each "Xem thêm". */
  entries: AdminStaffHistoryEntry[];
  /** Every matching entry on the server. */
  total: number;
  /** Vietnamese message when the first page or a further page failed. */
  error: string | null;
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
  reload: () => void;
}

/**
 * History of role and teacher changes for /quan-tri/nhan-su (admin only), a page at a time. `refreshKey` changes after
 * every grant or revoke made on the page: the first page is then fetched again.
 */
export function useAdminStaffHistory(refreshKey: number): AdminStaffHistoryState {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const [state, setState] = useState<{ owner: string; status: 'loading' | 'ready' | 'error'; entries: AdminStaffHistoryEntry[]; total: number; error: string | null }>({
    owner: userId,
    status: 'loading',
    entries: [],
    total: 0,
    error: null,
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const moreBusy = useRef(false);

  useEffect(() => {
    if (!userId) return;
    const client = getSupabase();
    const mine = ++generation.current;
    if (!client) {
      setState({ owner: userId, status: 'error', entries: [], total: 0, error: adminErrorMessage(new Error('supabase_unavailable')) });
      return;
    }
    setState((prev) => (prev.owner === userId ? { ...prev, status: prev.entries.length > 0 ? prev.status : 'loading', error: null } : { owner: userId, status: 'loading', entries: [], total: 0, error: null }));
    setMoreError(null);
    listStaffHistory(client, STAFF_HISTORY_PAGE_SIZE, 0)
      .then((page) => {
        if (generation.current === mine) setState({ owner: userId, status: 'ready', entries: page.entries, total: page.total, error: null });
      })
      .catch((cause: unknown) => {
        if (generation.current === mine) setState((prev) => ({ owner: userId, status: 'error', entries: prev.owner === userId ? prev.entries : [], total: prev.owner === userId ? prev.total : 0, error: adminErrorMessage(cause) }));
      });
  }, [userId, refreshKey, attempt]);

  const loadMore = useCallback(() => {
    const client = getSupabase();
    if (!client || moreBusy.current) return;
    moreBusy.current = true;
    setLoadingMore(true);
    setMoreError(null);
    const mine = generation.current;
    listStaffHistory(client, STAFF_HISTORY_PAGE_SIZE, state.entries.length)
      .then((page) => {
        if (generation.current !== mine) return;
        setState((prev) => ({ ...prev, total: page.total, entries: [...prev.entries, ...page.entries.filter((e) => !prev.entries.some((p) => p.id === e.id))] }));
      })
      .catch((cause: unknown) => {
        if (generation.current === mine) setMoreError(adminErrorMessage(cause));
      })
      .finally(() => {
        moreBusy.current = false;
        setLoadingMore(false);
      });
  }, [state.entries.length]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const current = state.owner === userId ? state : { ...state, status: 'loading' as const, entries: [], total: 0, error: null };
  return {
    status: current.status,
    entries: current.entries,
    total: current.total,
    error: moreError ?? current.error,
    loadingMore,
    hasMore: current.entries.length < current.total,
    loadMore,
    reload,
  };
}
