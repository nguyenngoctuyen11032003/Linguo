import { useId, useRef, type RefObject } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { Link } from 'react-router';
import type { ExamHistoryEntry } from '@linguo/shared';
import { Button, buttonClasses } from '@/components/ui/Button';
import { functionalTransition } from '@/design/motion';
import { useModalDialog } from '@/lib/useModalDialog';
import { useMotionPrefs } from '@/providers/MotionProvider';
import { MODE_LABELS, SECTION_LABELS, examRunnerHref, formatDate } from './components';

export interface OpenAttemptDialogProps {
  /** The learner's in-progress attempt on this path; the dialog is open while it is set. */
  attempt: ExamHistoryEntry | null;
  onCancel(): void;
  /** Start the new attempt anyway: start_exam closes the open one as expired. */
  onStartNew(): void;
  busy?: boolean;
  /** Focus returns here on cancel (Safari does not focus a clicked button, so it cannot be read on open). */
  triggerRef?: RefObject<HTMLElement | null>;
}

/** "Bạn đang làm dở một bài": asked before a start would expire the open attempt; "Làm tiếp" gets focus first. */
export function OpenAttemptDialog({ attempt, onCancel, onStartNew, busy = false, triggerRef }: OpenAttemptDialogProps) {
  const { reduceMotion } = useMotionPrefs();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const open = attempt !== null;
  useModalDialog(open, onCancel, { containerRef: panelRef, triggerRef });
  const offscreen = reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 };
  const mode = attempt ? (attempt.section ? `${MODE_LABELS[attempt.mode]} · ${SECTION_LABELS[attempt.section]}` : MODE_LABELS[attempt.mode]) : '';

  return (
    <AnimatePresence>
      {attempt && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={functionalTransition}
            onClick={onCancel}
          />
          <motion.div
            ref={panelRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            tabIndex={-1}
            initial={offscreen}
            animate={{ opacity: 1, y: 0 }}
            exit={offscreen}
            transition={functionalTransition}
            className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[28px] border-t border-border bg-surface-solid px-5 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-5 focus:outline-none sm:rounded-[28px] sm:border"
          >
            <h2 id={titleId} className="text-lg font-bold">
              Bạn đang làm dở một bài
            </h2>
            <div id={descriptionId} className="mt-2 space-y-2 text-[15px]">
              <p className="break-words">
                <span className="font-semibold">{attempt.form_title_vi}</span> · {mode} · bắt đầu {formatDate(attempt.started_at)}
              </p>
              <p className="text-muted">Bắt đầu bài mới sẽ kết thúc bài này: các câu đã làm được chấm và bài được ghi là Hết giờ.</p>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <Link to={examRunnerHref(attempt.attempt_id)} className={buttonClasses('primary', 'lg', true)}>
                Làm tiếp bài đang dở
              </Link>
              <Button variant="ghost" size="lg" block disabled={busy} onClick={onStartNew}>
                Bắt đầu bài mới
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
