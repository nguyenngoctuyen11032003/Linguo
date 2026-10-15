import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { FullScreenLoader } from '@/components/layout/FullScreenLoader';
import { buttonClasses } from '@/components/ui/Button';
import { authErrorMessage, isKnownAuthErrorCode } from '@/features/auth/error-map';
import { markRecoveryPending } from '@/features/auth/recovery';
import { safeNext } from '@/features/auth/safe-next';
import { requireSupabase } from '@/lib/supabase';
import { AuthCard, textLinkClass } from './AuthCard';

/** The only place password-recovery links point to (see ForgotPasswordPage). */
const RECOVERY_PATH = '/dat-lai-mat-khau';

/**
 * Supabase reports expired/used links in the URL hash (`#error=access_denied&error_code=otp_expired`)
 * as often as in the query, so look at both. Both are attacker-controlled: never render them, only map
 * known codes to our own text. Returns null when there is neither an error code nor an error.
 */
function providerErrorMessage(query: URLSearchParams, hash: URLSearchParams): string | null {
  const code = query.get('error_code') ?? hash.get('error_code') ?? query.get('error') ?? hash.get('error');
  if (!code) return null;
  return isKnownAuthErrorCode(code) ? authErrorMessage({ code }) : authErrorMessage(undefined);
}

export function AuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const started = useRef(false);
  const providerError = providerErrorMessage(params, new URLSearchParams(window.location.hash.slice(1)));
  const [error, setError] = useState<string | null>(providerError);

  useEffect(() => {
    if (started.current || providerError) return;
    started.current = true; // StrictMode runs effects twice; a code can be exchanged only once.
    const code = params.get('code');
    if (!code) {
      navigate('/dang-nhap', { replace: true });
      return;
    }
    requireSupabase()
      .auth.exchangeCodeForSession(code)
      .then(({ error: exchangeError }) => {
        if (exchangeError) {
          setError(authErrorMessage(exchangeError));
          return;
        }
        const next = safeNext(params.get('next'));
        if (next === RECOVERY_PATH) markRecoveryPending();
        navigate(next, { replace: true });
      })
      .catch((err: unknown) => setError(authErrorMessage(err)));
  }, [params, navigate, providerError]);

  if (!error) return <FullScreenLoader label="Đang hoàn tất đăng nhập…" />;

  // A failed password-reset link: the messages ask for a new link, so lead straight to where one is requested.
  if (safeNext(params.get('next')) === RECOVERY_PATH) {
    return (
      <AuthCard
        title="Không mở được liên kết đặt lại mật khẩu"
        subtitle={error}
        footer={
          <Link to="/dang-nhap" className={textLinkClass}>
            Đến trang đăng nhập
          </Link>
        }
      >
        <Link to="/quen-mat-khau" className={buttonClasses('accent', 'lg', true)}>
          Gửi lại liên kết đặt lại
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Không hoàn tất được đăng nhập" subtitle={error}>
      <Link to="/dang-nhap" className={buttonClasses('accent', 'lg', true)}>
        Đến trang đăng nhập
      </Link>
    </AuthCard>
  );
}
