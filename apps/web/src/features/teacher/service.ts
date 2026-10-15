import {
  LEVELS,
  deletedAssignmentSchema,
  removedMemberSchema,
  revokedInviteSchema,
  teacherAssignmentSchema,
  teacherClassListSchema,
  teacherClassSchema,
  teacherInviteSchema,
  teacherRosterSchema,
  type ClassLanguage,
  type CreateAssignmentInput,
  type CreateInviteInput,
  type TeacherAssignment,
  type TeacherClass,
  type TeacherInvite,
  type TeacherRoster,
} from '@linguo/shared';
import { z } from 'zod';
import { callRpc, parse } from '@/features/lesson-player/service';
import type { AppSupabaseClient } from '@/lib/supabase';

// Teacher tools (PRD P2). Same transport as the other RPC services: jsonb validated with the shared zod contracts,
// abandoned after 15 s. Teachers only ever receive aggregates about members (teacher_class_roster), never answers.

export async function fetchIsTeacher(client: AppSupabaseClient): Promise<boolean> {
  return parse(z.boolean(), (await callRpc(client, 'is_teacher', {})) ?? false);
}

export async function fetchTeacherClasses(client: AppSupabaseClient): Promise<TeacherClass[]> {
  return parse(teacherClassListSchema, (await callRpc(client, 'teacher_list_classes', {})) ?? []);
}

export async function createTeacherClass(client: AppSupabaseClient, name: string, language: ClassLanguage): Promise<TeacherClass> {
  return parse(teacherClassSchema, await callRpc(client, 'teacher_create_class', { p_name: name, p_language: language }));
}

export async function renameTeacherClass(client: AppSupabaseClient, classId: string, name: string): Promise<TeacherClass> {
  return parse(teacherClassSchema, await callRpc(client, 'teacher_rename_class', { p_class_id: classId, p_name: name }));
}

export async function archiveTeacherClass(client: AppSupabaseClient, classId: string, archived: boolean): Promise<TeacherClass> {
  return parse(teacherClassSchema, await callRpc(client, 'teacher_archive_class', { p_class_id: classId, p_archived: archived }));
}

export async function createClassInvite(client: AppSupabaseClient, classId: string, input: CreateInviteInput): Promise<TeacherInvite> {
  return parse(
    teacherInviteSchema,
    await callRpc(client, 'teacher_create_invite', { p_class_id: classId, p_expires_hours: input.expires_hours, p_max_uses: input.max_uses }),
  );
}

export async function revokeClassInvite(client: AppSupabaseClient, code: string): Promise<void> {
  parse(revokedInviteSchema, await callRpc(client, 'teacher_revoke_invite', { p_code: code }));
}

export async function removeClassMember(client: AppSupabaseClient, classId: string, userId: string): Promise<void> {
  parse(removedMemberSchema, await callRpc(client, 'teacher_remove_member', { p_class_id: classId, p_user_id: userId }));
}

export async function fetchClassRoster(client: AppSupabaseClient, classId: string): Promise<TeacherRoster> {
  return parse(teacherRosterSchema, await callRpc(client, 'teacher_class_roster', { p_class_id: classId }));
}

export async function createClassAssignment(client: AppSupabaseClient, classId: string, input: CreateAssignmentInput): Promise<TeacherAssignment> {
  const args: Record<string, unknown> = {
    p_class_id: classId,
    p_kind: input.kind,
    p_ref_id: input.kind === 'review' ? null : input.ref_id,
    p_target_count: input.kind === 'review' ? input.target_count : null,
    p_due_at: input.due_at ?? null,
    p_note: input.note ?? null,
  };
  return parse(teacherAssignmentSchema, await callRpc(client, 'teacher_create_assignment', args));
}

export async function deleteClassAssignment(client: AppSupabaseClient, assignmentId: string): Promise<void> {
  parse(deletedAssignmentSchema, await callRpc(client, 'teacher_delete_assignment', { p_assignment_id: assignmentId }));
}

