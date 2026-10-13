import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { fieldErrors, forgotPasswordSchema } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { authErrorMessage } from '@/features/auth/error-map';
import { authRedirect, requireSupabase } from '@/lib/supabase';
import { AuthCard, FormAlert, textLinkClass } from './AuthCard';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError(fieldErrors(parsed.error).email);
      return;
    }
    setError(undefined);
    setFormError(null);
    setLoading(true);
    try {
      const { error: authError } = await requireSupabase().auth.resetPasswordForEmail(parsed.data.email, {
        redirectTo: authRedirect(`/auth/callback?next=${encodeURIComponent('/dat-lai-mat-khau')}`),
      });
      // Never reveal whether the email exists: only network / rate-limit problems are shown.
      if (authError && (authError.status === 0 || authError.status === 429)) setFormError(authErrorMessage(authError));
      else setSent(true);
    } catch (err) {
      setFormError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Quên mật khẩu"
      subtitle="Nhập email đã đăng ký. Chúng tôi sẽ gửi liên kết để đặt mật khẩu mới."
      footer={
        <Link to="/dang-nhap" className={textLinkClass}>
          Quay lại đăng nhập
        </Link>
      }
    >
      {sent ? (
        <p role="status" className="text-[15px] leading-relaxed">
          Nếu email này có tài khoản, liên kết đặt lại mật khẩu sẽ đến trong vài phút. Hãy mở liên kết trên cùng trình duyệt
          này.
        </p>
      ) : (
        <form noValidate onSubmit={onSubmit} className="space-y-4">
          {formError && <FormAlert>{formError}</FormAlert>}
          <FormField label="Email" error={error}>
            {({ invalid, ...a11y }) => (
              <Input
                {...a11y}
                invalid={invalid}
                type="email"
                inputMode="email"
                autoComplete="email"
                enterKeyHint="send"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </FormField>
          <Button type="submit" variant="accent" size="lg" block loading={loading}>
            Gửi liên kết đặt lại
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
