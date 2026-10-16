import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { LanguagePill } from '@/components/ui/LanguagePill';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthProvider';
import { learningPathErrorMessage } from '@/features/learning-paths/error-map';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { useProfile } from '@/features/profile/ProfileProvider';
import { Wordmark } from './Wordmark';

export function AppBar() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { paths, currentId, setCurrent } = useLearningPaths();
  const toast = useToast();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const initial = (profile?.displayName || user?.email || '?').trim().charAt(0).toUpperCase();
  return (
    <header className="glass sticky top-0 z-30 border-x-0 border-t-0 pt-safe">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-safe">
        <Link to="/app" aria-label="Linguo" className="inline-flex min-h-11 items-center lg:invisible">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-1.5">
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
            className="inline-flex size-11 items-center justify-center rounded-full bg-[conic-gradient(from_200deg,var(--primary),var(--accent),var(--primary))] p-[2px]"
          >
            <span className="inline-flex size-full items-center justify-center rounded-full bg-surface-solid text-[15px] font-extrabold">{initial}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
