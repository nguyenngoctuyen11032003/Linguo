import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { FullScreenLoader } from '@/components/layout/FullScreenLoader';
import { buttonClasses } from '@/components/ui/Button';
import { authErrorMessage, isKnownAuthErrorCode } from '@/features/auth/error-map';
import { markRecoveryPending } from '@/features/auth/recovery';
import { safeNext } from '@/features/auth/safe-next';
import { requireSupabase } from '@/lib/supabase';
import { AuthCard } from './AuthCard';

/** The only place password-recovery links point to (see ForgotPasswordPage). */
const RECOVERY_PATH = '/dat-lai-mat-khau';

/** Query params are attacker-controlled: never render them, only map known codes to our own text. */
function providerErrorMessage(params: URLSearchParams): string | null {
  if (!params.has('error') && !params.has('error_code') && !params.has('error_description')) return null;
  const code = params.get('error_code') ?? params.get('error');
  return isKnownAuthErrorCode(code) ? authErrorMessage({ code }) : authErrorMessage(undefined);
}

export function AuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const started = useRef(false);
  const providerError = providerErrorMessage(params);
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

  return (
    <AuthCard title="Không hoàn tất được đăng nhập" subtitle={error}>
      <Link to="/dang-nhap" className={buttonClasses('accent', 'lg', true)}>
        Đến trang đăng nhập
      </Link>
    </AuthCard>
  );
}
