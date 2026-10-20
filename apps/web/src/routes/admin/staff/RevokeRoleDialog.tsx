import { useId, useRef } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { Button } from '@/components/ui/Button';
import { functionalTransition } from '@/design/motion';
import { useModalDialog } from '@/lib/useModalDialog';
import { useMotionPrefs } from '@/providers/MotionProvider';

export interface RevokeRoleDialogProps {
  /** Name of the staff member; null closes the dialog. */
  name: string | null;
  roleLabel: string;
  /** Dialog title; defaults to the staff role wording. */
  title?: string;
  /** What the person loses, after their name; defaults to the staff role wording. */
  consequence?: string;
  /** Label of the confirm button; defaults to "Thu hồi". */
  confirmLabel?: string;
  /** 'danger' (default) for revoking and demoting; 'primary' for granting. */
  tone?: 'danger' | 'primary';
  /** Last line of the dialog; defaults to the revoke wording. */
  note?: string;
  busy: boolean;
  onConfirm(): void;
  /** Also called on Escape and on a backdrop click. */
  onCancel(): void;
}

/** "Thu hồi vai trò?" confirmation: focus-trapped, Escape cancels, "Huỷ" gets focus first so Enter is safe. */
export function RevokeRoleDialog({
  name,
  roleLabel,
  title = 'Thu hồi vai trò?',
  consequence,
  confirmLabel = 'Thu hồi',
  tone = 'danger',
  note = 'Thay đổi được ghi vào nhật ký quản trị. Bạn có thể cấp lại sau.',
  busy,
  onConfirm,
  onCancel,
}: RevokeRoleDialogProps) {
  const { reduceMotion } = useMotionPrefs();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const open = name !== null;
  useModalDialog(open, onCancel, { containerRef: panelRef });

  const offscreen = reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 };

  return (
    <AnimatePresence>
      {open && (
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
            className="relative w-full max-w-md rounded-t-[28px] border-t border-border bg-surface-solid px-5 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-5 focus:outline-none sm:rounded-[28px] sm:border"
          >
            <h2 id={titleId} className="text-lg font-bold">
              {title}
            </h2>
            <div id={descriptionId} className="mt-2 space-y-2 text-[15px]">
              <p>
                <strong className="break-words">{name}</strong>{' '}
                {consequence ?? `sẽ mất vai trò ${roleLabel} và không vào được khu quản trị nữa.`}
              </p>
              <p className="text-muted">{note}</p>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <Button variant="ghost" size="lg" block onClick={onCancel} disabled={busy}>
                Huỷ
              </Button>
              <Button variant={tone} size="lg" block loading={busy} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
