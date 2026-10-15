import { useRef, useState } from 'react';
import { ShieldCheck, UserMinus, Users } from 'lucide-react';
import type { TeacherRoster, TeacherRosterMember } from '@linguo/shared';
import { SolidCard } from '@/components/ui/SolidCard';
import { useToast } from '@/components/ui/Toast';
import { CLASS_LANGUAGE_LABELS, formatDay, formatLocalDay, formatShare, memberName } from '@/features/teacher/format';
import type { ClassRosterApi } from '@/features/teacher/useClassRoster';
import { ConfirmDialog } from './ConfirmDialog';

const TH = 'px-3 py-3 font-semibold';
const TD = 'px-3 py-3 align-top tabular-nums';

/** Members with aggregate progress only (teacher_class_roster never returns answers or conversations). */
export function RosterSection({ roster, api }: { roster: TeacherRoster; api: ClassRosterApi }) {
  const toast = useToast();
  const [removing, setRemoving] = useState<TeacherRosterMember | null>(null);
  const removeTrigger = useRef<HTMLElement | null>(null);
  const language = CLASS_LANGUAGE_LABELS[roster.class.language_code];
  const members = roster.members;

  return (
    <section aria-labelledby="roster-title" className="space-y-3">
      <div>
        <h2 id="roster-title" className="text-lg font-bold">
          Học viên ({members.length})
        </h2>
        <p className="mt-1 flex items-start gap-2 text-[15px] text-muted">
          <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
          Chỉ hiện số liệu tổng hợp về việc học {language.toLowerCase()}. Câu trả lời, hội thoại với AI và từ vựng riêng của học viên không bao giờ được chia sẻ.
        </p>
      </div>
      {members.length === 0 ? (
        <SolidCard className="flex items-center gap-3 px-5 py-4 text-[15px] text-muted">
          <Users aria-hidden className="size-5 shrink-0" />
          Chưa có học viên nào. Hãy gửi mã mời để học viên vào lớp.
        </SolidCard>
      ) : (
        <div role="region" aria-labelledby="roster-title" tabIndex={0} className="max-w-full overflow-x-auto rounded-3xl border border-border bg-surface-solid">
          <table className="w-full text-left text-[15px]">
            <caption className="sr-only">
              Tiến độ của {members.length} học viên. Số phút và số bài tính trong 7 ngày gần nhất; tỉ lệ ôn đúng tính trong 30 ngày.
            </caption>
            <thead className="border-b border-border text-sm text-muted">
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
              {members.map((m) => {
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
