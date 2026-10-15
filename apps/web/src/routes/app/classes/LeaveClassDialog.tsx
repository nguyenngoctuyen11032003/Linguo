import { useState, type RefObject } from 'react';
import { Button } from '@/components/ui/Button';
import { classErrorMessage } from '@/features/classes/error-map';
import { useOnline } from '@/lib/useOnline';
import { VocabDialog } from '../vocab/VocabDialog';

export interface LeaveClassDialogProps {
  className: string | null;
  triggerRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

/** "Rời lớp …?" confirmation. A failed leave keeps the dialog open with the reason. */
export function LeaveClassDialog({ className, triggerRef, onClose, onConfirm }: LeaveClassDialogProps) {
  return (
    <VocabDialog
      open={className !== null}
      onClose={onClose}
      triggerRef={triggerRef}
      title={`Rời lớp ${className ?? ''}?`}
      description="Giáo viên sẽ không còn thấy tiến độ của bạn kể từ lúc này, và bài được giao của lớp sẽ biến mất khỏi danh sách. Muốn quay lại, bạn cần một mã mời mới."
    >
      <LeaveBody onClose={onClose} onConfirm={onConfirm} />
    </VocabDialog>
  );
}

function LeaveBody({ onClose, onConfirm }: Pick<LeaveClassDialogProps, 'onClose' | 'onConfirm'>) {
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(classErrorMessage(e));
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
      {!online && <p className="text-sm text-muted">Bạn đang ngoại tuyến. Cần có mạng để rời lớp.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="ghost" size="lg" block onClick={onClose} disabled={busy}>
          Ở lại lớp
        </Button>
        <Button variant="danger" size="lg" block loading={busy} disabled={!online} onClick={() => void confirm()}>
          Rời lớp
        </Button>
      </div>
    </div>
  );
}
