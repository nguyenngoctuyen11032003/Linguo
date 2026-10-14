import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { fieldErrors, signInSchema } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { authErrorMessage } from '@/features/auth/error-map';
import { useFocusFirstInvalid } from '@/features/auth/useFocusFirstInvalid';
import { safeNext } from '@/features/auth/safe-next';
import { requireSupabase } from '@/lib/supabase';
import { AuthCard, FormAlert, textLinkClass } from './AuthCard';
import { GoogleButton } from './GoogleButton';

export function SignInPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { formRef, focusFirstInvalid } = useFocusFirstInvalid();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      focusFirstInvalid();
      return;
    }
    setErrors({});
    setFormError(null);
    setLoading(true);
    try {
      const { error } = await requireSupabase().auth.signInWithPassword(parsed.data);
      if (error) {
        setFormError(authErrorMessage(error));
        return;
      }
      navigate(next, { replace: true });
    } catch (error) {
      setFormError(authErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Chào mừng trở lại"
      subtitle="Đăng nhập để tiếp tục lộ trình của bạn."
      footer={
        <>
          Chưa có tài khoản?{' '}
          <Link to="/dang-ky" className={textLinkClass}>
            Đăng ký miễn phí
          </Link>
        </>
      }
    >
      <GoogleButton next={next} onError={setFormError} />
      <form ref={formRef} noValidate onSubmit={onSubmit} className="space-y-4">
        {formError && <FormAlert>{formError}</FormAlert>}
        <FormField label="Email" error={errors.email}>
          {({ invalid, ...a11y }) => (
            <Input
              {...a11y}
              invalid={invalid}
              type="email"
              inputMode="email"
              autoComplete="email"
              enterKeyHint="next"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </FormField>
        <FormField label="Mật khẩu" error={errors.password}>
          {({ invalid, ...a11y }) => (
            <PasswordInput
              {...a11y}
              invalid={invalid}
              autoComplete="current-password"
              enterKeyHint="go"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </FormField>
        <div className="flex justify-end">
          <Link to="/quen-mat-khau" className={textLinkClass}>
            Quên mật khẩu?
          </Link>
        </div>
        <Button type="submit" variant="accent" size="lg" block loading={loading}>
          Đăng nhập
        </Button>
      </form>
    </AuthCard>
  );
}
