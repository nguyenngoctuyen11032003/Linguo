import { useEffect, useState } from 'react';
import { MailCheck } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { Button } from '@/components/ui/Button';
import { authErrorMessage } from '@/features/auth/error-map';
import { safeNext, withNext } from '@/features/auth/safe-next';
import { authRedirect, requireSupabase } from '@/lib/supabase';
import { AuthCard, FormAlert, textLinkClass } from './AuthCard';

const COOLDOWN_S = 60;

export function CheckEmailPage() {
  const location = useLocation();
  const state = location.state as { email?: string; next?: string; resendNow?: boolean } | null;
  const email = state?.email;
  // The resent link must lead where the first one did (see SignUpPage).
  const next = safeNext(state?.next);
  // From sign-in with an unconfirmed account (resendNow) no email was just sent: allow a resend right away.
  const [cooldown, setCooldown] = useState(state?.resendNow ? 0 : COOLDOWN_S);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  async function resend() {
    if (!email || loading) return;
    setLoading(true);
    try {
      const { error } = await requireSupabase().auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: authRedirect(withNext('/auth/callback', next)) },
      });
      if (error) setMessage({ tone: 'error', text: authErrorMessage(error) });
      else {
        setMessage({ tone: 'ok', text: 'Đã gửi lại email xác minh.' });
        setCooldown(COOLDOWN_S);
      }
    } catch (error) {
      setMessage({ tone: 'error', text: authErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Kiểm tra email của bạn"
      subtitle={
        email ? (
          <>
            Mình đã gửi liên kết xác minh tới <strong className="text-text">{email}</strong>. Mở liên kết trên{' '}
            <strong className="text-text">cùng trình duyệt này</strong> để hoàn tất.
          </>
        ) : (
          'Mở liên kết xác minh trong email để hoàn tất đăng ký.'
        )
      }
      footer={
        <Link to="/dang-nhap" className={textLinkClass}>
          Quay lại đăng nhập
        </Link>
      }
    >
      <MailCheck aria-hidden className="mx-auto size-12 text-primary" />
      <p className="text-center text-[15px] text-muted">Không thấy email? Kiểm tra mục Spam hoặc Quảng cáo.</p>
      {message?.tone === 'error' && <FormAlert>{message.text}</FormAlert>}
      {message?.tone === 'ok' && (
        <p role="status" className="text-center text-[15px] text-success">
          {message.text}
        </p>
      )}
      {email && (
        <Button variant="ghost" block loading={loading} disabled={cooldown > 0} onClick={resend}>
          {cooldown > 0 ? `Gửi lại sau ${cooldown}s` : 'Gửi lại email'}
        </Button>
      )}
    </AuthCard>
  );
}
