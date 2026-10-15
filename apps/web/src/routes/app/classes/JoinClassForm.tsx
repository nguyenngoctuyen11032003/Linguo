import { useState, type FormEvent, type ReactNode } from 'react';
import { formatInviteCode, isInviteCodeShape, normalizeInviteCode, type LearnerClass, type LearnerJoinResult } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { CODE_SHAPE_MESSAGE, INVALID_CODE_MESSAGE, classErrorMessage } from '@/features/classes/error-map';
import { useOnline } from '@/lib/useOnline';

export interface JoinClassFormProps {
  initialCode?: string;
  join: (code: string) => Promise<LearnerJoinResult>;
  onJoined: (klass: LearnerClass, alreadyMember: boolean) => void;
  submitLabel?: string;
  /** Extra actions beside the submit button (e.g. "Quay lại"). */
  secondary?: ReactNode;
}

/**
 * Invite code input. The shape is checked before calling the server (every call counts against the hourly limit);
 * an unknown or expired code and server refusals stay under the field so the learner can fix and resend.
 */
export function JoinClassForm({ initialCode = '', join, onJoined, submitLabel = 'Tham gia lớp', secondary }: JoinClassFormProps) {
  const online = useOnline();
  const [code, setCode] = useState(() => formatInviteCode(initialCode));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!isInviteCodeShape(code)) {
      setError(normalizeInviteCode(code) === '' ? 'Hãy nhập mã lớp mà giáo viên gửi cho bạn.' : CODE_SHAPE_MESSAGE);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await join(code);
      if (result.status === 'invalid_code') {
        setError(INVALID_CODE_MESSAGE);
      } else {
        setCode('');
        onJoined(result.class, result.status === 'already_member');
      }
    } catch (e) {
      setError(classErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="space-y-3">
      <FormField label="Mã lớp" hint="Gồm 8 ký tự, ví dụ ABCD-EFGH. Có hay không có dấu gạch đều được." error={error ?? undefined}>
        {(a11y) => (
          <Input
            {...a11y}
            value={code}
            maxLength={16}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="font-mono uppercase tracking-[0.12em]"
            onChange={(e) => setCode(e.target.value)}
          />
        )}
      </FormField>
      {!online && <p className="px-1 text-sm text-muted">Bạn đang ngoại tuyến. Cần có mạng để tham gia lớp.</p>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" size="lg" loading={busy} disabled={!online}>
          {submitLabel}
        </Button>
        {secondary}
      </div>
    </form>
  );
}
