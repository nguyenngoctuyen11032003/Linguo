import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { FullScreenLoader } from '@/components/layout/FullScreenLoader';
import { buttonClasses } from '@/components/ui/Button';
import { authErrorMessage } from '@/features/auth/error-map';
import { safeNext } from '@/features/auth/safe-next';
import { requireSupabase } from '@/lib/supabase';
import { AuthCard } from './AuthCard';

export function AuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const started = useRef(false);
  const providerError = params.get('error_description') ?? params.get('error');
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
        if (exchangeError) setError(authErrorMessage(exchangeError));
        else navigate(safeNext(params.get('next')), { replace: true });
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
