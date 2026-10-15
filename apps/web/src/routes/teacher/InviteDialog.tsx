import { useState, type FormEvent, type RefObject } from 'react';
import { TEACHER_LIMITS as L, type CreateInviteInput } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input, inputClasses } from '@/components/ui/Input';
import { teacherErrorMessage } from '@/features/teacher/error-map';
import { INVITE_EXPIRY_CHOICES } from '@/features/teacher/format';
import { cn } from '@/lib/cn';
import { VocabDialog as Dialog } from '@/routes/app/vocab/VocabDialog';

export interface InviteDialogProps {
  open: boolean;
  triggerRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  onSubmit: (input: CreateInviteInput) => Promise<void>;
}

/** New invite code: lifetime and an optional cap on uses. */
export function InviteDialog({ open, triggerRef, onClose, onSubmit }: InviteDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} triggerRef={triggerRef} title="Tạo mã mời" description="Học viên nhập mã này trong Linguo để vào lớp.">
      <InviteForm onClose={onClose} onSubmit={onSubmit} />
    </Dialog>
  );
}

function InviteForm({ onClose, onSubmit }: Pick<InviteDialogProps, 'onClose' | 'onSubmit'>) {
  const [hours, setHours] = useState<number>(L.inviteDefaultHours);
  const [maxUses, setMaxUses] = useState('');
  const [usesError, setUsesError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = maxUses.trim();
    let cap: number | null = null;
    if (trimmed) {
      const n = Number(trimmed);
      if (!Number.isInteger(n) || n < 1 || n > L.inviteMaxUses) {
        setUsesError(teacherErrorMessage({ message: 'invalid_max_uses' }));
        return;
      }
      cap = n;
    }
    setUsesError(null);
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ expires_hours: hours, max_uses: cap });
      onClose();
    } catch (e) {
      setError(teacherErrorMessage(e));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
      {error && (
        <p role="alert" className="rounded-2xl border border-error/50 bg-error/10 px-4 py-3 text-[15px] text-error-text">
          {error}
        </p>
      )}
      <FormField label="Hiệu lực trong">
        {({ invalid, ...a11y }) => (
          <select
            {...a11y}
            aria-invalid={invalid || undefined}
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className={cn(inputClasses(invalid), 'appearance-none')}
          >
            {INVITE_EXPIRY_CHOICES.map((c) => (
              <option key={c.hours} value={c.hours}>
                {c.label}
              </option>
            ))}
          </select>
        )}
      </FormField>
      <FormField label="Giới hạn số học viên dùng mã (tuỳ chọn)" hint={`Để trống nếu không giới hạn. Tối đa ${L.inviteMaxUses}.`} error={usesError ?? undefined}>
        {(a11y) => (
          <Input {...a11y} value={maxUses} inputMode="numeric" autoComplete="off" placeholder="Ví dụ: 30" onChange={(e) => setMaxUses(e.target.value)} />
        )}
      </FormField>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="ghost" size="lg" block onClick={onClose} disabled={busy}>
          Huỷ
        </Button>
        <Button type="submit" size="lg" block loading={busy}>
          Tạo mã
        </Button>
      </div>
    </form>
  );
}
