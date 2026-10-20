import type { TeacherRosterMember } from '@linguo/shared';
import { matchesSearch } from '@/lib/fold';
import { memberName } from './format';

// The class summary table on /giao-vien/lop/:classId: search, filter and sort over the members the server returned
// (teacher_class_roster sends every member, at most 200, with aggregates only), so nothing here asks for more data.

export type RosterSort = 'name' | 'joined' | 'streak' | 'minutes' | 'last_active' | 'assignments' | 'reviews_due' | 'accuracy';

export const ROSTER_SORTS: ReadonlyArray<{ value: RosterSort; label: string }> = [
  { value: 'name', label: 'Tên A → Z' },
  { value: 'joined', label: 'Mới vào lớp trước' },
  { value: 'streak', label: 'Chuỗi ngày dài nhất' },
  { value: 'minutes', label: 'Học nhiều phút nhất (7 ngày)' },
  { value: 'last_active', label: 'Lâu chưa học nhất' },
  { value: 'assignments', label: 'Làm ít bài giao nhất' },
  { value: 'reviews_due', label: 'Nhiều thẻ ôn đến hạn nhất' },
  { value: 'accuracy', label: 'Ôn đúng thấp nhất (30 ngày)' },
];

export type RosterFilter = 'all' | 'inactive' | 'incomplete' | 'no_path' | 'reviews_due';

export const ROSTER_FILTERS: ReadonlyArray<{ value: RosterFilter; label: string }> = [
  { value: 'all', label: 'Tất cả học viên' },
  { value: 'inactive', label: 'Không học trong 7 ngày' },
  { value: 'incomplete', label: 'Chưa xong hết bài giao' },
  { value: 'no_path', label: 'Chưa có lộ trình của lớp' },
  { value: 'reviews_due', label: 'Có thẻ ôn đến hạn' },
];

/** Members shown at first and added by each "Hiện thêm". */
export const ROSTER_PAGE_SIZE = 25;

function matchesFilter(m: TeacherRosterMember, filter: RosterFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'inactive':
      return m.minutes_7d === 0 && m.lessons_completed_7d === 0;
    case 'incomplete':
      return m.assignments_done < m.assignments_total;
    case 'no_path':
      return !m.has_path;
    case 'reviews_due':
      return m.reviews_due > 0;
  }
}

/** Share of assignments done, 1 when the class has none (nobody is behind). */
function doneRatio(m: TeacherRosterMember): number {
  return m.assignments_total > 0 ? m.assignments_done / m.assignments_total : 1;
}

function compareName(a: TeacherRosterMember, b: TeacherRosterMember): number {
  return memberName(a).localeCompare(memberName(b), 'vi') || a.user_id.localeCompare(b.user_id);
}

/** Order of every sort key; members that compare equal fall back to the name, so the order is stable. */
function compareBy(sort: RosterSort, a: TeacherRosterMember, b: TeacherRosterMember): number {
  switch (sort) {
    case 'name':
      return 0;
    case 'joined':
      return b.joined_at.localeCompare(a.joined_at);
    case 'streak':
      return b.streak_current - a.streak_current || b.streak_best - a.streak_best;
    case 'minutes':
      return b.minutes_7d - a.minutes_7d;
    case 'last_active': {
      // Never active first, then the oldest day.
      if (a.last_active_day === b.last_active_day) return 0;
      if (a.last_active_day === null) return -1;
      if (b.last_active_day === null) return 1;
      return a.last_active_day.localeCompare(b.last_active_day);
    }
    case 'assignments':
      return doneRatio(a) - doneRatio(b) || a.assignments_done - b.assignments_done;
    case 'reviews_due':
      return b.reviews_due - a.reviews_due;
    case 'accuracy': {
      // Too few reviews to tell (null) go last.
      if (a.review_accuracy_30d === b.review_accuracy_30d) return 0;
      if (a.review_accuracy_30d === null) return 1;
      if (b.review_accuracy_30d === null) return -1;
      return a.review_accuracy_30d - b.review_accuracy_30d;
    }
  }
}

export interface RosterView {
  query: string;
  filter: RosterFilter;
  sort: RosterSort;
}

export const DEFAULT_ROSTER_VIEW: RosterView = { query: '', filter: 'all', sort: 'name' };

/** The members that match the search and the filter, in the chosen order. Never mutates its input. */
export function viewRoster(members: readonly TeacherRosterMember[], view: RosterView): TeacherRosterMember[] {
  return members
    .filter((m) => matchesFilter(m, view.filter) && matchesSearch(memberName(m), view.query))
    .sort((a, b) => compareBy(view.sort, a, b) || compareName(a, b));
}

/** Whether the view narrows the list (so an empty result means "no match", not "no members"). */
export function isNarrowed(view: RosterView): boolean {
  return view.query.trim() !== '' || view.filter !== 'all';
}
