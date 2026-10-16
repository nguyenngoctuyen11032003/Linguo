import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2 } from 'lucide-react';
import { REPORT_REASON_LABELS_VI, REPORT_REASONS, REPORT_RULES, type ReportReason, type ReportTargetKind } from '@linguo/shared';
import { ChoiceGroup } from '@/components/exercise/ChoiceGroup';
import { Button } from '@/components/ui/Button';
import { useReportContent } from '@/features/content-reports/useReportContent';
import { cn } from '@/lib/cn';
import { playSound } from '@/lib/sound';
import { useModalDialog } from '@/lib/useModalDialog';

const OPTIONS = REPORT_REASONS.map((id) => ({ id, text: REPORT_REASON_LABELS_VI[id], lang: 'vi' as const }));
const NOTE_MAX = REPORT_RULES.note_max;

export const REPORT_THANKS = 'Cảm ơn bạn! Linguo sẽ xem lại nội dung này.';
export const REPORT_DUPLICATE_NOTE = 'Nội dung này cũng vừa được báo lỗi gần đây nên sẽ sớm được xem lại.';

export interface ReportContentDialogProps {
  open: boolean;
  onClose: () => void;
  targetKind: ReportTargetKind;
  /** id of the exercise / learning item / question being reported. */
  targetId: string;
  /** Called once the report is saved (status 'open' or 'duplicate'). */
  onReported?: (status: 'open' | 'duplicate') => void;
  /** Focus returns here on close (defaults to whatever was focused when the dialog opened). */
  triggerRef?: RefObject<HTMLElement | null>;
}

/**
 * "Báo lỗi nội dung" (spec 11 §2): reason + optional note (≤ 500), then a thank-you. Rendered in a portal so a
 * transformed ancestor (the flipping flashcard) cannot clip it. Keys pressed inside never reach the page's global
 * shortcuts (flashcard rating 1–4, postpone P, exercise options 1–6); Escape and Tab still reach the modal handler.
 */
export function ReportContentDialog({ open, onClose, targetKind, targetId, onReported, triggerRef }: ReportContentDialogProps) {
  const report = useReportContent();
  const { reset } = report;
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const legendId = useId();
  const noteId = useId();
  const countId = useId();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');

  useModalDialog(open, onClose, { triggerRef, containerRef: panelRef });

  useEffect(() => {
    if (open) return;
    setReason(null);
    setNote('');
    reset();
  }, [open, reset]);

  const done = report.status === 'success' && report.result !== null;
  useEffect(() => {
    if (done) closeRef.current?.focus();
  }, [done]);

  if (!open) return null;

  const busy = report.status === 'submitting';
  const submit = async () => {
    if (!reason) return;
    const result = await report.submit({ targetKind, targetId, reason, note });
    if (!result) return;
    playSound('success');
    onReported?.(result.status);
  };

  // Global shortcuts listen on window; Escape and Tab must still reach useModalDialog's document listener.
  const isolateKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' && event.key !== 'Tab') event.stopPropagation();
  };

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div aria-hidden="true" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onKeyDown={isolateKeys}
        className={cn(
          'absolute inset-x-0 bottom-0 mx-auto flex max-h-[90dvh] max-w-xl flex-col overflow-hidden rounded-t-[28px] border-t border-border bg-surface-solid text-text focus:outline-none',
          'sm:bottom-6 sm:rounded-[28px] sm:border',
        )}
      >
        <div className="shrink-0 px-safe pt-3">
          <div aria-hidden="true" className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-text/20" />
          <h2 id={titleId} className="text-lg font-bold leading-snug">
            Báo lỗi nội dung
          </h2>
          <p id={descriptionId} className="mt-1 text-[15px] text-muted">
            Báo lỗi chỉ gồm lý do và ghi chú của bạn. Linguo sẽ xem lại và sửa nếu cần.
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-safe pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-4">
          {done ? (
            <div>
              <div role="status" className="flex items-start gap-3 rounded-2xl border border-success/50 bg-success/10 p-4">
                <CheckCircle2 aria-hidden className="mt-0.5 size-6 shrink-0 text-success-text" />
                <p className="text-[16px]">
                  <span className="block font-semibold">{REPORT_THANKS}</span>
                  {report.result?.status === 'duplicate' && <span className="mt-1 block">{REPORT_DUPLICATE_NOTE}</span>}
                </p>
              </div>
              <p className="mt-3 text-sm text-muted">Bạn có thể theo dõi trạng thái trong Cài đặt → Báo lỗi của tôi.</p>
              <div className="mt-4 grid">
                <Button ref={closeRef} variant="primary" size="lg" block onClick={onClose}>
                  Đóng
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p id={legendId} className="text-sm font-semibold">
                Nội dung có vấn đề gì?
              </p>
              <div className="mt-2">
                <ChoiceGroup
                  labelledBy={legendId}
                  options={OPTIONS}
                  selectedId={reason}
                  onSelect={(id) => setReason(id as ReportReason)}
                  disabled={busy}
                />
              </div>
              <label htmlFor={noteId} className="mt-4 block text-sm font-semibold">
                Ghi chú (không bắt buộc)
              </label>
              <textarea
                id={noteId}
                value={note}
                maxLength={NOTE_MAX}
                rows={3}
                disabled={busy}
                aria-describedby={countId}
                onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
                placeholder="Ví dụ: đáp án đúng phải là “I am”."
                className="mt-1.5 block w-full resize-y rounded-2xl border border-border bg-surface-solid px-4 py-3 text-base text-text placeholder:text-muted focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/45"
              />
              <p id={countId} className={cn('mt-1 text-right text-sm text-muted', note.length >= NOTE_MAX && 'text-error-text')}>
                {note.length}/{NOTE_MAX}
              </p>
              {report.status === 'error' && report.error && (
                <p role="alert" className="mt-2 text-sm text-error-text">
                  {report.error}
                </p>
              )}
              <div className="mt-4 grid gap-2">
                <Button variant="accent" size="lg" block disabled={!reason} loading={busy} onClick={() => void submit()}>
                  Gửi báo lỗi
                </Button>
                <Button variant="ghost" size="lg" block onClick={onClose}>
                  Huỷ
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
