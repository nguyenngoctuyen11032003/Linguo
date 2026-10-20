import { useId, useMemo, useRef, useState } from 'react';
import { Download, Search, ShieldCheck, UserMinus, Users } from 'lucide-react';
import type { TeacherRoster, TeacherRosterMember } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { inputClasses } from '@/components/ui/Input';
import { SolidCard } from '@/components/ui/SolidCard';
import { useToast } from '@/components/ui/Toast';
import { buildRosterCsv, exportFileName } from '@/features/teacher/export';
import { CLASS_LANGUAGE_LABELS, formatDay, formatLocalDay, formatShare, memberName } from '@/features/teacher/format';
import {
  DEFAULT_ROSTER_VIEW,
  ROSTER_FILTERS,
  ROSTER_PAGE_SIZE,
  ROSTER_SORTS,
  isNarrowed,
  viewRoster,
  type RosterFilter,
  type RosterSort,
  type RosterView,
} from '@/features/teacher/roster-view';
import type { ClassRosterApi } from '@/features/teacher/useClassRoster';
import { cn } from '@/lib/cn';
import { downloadTextFile } from '@/lib/download';
import { ConfirmDialog } from './ConfirmDialog';

const TH = 'px-3 py-3 font-semibold';
const TD = 'px-3 py-3 align-top tabular-nums';
const SELECT = cn(inputClasses(false), 'min-h-11 appearance-none py-2 pr-8 text-[15px]');

