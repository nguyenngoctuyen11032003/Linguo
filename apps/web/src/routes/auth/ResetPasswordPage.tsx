import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { fieldErrors, resetPasswordSchema } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { useToast } from '@/components/ui/Toast';
import { authErrorMessage } from '@/features/auth/error-map';
import { useFocusFirstInvalid } from '@/features/auth/useFocusFirstInvalid';
import { clearRecovery, isRecoveryPending } from '@/features/auth/recovery';
import { requireSupabase } from '@/lib/supabase';
import { AuthCard, FormAlert } from './AuthCard';

export function ResetPasswordPage() {
  // Read once: clearing the flag after a successful update must not bounce the page mid-navigation.
  const [recovering] = useState(isRecoveryPending);
  if (!recovering) return <Navigate to="/app/cai-dat" replace />;
  return <ResetPasswordForm />;
}

function ResetPasswordForm() {
  const navigate = useNavigate();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { formRef, focusFirstInvalid } = useFocusFirstInvalid();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    const parsed = resetPasswordSchema.safeParse({ password, confirm });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      focusFirstInvalid();
      return;
    }
    setErrors({});
    setFormError(null);
    setLoading(true);
    try {
      const { error } = await requireSupabase().auth.updateUser({ password: parsed.data.password });
      if (error) {
        setFormError(authErrorMessage(error));
        return;
      }
      clearRecovery();
      toast.show({ tone: 'success', message: 'Đã đặt mật khẩu mới.' });
      navigate('/app', { replace: true });
    } catch (error) {
      setFormError(authErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Đặt mật khẩu mới" subtitle="Chọn mật khẩu mới cho tài khoản của bạn.">
      <form ref={formRef} noValidate onSubmit={onSubmit} className="space-y-4">
        {formError && <FormAlert>{formError}</FormAlert>}
        <FormField label="Mật khẩu mới" hint={errors.password ? undefined : 'Ít nhất 8 ký tự.'} error={errors.password}>
          {({ invalid, ...a11y }) => (
            <PasswordInput {...a11y} invalid={invalid} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
        </FormField>
        <FormField label="Nhập lại mật khẩu mới" error={errors.confirm}>
          {({ invalid, ...a11y }) => (
            <PasswordInput
              {...a11y}
              invalid={invalid}
              autoComplete="new-password"
              enterKeyHint="go"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          )}
        </FormField>
        <Button type="submit" variant="accent" size="lg" block loading={loading}>
          Lưu mật khẩu mới
        </Button>
      </form>
    </AuthCard>
  );
}
