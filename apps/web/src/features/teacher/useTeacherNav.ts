import { TEACHER_NAV_ITEM, type NavItem } from '@/components/layout/nav';
import { useIsTeacher } from './useIsTeacher';

const NONE: NavItem[] = [];
const TEACHER: NavItem[] = [TEACHER_NAV_ITEM];

/** Extra navigation entries for teachers ("Lớp học (giáo viên)"); empty for everyone else or while unknown. */
export function useTeacherNav(): NavItem[] {
  const { isTeacher } = useIsTeacher();
  return isTeacher ? TEACHER : NONE;
}
