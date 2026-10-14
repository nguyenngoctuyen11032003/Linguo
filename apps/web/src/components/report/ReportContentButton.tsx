import { useRef, useState } from 'react';
import { Flag } from 'lucide-react';
import type { ReportTargetKind } from '@linguo/shared';
import { Button, type ButtonVariant } from '@/components/ui/Button';
import { ReportContentDialog } from './ReportContentDialog';

export interface ReportContentButtonProps {
  targetKind: ReportTargetKind;
  targetId: string;
  /** Visible label (also the accessible name). */
  label?: string;
  variant?: ButtonVariant;
  className?: string;
  onReported?: (status: 'open' | 'duplicate') => void;
}

/**
 * Low-emphasis "Báo lỗi nội dung" button that opens the report dialog. It never takes focus by itself; focus returns
 * to it when the dialog closes.
 */
export function ReportContentButton({
  targetKind,
  targetId,
  label = 'Báo lỗi nội dung',
  variant = 'ghost',
  className,
  onReported,
}: ReportContentButtonProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <Button
        ref={triggerRef}
        variant={variant}
        aria-haspopup="dialog"
        className={className}
        onClick={() => setOpen(true)}
      >
        <Flag aria-hidden className="size-4" />
        {label}
      </Button>
      <ReportContentDialog
        open={open}
        onClose={() => setOpen(false)}
        targetKind={targetKind}
        targetId={targetId}
        triggerRef={triggerRef}
        onReported={onReported}
      />
    </>
  );
}
