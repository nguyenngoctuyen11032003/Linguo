import type { ReactNode } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router';
import { FullScreenLoader } from '@/components/layout/FullScreenLoader';
import { NotConfigured } from '@/components/layout/NotConfigured';
import { useAuth } from './AuthProvider';
import { safeNext } from './safe-next';

export function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.status === 'unconfigured') return <NotConfigured />;
  if (auth.status === 'loading') return <FullScreenLoader />;
  if (auth.status === 'signed-out') {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/dang-nhap?next=${next}`} replace />;
  }
  return <>{children}</>;
}

export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [params] = useSearchParams();
  if (auth.status === 'unconfigured') return <NotConfigured />;
  if (auth.status === 'loading') return <FullScreenLoader />;
  if (auth.status === 'signed-in') return <Navigate to={safeNext(params.get('next'))} replace />;
  return <>{children}</>;
}
