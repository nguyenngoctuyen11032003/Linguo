import { useId, useState } from 'react';
import { REPORT_RULES, type AdminContentDetail, type ContentStatus, type StaffRole } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import {
  CONTENT_STATUS_LABELS_VI,
  canChangeStatus,
  canForcePublish,
  nextStatuses,
  transitionLabel,
} from '@/features/admin/content';
import type { SetStatusInput, SetStatusOutcome } from '@/features/admin/useAdminContent';

export interface StatusActionsProps {
  detail: AdminContentDetail;
  role: StaffRole | null;
  saving: boolean;
  onChange: (input: SetStatusInput) => Promise<SetStatusOutcome>;
}

type Message = { tone: 'ok' | 'error'; text: string };

/** Status transition buttons (spec 11 §3): only valid next states, only for reviewer+; admins may force a publish. */
export function StatusActions({ detail, role, saving, onChange }: StatusActionsProps) {
  const ids = useId();
  const [note, setNote] = useState('');
  const [force, setForce] = useState(false);
  const [blocked, setBlocked] = useState<ContentStatus | null>(null);
  const [message, setMessage] = useState<Message | null>(null);

  if (!canChangeStatus(role)) {
    return <p className="text-[15px] text-muted">Bạn đang xem với vai trò biên tập viên. Chỉ người duyệt hoặc quản trị viên mới đổi được trạng thái.</p>;
  }

  const next = nextStatuses(detail.kind, detail.status);
  const submit = async (status: ContentStatus, withForce: boolean) => {
    setMessage(null);
    const outcome = await onChange({ status, note, force: withForce });
    if (outcome.ok) {
      setMessage({ tone: 'ok', text: `Đã chuyển sang "${CONTENT_STATUS_LABELS_VI[outcome.status]}".` });
      setNote('');
      setForce(false);
      setBlocked(null);
      return;
    }
    if (outcome.code === 'open_wrong_answer_reports') setBlocked(status);
    setMessage({ tone: 'error', text: outcome.message });
  };

  return (
    <div className="space-y-3">
      {next.length === 0 ? (
        <p className="text-[15px] text-muted">Không có bước chuyển trạng thái nào từ trạng thái hiện tại.</p>
      ) : (
        <>
          <div>
            <label htmlFor={`${ids}-note`} className="mb-1 block text-sm font-semibold">
              Ghi chú duyệt (không bắt buộc)
            </label>
            <textarea
              id={`${ids}-note`}
              value={note}
              rows={2}
              maxLength={REPORT_RULES.resolution_note_max}
              onChange={(e) => setNote(e.target.value)}
              className="block w-full min-w-0 resize-y rounded-2xl border border-input-border bg-surface-solid px-4 py-2.5 text-[15px] text-text focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/45"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {next.map((status) => (
              <Button
                key={status}
                variant={status === 'published' || status === 'approved' ? 'primary' : 'ghost'}
                disabled={saving}
                onClick={() => void submit(status, false)}
              >
                {transitionLabel(detail.status, status)}
              </Button>
            ))}
          </div>
        </>
      )}

      {message && (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className={message.tone === 'error' ? 'text-[15px] text-error-text' : 'text-[15px] text-success-text'}>
          {message.text}
        </p>
      )}

      {blocked &&
        (canForcePublish(role) ? (
          <div className="space-y-2 rounded-2xl border border-warn/60 bg-warn/10 p-4">
            <label className="flex items-start gap-2 text-[15px]">
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="mt-1 size-4" />
              <span>Tôi đã kiểm tra các báo lỗi "đáp án sai" và vẫn muốn xuất bản (ghi vào nhật ký quản trị).</span>
            </label>
            <Button variant="danger" disabled={!force || saving} onClick={() => void submit(blocked, true)}>
              Vẫn xuất bản
            </Button>
          </div>
        ) : (
          <p className="text-[15px] text-muted">Hãy xử lý các báo lỗi "đáp án sai" trước, hoặc nhờ quản trị viên xuất bản.</p>
        ))}
    </div>
  );
}
