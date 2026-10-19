import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { fieldErrors, signUpSchema } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { authErrorMessage } from '@/features/auth/error-map';
import { safeNext, withNext } from '@/features/auth/safe-next';
import { useFocusFirstInvalid } from '@/features/auth/useFocusFirstInvalid';
import { authRedirect, requireSupabase } from '@/lib/supabase';
import { AuthCard, FormAlert, textLinkClass } from './AuthCard';
import { GoogleButton } from './GoogleButton';

export function SignUpPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  // Kept from the sign-in screen (e.g. a class invite link) through email confirmation and Google sign-in.
  const next = safeNext(params.get('next'));
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { formRef, focusFirstInvalid } = useFocusFirstInvalid();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    const parsed = signUpSchema.safeParse({ displayName, email, password });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      focusFirstInvalid();
      return;
    }
    setErrors({});
    setFormError(null);
    setLoading(true);
    try {
      const { data, error } = await requireSupabase().auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: { emailRedirectTo: authRedirect(withNext('/auth/callback', next)), data: { display_name: parsed.data.displayName } },
      });
      if (error) {
        setFormError(authErrorMessage(error));
        return;
      }
      // With email confirmation on, there is no session yet (also when the email already exists — Supabase hides that).
      if (data.session) navigate(next, { replace: true });
      else navigate('/kiem-tra-email', { replace: true, state: { email: parsed.data.email, next } });
    } catch (error) {
      setFormError(authErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Tạo tài khoản"
      subtitle="Miễn phí. Bạn có thể học tiếng Anh, tiếng Hàn, tiếng Nhật và tiếng Đức trên cùng một tài khoản."
      footer={
        <>
          Đã có tài khoản?{' '}
          <Link to={withNext('/dang-nhap', next)} className={textLinkClass}>
            Đăng nhập
          </Link>
        </>
      }
    >
      <GoogleButton next={next} onError={setFormError} />
      <form ref={formRef} noValidate onSubmit={onSubmit} className="space-y-4">
        {formError && <FormAlert>{formError}</FormAlert>}
        <FormField label="Tên hiển thị (không bắt buộc)" error={errors.displayName}>
          {({ invalid, ...a11y }) => (
            <Input
              {...a11y}
              invalid={invalid}
              autoComplete="nickname"
              enterKeyHint="next"
              maxLength={60}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          )}
        </FormField>
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
        <FormField label="Mật khẩu" hint={errors.password ? undefined : 'Ít nhất 8 ký tự.'} error={errors.password}>
          {({ invalid, ...a11y }) => (
            <PasswordInput
              {...a11y}
              invalid={invalid}
              autoComplete="new-password"
              enterKeyHint="go"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </FormField>
        <Button type="submit" variant="accent" size="lg" block loading={loading}>
          Tạo tài khoản
        </Button>
        <p className="text-center text-sm text-muted">
          Khi tạo tài khoản, bạn đồng ý với{' '}
          <Link to="/dieu-khoan" className={textLinkClass}>
            Điều khoản
          </Link>{' '}
          và{' '}
          <Link to="/quyen-rieng-tu" className={textLinkClass}>
            Quyền riêng tư
          </Link>
          .
        </p>
      </form>
    </AuthCard>
  );
}
