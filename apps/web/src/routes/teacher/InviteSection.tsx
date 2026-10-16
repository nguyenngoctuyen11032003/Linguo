import { useRef, useState } from 'react';
import { Copy, Plus, Ticket, XCircle } from 'lucide-react';
import { TEACHER_LIMITS as L, formatInviteCode, type TeacherClass, type TeacherInvite } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { SolidCard } from '@/components/ui/SolidCard';
import { useToast } from '@/components/ui/Toast';
import { expiryLabel, formatDayTime } from '@/features/teacher/format';
import type { ClassRosterApi } from '@/features/teacher/useClassRoster';
import { ConfirmDialog } from './ConfirmDialog';
import { InviteDialog } from './InviteDialog';

async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Active invite codes of a class: create, copy, revoke (expire now). */
export function InviteSection({ cls, archived, api }: { cls: TeacherClass; archived: boolean; api: ClassRosterApi }) {
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<TeacherInvite | null>(null);
  const createRef = useRef<HTMLButtonElement>(null);
  const revokeTrigger = useRef<HTMLElement | null>(null);
  const atLimit = cls.invites.length >= L.maxActiveInvitesPerClass;

  async function copy(invite: TeacherInvite) {
    const code = formatInviteCode(invite.code);
    if (await copyText(code)) toast.show({ tone: 'success', message: `Đã chép mã ${code}.` });
    else toast.show({ tone: 'info', message: `Không chép tự động được. Mã lớp là ${code}.` });
  }

  return (
    <section aria-labelledby="invites-title" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="invites-title" className="text-xl font-extrabold tracking-[-0.02em]">
            Mã mời
          </h2>
          <p className="text-[15px] text-muted">Gửi mã cho học viên: họ đăng nhập Linguo và nhập mã để vào lớp.</p>
        </div>
        <Button
          ref={createRef}
          variant="ghost"
          disabled={archived || atLimit}
          hint={archived ? 'Khôi phục lớp để tạo mã mời.' : atLimit ? `Tối đa ${L.maxActiveInvitesPerClass} mã còn hiệu lực.` : undefined}
          onClick={() => setCreating(true)}
        >
          <Plus aria-hidden className="size-5" />
          Tạo mã mời
        </Button>
      </div>
      {cls.invites.length === 0 ? (
        <SolidCard className="flex items-center gap-3 px-5 py-4 text-[15px] text-muted">
          <Ticket aria-hidden className="size-5 shrink-0" />
          Chưa có mã mời nào còn hiệu lực.
        </SolidCard>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {cls.invites.map((invite) => {
            const code = formatInviteCode(invite.code);
            return (
              <li key={invite.code} className="min-w-0">
                <SolidCard className="space-y-3 p-5">
                  <div>
                    <p className="font-mono text-[28px] font-bold tracking-[0.12em]">
                      {code}
                    </p>
                    <p className="mt-2 text-[13px] text-muted">
                      Hết hạn {formatDayTime(invite.expires_at)} ({expiryLabel(invite.expires_at)}) ·{' '}
                      {invite.max_uses === null ? `${invite.uses} lượt dùng` : `đã dùng ${invite.uses}/${invite.max_uses}`}
                      {archived ? ' · tạm ngừng vì lớp đã lưu trữ' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="primary" block aria-label={`Chép mã ${code}`} onClick={() => void copy(invite)} className="sm:w-auto">
                      <Copy aria-hidden className="size-4" />
                      Chép mã
                    </Button>
                    <button
                      type="button"
                      aria-label={`Thu hồi mã ${code}`}
                      title="Thu hồi"
                      onClick={(e) => {
                        revokeTrigger.current = e.currentTarget;
                        setRevoking(invite);
                      }}
                      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-error/40 text-error-text transition-[background-color,scale] duration-150 hover:bg-error/10 active:scale-95"
                    >
                      <XCircle aria-hidden className="size-5" />
                    </button>
                  </div>
                </SolidCard>
              </li>
            );
          })}
        </ul>
      )}
      <InviteDialog
        open={creating}
        triggerRef={createRef}
        onClose={() => setCreating(false)}
        onSubmit={async (input) => {
          const invite = await api.createInvite(input);
          toast.show({ tone: 'success', message: `Đã tạo mã ${formatInviteCode(invite.code)}.` });
        }}
      />
      <ConfirmDialog
        open={revoking !== null}
        title="Thu hồi mã mời này?"
        description={`Mã ${revoking ? formatInviteCode(revoking.code) : ''} hết hiệu lực ngay. Học viên đã vào lớp vẫn ở lại lớp.`}
        confirmLabel="Thu hồi mã"
        triggerRef={revokeTrigger}
        onClose={() => setRevoking(null)}
        onConfirm={async () => {
          if (!revoking) return;
          await api.revokeInvite(revoking.code);
          toast.show({ tone: 'success', message: 'Đã thu hồi mã mời.' });
        }}
      />
    </section>
  );
}
