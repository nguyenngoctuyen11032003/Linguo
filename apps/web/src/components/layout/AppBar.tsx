import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { routeName } from '@/lib/route-titles';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { LanguagePill } from '@/components/ui/LanguagePill';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthProvider';
import { learningPathErrorMessage } from '@/features/learning-paths/error-map';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { useProfile } from '@/features/profile/ProfileProvider';
import { Avatar } from '@/components/ui/Avatar';
import { avatarUrl } from '@/features/profile/avatar';
import { getSupabase } from '@/lib/supabase';
import { Wordmark } from './Wordmark';

export function AppBar() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { paths, currentId, setCurrent } = useLearningPaths();
  const toast = useToast();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const page = routeName(pathname);
  const [pending, setPending] = useState(false);
  const initial = (profile?.displayName || user?.email || '?').trim().charAt(0).toUpperCase();
  return (
    <header className="appbar vt-appbar sticky top-0 z-30 pt-safe">
      <div className="appbar__inner">
        <Link to="/app" aria-label="Linguo" className="appbar__brand focus-ring">
          <Wordmark compact size={24} />
        </Link>
        <nav aria-label="Vị trí hiện tại" className="appbar__crumb">
          <span aria-hidden className="appbar__crumb-root">Linguo</span>
          {page && (
            <>
              <span aria-hidden className="appbar__crumb-sep">/</span>
              <span className="appbar__crumb-here">{page}</span>
            </>
          )}
        </nav>
        <div className="appbar__tools">
          <LanguagePill
            paths={paths}
            currentId={currentId}
            pending={pending}
            onSelect={(id) => {
              if (pending) return;
              setPending(true);
              setCurrent(id)
                .catch((error: unknown) => toast.show({ tone: 'error', message: learningPathErrorMessage(error) }))
                .finally(() => setPending(false));
            }}
            onAdd={(language) => navigate(`/app/bat-dau?lang=${language}`)}
          />
          {/* The app bar shows at every width (the desktop sidebar sits beside it), so it holds the only bell. */}
          <NotificationBell />
          <Link
            to="/app/cai-dat"
            aria-label="Tài khoản và cài đặt"
            className="appbar__avatar focus-ring"
          >
            <Avatar src={avatarUrl(getSupabase(), profile?.avatarPath)} initial={initial} className="size-9 lg:size-11" initialClassName="text-[13px] lg:text-[15px]" />
          </Link>
        </div>
      </div>
    </header>
  );
}
