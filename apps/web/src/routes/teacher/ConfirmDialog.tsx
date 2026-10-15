import { useState, type RefObject } from 'react';
import { Button } from '@/components/ui/Button';
import { teacherErrorMessage } from '@/features/teacher/error-map';
import { VocabDialog as Dialog } from '@/routes/app/vocab/VocabDialog';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** 'danger' for destructive actions (delete, remove, revoke). */
  tone?: 'danger' | 'primary';
  triggerRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

/** Confirmation for teacher actions. A failure keeps the dialog open with the reason. */
export function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel = 'Huỷ', tone = 'danger', triggerRef, onClose, onConfirm }: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} triggerRef={triggerRef} title={title} description={description}>
      <ConfirmBody confirmLabel={confirmLabel} cancelLabel={cancelLabel} tone={tone} onClose={onClose} onConfirm={onConfirm} />
    </Dialog>
  );
}

function ConfirmBody({
  confirmLabel,
  cancelLabel,
  tone,
  onClose,
  onConfirm,
}: Pick<ConfirmDialogProps, 'confirmLabel' | 'onClose' | 'onConfirm'> & { cancelLabel: string; tone: 'danger' | 'primary' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(teacherErrorMessage(e));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-2xl border border-error/50 bg-error/10 px-4 py-3 text-[15px] text-error-text">
          {error}
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="ghost" size="lg" block onClick={onClose} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button variant={tone} size="lg" block loading={busy} onClick={() => void confirm()}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
