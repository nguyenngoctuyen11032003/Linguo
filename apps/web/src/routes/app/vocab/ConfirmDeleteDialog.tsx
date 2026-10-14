import { useState, type RefObject } from 'react';
import { Button } from '@/components/ui/Button';
import { personalVocabErrorMessage } from '@/features/personal-vocab/error-map';
import { VocabDialog } from './VocabDialog';

export interface ConfirmDeleteDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  triggerRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

/** "Xoá …?" confirmation. The cancel button gets focus first; a failed delete keeps the dialog open with the reason. */
export function ConfirmDeleteDialog({ open, title, description, confirmLabel, triggerRef, onClose, onConfirm }: ConfirmDeleteDialogProps) {
  return (
    <VocabDialog open={open} onClose={onClose} triggerRef={triggerRef} title={title} description={description}>
      <ConfirmBody confirmLabel={confirmLabel} onClose={onClose} onConfirm={onConfirm} />
    </VocabDialog>
  );
}

function ConfirmBody({ confirmLabel, onClose, onConfirm }: Pick<ConfirmDeleteDialogProps, 'confirmLabel' | 'onClose' | 'onConfirm'>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(personalVocabErrorMessage(e));
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
          Giữ lại
        </Button>
        <Button variant="danger" size="lg" block loading={busy} onClick={() => void confirm()}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