// ---------------------------------------------------------------------------
// Catalog: published lessons and exam forms of one language (RLS lets every signed-in user read published content).
// ---------------------------------------------------------------------------

export interface CatalogLesson {
  id: string;
  title: string;
  /** "A1 · Unit title" style group label for <optgroup>. */
  group: string;
}

export interface CatalogExam {
  id: string;
  title: string;
}

export interface TeacherCatalog {
  lessons: CatalogLesson[];
  exams: CatalogExam[];
}

const localizedTitle = z.union([z.object({ vi: z.string() }).loose(), z.string()]).transform((t) => (typeof t === 'string' ? t : t.vi));

const lessonRowSchema = z.object({
  id: z.string(),
  title: localizedTitle,
  level_code: z.string(),
  order_index: z.number(),
  unit_id: z.string(),
});
const unitRowSchema = z.object({ id: z.string(), title: localizedTitle, order_index: z.number() });
const examRowSchema = z.object({ id: z.string(), title_vi: z.string(), level_from: z.string() });

function levelRank(language: ClassLanguage, level: string): number {
  const list = (LEVELS as Record<string, readonly string[]>)[language] ?? [];
  const index = list.indexOf(level);
  return index === -1 ? list.length : index;
}

/** Orders lessons by level, then unit, then position, and labels each with its level and unit. */
export function buildLessonCatalog(
  language: ClassLanguage,
  lessons: z.infer<typeof lessonRowSchema>[],
  units: z.infer<typeof unitRowSchema>[],
  levelLabel: (level: string) => string,
): CatalogLesson[] {
  const unitById = new Map(units.map((u) => [u.id, u]));
  return [...lessons]
    .sort((a, b) => {
      const ua = unitById.get(a.unit_id);
      const ub = unitById.get(b.unit_id);
      return (
        levelRank(language, a.level_code) - levelRank(language, b.level_code) ||
        (ua?.order_index ?? 0) - (ub?.order_index ?? 0) ||
        (ua?.title ?? '').localeCompare(ub?.title ?? '', 'vi') ||
        a.order_index - b.order_index ||
        a.id.localeCompare(b.id)
      );
    })
    .map((l) => {
      const unit = unitById.get(l.unit_id);
      const level = levelLabel(l.level_code);
      return { id: l.id, title: l.title, group: unit ? `${level} · ${unit.title}` : level };
    });
}

export async function fetchTeacherCatalog(
  client: AppSupabaseClient,
  language: ClassLanguage,
  levelLabel: (level: string) => string,
): Promise<TeacherCatalog> {
  const [lessonsRes, examsRes] = await Promise.all([
    client.from('lessons').select('id, title, level_code, order_index, unit_id').eq('language_code', language).eq('status', 'published').limit(1000),
    client.from('exam_forms').select('id, title_vi, level_from').eq('language_code', language).eq('status', 'published').limit(200),
  ]);
  if (lessonsRes.error) throw lessonsRes.error;
  if (examsRes.error) throw examsRes.error;
  const lessons = parse(lessonRowSchema.array(), lessonsRes.data ?? []);
  const unitIds = [...new Set(lessons.map((l) => l.unit_id))];
  let units: z.infer<typeof unitRowSchema>[] = [];
  if (unitIds.length > 0) {
    const unitsRes = await client.from('units').select('id, title, order_index').in('id', unitIds);
    if (unitsRes.error) throw unitsRes.error;
    units = parse(unitRowSchema.array(), unitsRes.data ?? []);
  }
  const exams = parse(examRowSchema.array(), examsRes.data ?? [])
    .sort((a, b) => levelRank(language, a.level_from) - levelRank(language, b.level_from) || a.title_vi.localeCompare(b.title_vi, 'vi'))
    .map((e) => ({ id: e.id, title: e.title_vi }));
  return { lessons: buildLessonCatalog(language, lessons, units, levelLabel), exams };
}
