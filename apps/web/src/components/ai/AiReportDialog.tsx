import { useEffect, useId, useState, type RefObject } from 'react';
import { AI_REPORT_REASONS } from '@linguo/shared';
import { ChoiceGroup } from '@/components/exercise/ChoiceGroup';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { AI_REPORT_NOTE_MAX, reportAiResponse } from '@/features/ai-tutor/report';
import { cn } from '@/lib/cn';
import { requireSupabase } from '@/lib/supabase';
import { AiModal } from './AiModal';
import { AI_REPORT_REASON_LABELS, type AiReportReasonId as Reason } from './labels';

const OPTIONS = AI_REPORT_REASONS.map((id) => ({ id, text: AI_REPORT_REASON_LABELS[id], lang: 'vi' as const }));

export interface AiReportDialogProps {
  open: boolean;
  onClose: () => void;
  /** `response_id` of the AI answer being reported. */
  usageId: string | null;
  onReported?: () => void;
  /** Opened over another AI modal (the explain panel). */
  stacked?: boolean;
  triggerRef?: RefObject<HTMLElement | null>;
}

/** Report a wrong/unclear/unsafe AI answer: reason + optional note (≤ 500 characters). */
export function AiReportDialog({ open, onClose, usageId, onReported, stacked = false, triggerRef }: AiReportDialogProps) {
  const toast = useToast();
  const legendId = useId();
  const noteId = useId();
  const countId = useId();
  const [reason, setReason] = useState<Reason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) {
      setReason(null);
      setNote('');
      setBusy(false);
      setFailed(false);
    }
  }, [open]);

  const submit = async () => {
    if (!reason || !usageId) return;
    setBusy(true);
    setFailed(false);
    try {
      await reportAiResponse(requireSupabase(), { usageId, reason, note: note.trim() || null });
      toast.show({ tone: 'success', message: 'Cảm ơn bạn! Linguo đã nhận báo lỗi.' });
      onReported?.();
      onClose();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <AiModal
      open={open}
      onClose={onClose}
      stacked={stacked}
      triggerRef={triggerRef}
      title="Báo lỗi giải thích AI"
      description="Báo cáo chỉ gồm lý do và ghi chú của bạn, không kèm nội dung trò chuyện."
    >
      <p id={legendId} className="text-sm font-semibold">
        Vấn đề là gì?
      </p>
      <div className="mt-2">
        <ChoiceGroup labelledBy={legendId} options={OPTIONS} selectedId={reason} onSelect={(id) => setReason(id as Reason)} disabled={busy} />
      </div>
      <label htmlFor={noteId} className="mt-4 block text-sm font-semibold">
        Ghi chú (không bắt buộc)
      </label>
      <textarea
        id={noteId}
        value={note}
        maxLength={AI_REPORT_NOTE_MAX}
        rows={3}
        disabled={busy}
        aria-describedby={countId}
        onChange={(e) => setNote(e.target.value.slice(0, AI_REPORT_NOTE_MAX))}
        placeholder="Ví dụ: ví dụ thứ hai dùng sai thì."
        className="mt-1.5 block w-full resize-y rounded-2xl border border-border bg-surface-solid px-4 py-3 text-base text-text placeholder:text-muted focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/45"
      />
      <p id={countId} className={cn('mt-1 text-right text-sm text-muted', note.length >= AI_REPORT_NOTE_MAX && 'text-error-text')}>
        {note.length}/{AI_REPORT_NOTE_MAX}
      </p>
      {failed && (
        <p role="alert" className="mt-2 text-sm text-error-text">
          Chưa gửi được báo lỗi. Vui lòng thử lại.
        </p>
      )}
      <div className="mt-4 grid gap-2">
        <Button variant="accent" size="lg" block disabled={!reason || !usageId} loading={busy} onClick={() => void submit()}>
          Gửi báo lỗi
        </Button>
        <Button variant="ghost" size="lg" block onClick={onClose}>
          Huỷ
        </Button>
      </div>
    </AiModal>
  );
}
