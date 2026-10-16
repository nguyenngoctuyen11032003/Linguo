import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { ChoiceGroup } from '@/components/exercise/ChoiceGroup';
import { Button } from '@/components/ui/Button';
import { functionalTransition } from '@/design/motion';
import { useModalDialog } from '@/lib/useModalDialog';
import { useMotionPrefs } from '@/providers/MotionProvider';
import { SKIP_REASON_LABELS, type SkipReason } from './labels';

const REASONS = Object.entries(SKIP_REASON_LABELS).map(([id, text]) => ({
  id,
  text,
  lang: 'vi' as const,
}));

interface Props {
  open: boolean;
  skillLabel: string;
  /** No other skill is left to test: skipping this one ends the test. */
  last?: boolean;
  busy: boolean;
  onClose: () => void;
  onSkip: (reason: SkipReason) => void;
  triggerRef?: RefObject<HTMLElement | null>;
}

/** Bottom sheet: pick why the skill is skipped; the report then shows it as "chưa đủ dữ liệu". */
export function SkipSkillSheet({ open, skillLabel, last = false, busy, onClose, onSkip, triggerRef }: Props) {
  const { reduceMotion } = useMotionPrefs();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const legendId = useId();
  const [reason, setReason] = useState<SkipReason | null>(null);
  useModalDialog(open, onClose, { triggerRef, containerRef: panelRef });

  useEffect(() => {
    if (!open) setReason(null);
  }, [open]);

  const offscreen = reduceMotion ? { opacity: 0 } : { y: '100%' };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={functionalTransition}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            tabIndex={-1}
            initial={offscreen}
            animate={{ y: 0, opacity: 1 }}
            exit={offscreen}
            transition={{ ...functionalTransition, duration: 0.28 }}
            className="absolute inset-x-0 bottom-0 mx-auto max-h-[90dvh] max-w-xl overflow-y-auto rounded-t-[28px] border-t border-border bg-surface-solid px-safe pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-3 sm:bottom-6 sm:rounded-[28px] sm:border"
          >
            <div aria-hidden="true" className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-text/20" />
            <h2 id={titleId} className="text-lg font-bold">
              Bỏ qua phần {skillLabel.toLowerCase()}?
            </h2>
            <p id={descriptionId} className="mt-1 text-[15px] text-muted">
              Kết quả sẽ ghi “chưa đủ dữ liệu” cho kỹ năng này.{' '}
              {last ? 'Đây là phần cuối nên bài kiểm tra sẽ kết thúc và bạn xem kết quả ngay.' : 'Bạn vẫn làm tiếp các phần còn lại.'}
            </p>
            <p id={legendId} className="mt-4 text-sm font-semibold">
              Vì sao bạn muốn bỏ qua?
            </p>
            <div className="mt-2">
              <ChoiceGroup
                labelledBy={legendId}
                options={REASONS}
                selectedId={reason}
                onSelect={(id) => setReason(id as SkipReason)}
                disabled={busy}
              />
            </div>
            <div className="mt-5 grid gap-2">
              <Button variant="accent" size="lg" block disabled={!reason} loading={busy} onClick={() => reason && onSkip(reason)}>
                Bỏ qua kỹ năng này
              </Button>
              <Button variant="ghost" size="lg" block onClick={onClose}>
                Tiếp tục làm bài
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