/** Members with aggregate progress only (teacher_class_roster never returns answers or conversations). */
export function RosterSection({ roster, api }: { roster: TeacherRoster; api: ClassRosterApi }) {
  const toast = useToast();
  const [removing, setRemoving] = useState<TeacherRosterMember | null>(null);
  const [view, setView] = useState<RosterView>(DEFAULT_ROSTER_VIEW);
  const [limit, setLimit] = useState(ROSTER_PAGE_SIZE);
  const removeTrigger = useRef<HTMLElement | null>(null);
  const ids = useId();
  const language = CLASS_LANGUAGE_LABELS[roster.class.language_code];
  const members = roster.members;
  const matches = useMemo(() => viewRoster(members, view), [members, view]);
  const visible = matches.slice(0, limit);
  const narrowed = isNarrowed(view);

  const change = (patch: Partial<RosterView>) => {
    setView((prev) => ({ ...prev, ...patch }));
    setLimit(ROSTER_PAGE_SIZE);
  };

  return (
    <section aria-labelledby="roster-title" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="roster-title" className="text-xl font-extrabold tracking-[-0.02em]">
            Học viên ({members.length})
          </h2>
          <p className="mt-1 flex items-start gap-2 text-[15px] text-muted">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
            Chỉ hiện số liệu tổng hợp về việc học {language.toLowerCase()}. Câu trả lời, hội thoại với AI và từ vựng riêng của học viên không bao giờ được chia sẻ.
          </p>
        </div>
        {members.length > 0 && (
          <Button
            variant="ghost"
            onClick={() => {
              downloadTextFile(buildRosterCsv(members), exportFileName(roster.class.name, 'hoc-vien'), 'text/csv;charset=utf-8');
              toast.show({ tone: 'success', message: 'Đã tải bảng tổng hợp học viên ra file CSV.' });
            }}
          >
            <Download aria-hidden className="size-4" />
            Xuất CSV
          </Button>
        )}
      </div>

      {members.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_13rem_14rem]">
          <div className="min-w-0">
            <label htmlFor={`${ids}-q`} className="mb-1 block px-1 text-sm font-medium">
              Tìm học viên
            </label>
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input
                id={`${ids}-q`}
                type="search"
                value={view.query}
                autoComplete="off"
                spellCheck={false}
                maxLength={80}
                placeholder="Tên học viên"
                onChange={(e) => change({ query: e.target.value })}
                className={cn(inputClasses(false), 'min-h-11 pl-10')}
              />
            </div>
          </div>
          <div>
            <label htmlFor={`${ids}-f`} className="mb-1 block px-1 text-sm font-medium">
              Lọc
            </label>
            <select id={`${ids}-f`} value={view.filter} onChange={(e) => change({ filter: e.target.value as RosterFilter })} className={SELECT}>
              {ROSTER_FILTERS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${ids}-s`} className="mb-1 block px-1 text-sm font-medium">
              Sắp xếp
            </label>
            <select id={`${ids}-s`} value={view.sort} onChange={(e) => change({ sort: e.target.value as RosterSort })} className={SELECT}>
              {ROSTER_SORTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      {narrowed && members.length > 0 && (
        <p role="status" className="px-1 text-[15px] text-muted">
          {matches.length === 0 ? 'Không có học viên nào khớp.' : `${matches.length} trên ${members.length} học viên khớp.`}{' '}
          <button type="button" onClick={() => change({ query: '', filter: 'all' })} className="min-h-11 font-semibold underline">
            Xoá bộ lọc
          </button>
        </p>
      )}

      {members.length === 0 ? (
        <SolidCard className="flex items-center gap-3 px-5 py-4 text-[15px] text-muted">
          <Users aria-hidden className="size-5 shrink-0" />
          Chưa có học viên nào. Hãy gửi mã mời để học viên vào lớp.
        </SolidCard>
      ) : (
        matches.length > 0 && (
          <div role="region" aria-labelledby="roster-title" tabIndex={0} className="max-w-full overflow-x-auto card">
            <table className="w-full text-left text-[15px]">
              <caption className="sr-only">
                Tiến độ của {matches.length === members.length ? `${members.length} học viên` : `${matches.length} trên ${members.length} học viên`}. Số phút và số bài tính trong 7 ngày gần nhất; tỉ lệ ôn đúng
                tính trong 30 ngày.
              </caption>
              <thead className="border-b border-border bg-text/[0.03] text-xs uppercase tracking-[0.06em] text-muted">
                <tr>
                  <th scope="col" className={TH}>
                    Học viên
                  </th>
                  <th scope="col" className={TH}>
                    Bài giao
                  </th>
                  <th scope="col" className={`${TH} hidden sm:table-cell`}>
                    Chuỗi ngày
                  </th>
                  <th scope="col" className={`${TH} hidden sm:table-cell`}>
                    Phút học (7 ngày)
                  </th>
                  <th scope="col" className={`${TH} hidden md:table-cell`}>
                    Bài học xong (7 ngày)
                  </th>
                  <th scope="col" className={`${TH} hidden md:table-cell`}>
                    Ôn đúng (30 ngày)
                  </th>
                  <th scope="col" className={`${TH} hidden lg:table-cell`}>
                    Học gần nhất
                  </th>
                  <th scope="col" className={TH}>
                    <span className="sr-only">Thao tác</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((m) => {
                  const name = memberName(m);
                  return (
                    <tr key={m.user_id} className="border-b border-border last:border-b-0">
                      <th scope="row" className="px-3 py-3 text-left align-top font-normal">
                        <span className="block break-words font-semibold">{name}</span>
                        <span className="block text-sm text-muted">Vào lớp {formatDay(m.joined_at)}</span>
                        {!m.has_path && <span className="block text-sm text-muted">Chưa có lộ trình {language.toLowerCase()}</span>}
                        {/* Phones hide the stat columns: keep the key numbers readable under the name. */}
                        <span className="block text-sm text-muted sm:hidden">
                          {m.has_path ? `Chuỗi ${m.streak_current} ngày · ${m.minutes_7d} phút/7 ngày` : null}
                        </span>
                      </th>
                      <td className={TD}>
                        {m.assignments_done}/{m.assignments_total}
                      </td>
                      <td className={`${TD} hidden sm:table-cell`}>{m.has_path ? `${m.streak_current} ngày` : '—'}</td>
                      <td className={`${TD} hidden sm:table-cell`}>{m.has_path ? m.minutes_7d : '—'}</td>
                      <td className={`${TD} hidden md:table-cell`}>{m.has_path ? m.lessons_completed_7d : '—'}</td>
                      <td className={`${TD} hidden md:table-cell`}>{formatShare(m.review_accuracy_30d)}</td>
                      <td className={`${TD} hidden lg:table-cell`}>{m.last_active_day ? formatLocalDay(m.last_active_day) : 'Chưa học'}</td>
                      <td className="px-1 py-1.5 text-right align-top">
                        <button
                          type="button"
                          aria-label={`Xoá ${name} khỏi lớp`}
                          onClick={(e) => {
                            removeTrigger.current = e.currentTarget;
                            setRemoving(m);
                          }}
                          className="inline-flex size-11 items-center justify-center rounded-full text-muted hover:bg-error/10 hover:text-error"
                        >
                          <UserMinus aria-hidden className="size-5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}
      {matches.length > visible.length && (
        <Button variant="ghost" block onClick={() => setLimit((n) => n + ROSTER_PAGE_SIZE)}>
          Hiện thêm {Math.min(ROSTER_PAGE_SIZE, matches.length - visible.length)} học viên
        </Button>
      )}
      <ConfirmDialog
        open={removing !== null}
        title="Xoá học viên khỏi lớp?"
        description={`${removing ? memberName(removing) : ''} sẽ rời lớp và bạn không còn thấy tiến độ của họ. Họ có thể vào lại bằng một mã mời còn hiệu lực.`}
        confirmLabel="Xoá khỏi lớp"
        triggerRef={removeTrigger}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          await api.removeMember(removing.user_id);
          toast.show({ tone: 'success', message: 'Đã xoá học viên khỏi lớp.' });
        }}
      />
    </section>
  );
}
