import { useState, type FormEvent } from 'react';
import { changePasswordSchema, fieldErrors } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthProvider';
import { changePassword, hasPasswordSignIn } from '@/features/auth/password-change';
import { useFocusFirstInvalid } from '@/features/auth/useFocusFirstInvalid';
import { requireSupabase } from '@/lib/supabase';
import { FormAlert } from '@/routes/auth/AuthCard';
import { CollapsibleSection } from './CollapsibleSection';

/** Settings "Mật khẩu": an email/password account changes its password after confirming the current one. */
export function PasswordSection() {
  const { user } = useAuth();
  const canChange = hasPasswordSignIn(user) && Boolean(user?.email);
  return (
    <CollapsibleSection id="mat-khau" headingId="password-heading" title="Mật khẩu" contentClassName="space-y-4">
      {canChange && user?.email ? (
        <ChangePasswordForm email={user.email} />
      ) : (
        <p className="text-[15px] text-muted">Tài khoản này đăng nhập bằng Google nên không có mật khẩu Linguo để đổi.</p>
      )}
    </CollapsibleSection>
  );
}

function ChangePasswordForm({ email }: { email: string }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { formRef, focusFirstInvalid } = useFocusFirstInvalid();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setFormError(null);
    const parsed = changePasswordSchema.safeParse({ current, password, confirm });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      focusFirstInvalid();
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const result = await changePassword(requireSupabase(), email, parsed.data.current, parsed.data.password);
      if (result.ok) {
        setCurrent('');
        setPassword('');
        setConfirm('');
        toast.show({ tone: 'success', message: 'Đã đổi mật khẩu.' });
      } else if (result.field) {
        setErrors({ [result.field]: result.message });
        focusFirstInvalid();
      } else {
        setFormError(result.message);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form ref={formRef} noValidate onSubmit={(e) => void onSubmit(e)} className="space-y-4">
      {formError && <FormAlert>{formError}</FormAlert>}
      <FormField label="Mật khẩu hiện tại" error={errors.current}>
        {({ invalid, ...a11y }) => (
          <PasswordInput {...a11y} invalid={invalid} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        )}
      </FormField>
      <FormField label="Mật khẩu mới" hint={errors.password ? undefined : 'Ít nhất 8 ký tự.'} error={errors.password}>
        {({ invalid, ...a11y }) => (
          <PasswordInput {...a11y} invalid={invalid} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        )}
      </FormField>
      <FormField label="Nhập lại mật khẩu mới" error={errors.confirm}>
        {({ invalid, ...a11y }) => (
          <PasswordInput {...a11y} invalid={invalid} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        )}
      </FormField>
      <Button type="submit" variant="primary" loading={saving}>
        Đổi mật khẩu
      </Button>
    </form>
  );
}
