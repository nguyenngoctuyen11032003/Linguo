import { useCallback, useEffect, useReducer, useState } from 'react';
import type { CreateAssignmentInput, CreateInviteInput, TeacherAssignment, TeacherClass, TeacherInvite, TeacherRoster } from '@linguo/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { getSupabase } from '@/lib/supabase';
import { teacherErrorCode, teacherErrorMessage } from './error-map';
import {
  archiveTeacherClass,
  createClassAssignment,
  createClassInvite,
  deleteClassAssignment,
  fetchClassRoster,
  removeClassMember,
  renameTeacherClass,
  revokeClassInvite,
} from './service';
import { requireClient } from './useTeacherClasses';

export interface ClassRosterApi {
  status: 'loading' | 'ready' | 'error' | 'not_found';
  roster: TeacherRoster | null;
  /** Vietnamese message when status is 'error'. */
  error: string | null;
  reload: () => void;
  /** Mutations reject with the raw RPC error: map it with teacherErrorMessage. */
  rename: (name: string) => Promise<TeacherClass>;
  setArchived: (archived: boolean) => Promise<TeacherClass>;
  createInvite: (input: CreateInviteInput) => Promise<TeacherInvite>;
  revokeInvite: (code: string) => Promise<void>;
  removeMember: (userId: string) => Promise<void>;
  createAssignment: (input: CreateAssignmentInput) => Promise<TeacherAssignment>;
  deleteAssignment: (assignmentId: string) => Promise<void>;
}

interface Loaded {
  key: string;
  status: ClassRosterApi['status'];
  roster: TeacherRoster | null;
  error: string | null;
}

/** Same order as teacher_class_roster: due date (none last), then creation. */
export function sortAssignments(list: TeacherAssignment[]): TeacherAssignment[] {
  return [...list].sort((a, b) => {
    if (a.due_at !== b.due_at) {
      if (a.due_at === null) return 1;
      if (b.due_at === null) return -1;
      const byDue = a.due_at.localeCompare(b.due_at);
      if (byDue !== 0) return byDue;
    }
    return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
  });
}

/** One class as its teacher sees it: class, members with aggregate progress only, assignments with completion. */
export function useClassRoster(classId: string): ClassRosterApi {
  const { user } = useAuth();
  const key = `${user?.id ?? ''}:${classId}`;
  const client = getSupabase();
  const [attempt, reload] = useReducer((n: number) => n + 1, 0);
  const [loaded, setLoaded] = useState<Loaded>({ key, status: 'loading', roster: null, error: null });

  useEffect(() => {
    if (!user?.id) return;
    if (!client) {
      setLoaded({ key, status: 'error', roster: null, error: teacherErrorMessage(new Error('supabase_unavailable')) });
      return;
    }
    let active = true;
    setLoaded((prev) => (prev.key === key && prev.roster ? prev : { key, status: 'loading', roster: null, error: null }));
    fetchClassRoster(client, classId)
      .then((roster) => {
        if (active) setLoaded({ key, status: 'ready', roster, error: null });
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (teacherErrorCode(error) === 'class_not_found') {
          setLoaded({ key, status: 'not_found', roster: null, error: null });
          return;
        }
        setLoaded((prev) => ({ key, status: 'error', roster: prev.key === key ? prev.roster : null, error: teacherErrorMessage(error) }));
      });
    return () => {
      active = false;
    };
  }, [client, user?.id, classId, key, attempt]);

  const update = useCallback((fn: (roster: TeacherRoster) => TeacherRoster) => {
    setLoaded((prev) => (prev.roster ? { ...prev, roster: fn(prev.roster) } : prev));
  }, []);

  const rename = useCallback(
    async (name: string) => {
      const updated = await renameTeacherClass(requireClient(client), classId, name);
      update((r) => ({ ...r, class: updated }));
      return updated;
    },
    [client, classId, update],
  );

  const setArchived = useCallback(
    async (archived: boolean) => {
      const updated = await archiveTeacherClass(requireClient(client), classId, archived);
      update((r) => ({ ...r, class: updated }));
      return updated;
    },
    [client, classId, update],
  );

  const createInvite = useCallback(
    async (input: CreateInviteInput) => {
      const invite = await createClassInvite(requireClient(client), classId, input);
      update((r) => ({ ...r, class: { ...r.class, invites: [...r.class.invites, invite] } }));
      return invite;
    },
    [client, classId, update],
  );

  const revokeInvite = useCallback(
    async (code: string) => {
      await revokeClassInvite(requireClient(client), code);
      update((r) => ({ ...r, class: { ...r.class, invites: r.class.invites.filter((i) => i.code !== code) } }));
    },
    [client, update],
  );

  const removeMember = useCallback(
    async (userId: string) => {
      await removeClassMember(requireClient(client), classId, userId);
      // Per-assignment completion counts change with the membership: refetch them from the server.
      update((r) => ({ ...r, members: r.members.filter((m) => m.user_id !== userId), class: { ...r.class, member_count: Math.max(0, r.class.member_count - 1) } }));
      reload();
    },
    [client, classId, update],
  );

  const createAssignment = useCallback(
    async (input: CreateAssignmentInput) => {
      const created = await createClassAssignment(requireClient(client), classId, input);
      update((r) => ({
        ...r,
        assignments: sortAssignments([...r.assignments, created]),
        class: { ...r.class, assignment_count: r.class.assignment_count + 1 },
        members: r.members.map((m) => ({ ...m, assignments_total: m.assignments_total + 1 })),
      }));
      return created;
    },
    [client, classId, update],
  );

  const deleteAssignment = useCallback(
    async (assignmentId: string) => {
      await deleteClassAssignment(requireClient(client), assignmentId);
      update((r) => ({
        ...r,
        assignments: r.assignments.filter((a) => a.id !== assignmentId),
        class: { ...r.class, assignment_count: Math.max(0, r.class.assignment_count - 1) },
      }));
      // Members' done/total counts depend on which assignments they finished: refetch them.
      reload();
    },
    [client, update],
  );

  const current = loaded.key === key ? loaded : { status: 'loading' as const, roster: null, error: null };
  return {
    status: current.status,
    roster: current.roster,
    error: current.error,
    reload,
    rename,
    setArchived,
    createInvite,
    revokeInvite,
    removeMember,
    createAssignment,
    deleteAssignment,
  };
}
