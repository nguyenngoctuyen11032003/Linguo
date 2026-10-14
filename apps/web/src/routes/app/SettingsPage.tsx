import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { LogOut, Monitor, Moon, Sun } from 'lucide-react';
import { useNavigate } from 'react-router';
import { DEFAULT_TIMEZONE, fieldErrors, profileUpdateSchema, type ThemePreference } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { FormField } from '@/components/ui/FormField';
import { Input, inputClasses } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { SolidCard } from '@/components/ui/SolidCard';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthProvider';
import { clearLessonCache } from '@/features/lesson-player/lessonCache';
import { useOutboxSyncContext } from '@/features/lesson-player/OutboxSyncProvider';
import { markLocalPreferenceEdit } from '@/features/preferences/local-edits';
import { updatePreferences } from '@/features/preferences/service';
import { useProfile } from '@/features/profile/ProfileProvider';
import { profileSaveErrorMessage } from '@/features/profile/errors';
import { updateProfile } from '@/features/profile/service';
import { cn } from '@/lib/cn';
import { requireSupabase } from '@/lib/supabase';
import { useMotionPrefs } from '@/providers/MotionProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { AccountDataSection } from './settings/AccountDataSection';
import { AiPrivacySection } from './settings/AiPrivacySection';
import { LearningPathsSection } from './settings/LearningPathsSection';
import { MotivationSection } from './settings/MotivationSection';

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Sáng', icon: Sun },
  { value: 'dark', label: 'Tối', icon: Moon },
  { value: 'system', label: 'Theo hệ thống', icon: Monitor },
];

function timeZones(current: string): string[] {
  const all = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [DEFAULT_TIMEZONE, 'UTC'];
  return all.includes(current) ? all : [current, ...all];
}

/** "3 câu trả lời", "2 lượt chấm thẻ ôn tập" or both: what still waits in the offline outboxes. */
function pendingSummary(answers: number, grades: number): string {
  const parts: string[] = [];
  if (answers > 0) parts.push(`${answers} câu trả lời`);
  if (grades > 0) parts.push(`${grades} lượt chấm thẻ ôn tập`);
  return parts.join(' và ');
}

export function SettingsPage() {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const { status, profile, reload, setProfile } = useProfile();
  const theme = useTheme();
  const motionPrefs = useMotionPrefs();
  const toast = useToast();
  const navigate = useNavigate();
  const outbox = useOutboxSyncContext();
  const pendingAnswers = outbox.pendingCount;
  const pendingGrades = outbox.reviews.pendingCount;
  const pendingTotal = pendingAnswers + pendingGrades;

  const [displayName, setDisplayName] = useState('');
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  /**
   * Sign-out was asked while lesson answers or review grades still wait in their outboxes: they only sync once this
   * user signs in here again.
   */
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const prefSeq = useRef(0);
  const prefQueue = useRef<Promise<void>>(Promise.resolve());
  const systemForcesMotion = motionPrefs.reduceMotion && !motionPrefs.userReduceMotion;
  const zones = useMemo(() => timeZones(timezone), [timezone]);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName);
      setTimezone(profile.timezone);
    }
  }, [profile]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (saving || !user) return;
    const parsed = profileUpdateSchema.safeParse({ displayName, timezone });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await updateProfile(requireSupabase(), userId, parsed.data);
      setProfile({ id: userId, ...parsed.data });
      setDisplayName(parsed.data.displayName);
      toast.show({ tone: 'success', message: 'Đã lưu hồ sơ.' });
    } catch (error) {
      toast.show({ tone: 'error', message: profileSaveErrorMessage(error, profile?.timezone ?? DEFAULT_TIMEZONE) });
    } finally {
      setSaving(false);
    }
  }

  /**
   * Preference writes are serialised and latest-wins: each one waits for the previous request, a write
   * that was superseded before it started is skipped, and a superseded write's error is not reported.
   */
  function persistPreferences(next: { theme: ThemePreference; reduceMotion: boolean }) {
    if (!user) return;
    const mine = ++prefSeq.current;
    prefQueue.current = prefQueue.current.then(async () => {
      if (mine !== prefSeq.current) return;
      try {
        await updatePreferences(requireSupabase(), userId, next);
      } catch {
        if (mine !== prefSeq.current) return;
        toast.show({ tone: 'error', message: 'Chưa đồng bộ được tuỳ chọn lên máy chủ. Thay đổi vẫn áp dụng trên thiết bị này.' });
      }
    });
  }

  function chooseTheme(value: ThemePreference) {
    markLocalPreferenceEdit();
    theme.setPreference(value);
    persistPreferences({ theme: value, reduceMotion: motionPrefs.userReduceMotion });
  }

  function toggleMotion() {
    const value = !motionPrefs.userReduceMotion;
    markLocalPreferenceEdit();
    motionPrefs.setUserReduceMotion(value);
    persistPreferences({ theme: theme.preference, reduceMotion: value });
  }

  async function syncNow() {
    if (syncing) return;
    setSyncing(true);
    try {
      await Promise.all([outbox.flush(), outbox.reviews.flush()]);
    } finally {
      setSyncing(false);
    }
  }

  async function signOut(force = false) {
    if (signingOut) return;
    if (pendingTotal > 0 && !force) {
      setConfirmSignOut(true);
      return;
    }
    setConfirmSignOut(false);
    setSigningOut(true);
    try {
      const auth = requireSupabase().auth;
      const { error } = await auth.signOut();
      if (error) {
        // The server could not revoke the session (offline, expired token...): still drop it on this device.
        const local = await auth.signOut({ scope: 'local' });
        if (local.error) {
          toast.show({ tone: 'error', message: 'Không đăng xuất được. Vui lòng thử lại.' });
          return;
        }
        toast.show({ tone: 'error', message: 'Không đăng xuất được trên máy chủ, đã xoá phiên trên thiết bị này.' });
      }
      // Queued answers and grades stay in their outboxes (sent when this user signs in here again), but the cached lesson text is
      // only for offline reopening by this user and must not outlive the session on a shared device.
      if (userId) clearLessonCache(userId);
      navigate('/', { replace: true });
    } catch {
      toast.show({ tone: 'error', message: 'Không đăng xuất được. Vui lòng thử lại.' });
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">Cài đặt</h1>

      <section aria-labelledby="profile-heading">
        <SolidCard className="space-y-4">
          <h2 id="profile-heading" className="text-lg font-bold">
            Hồ sơ
          </h2>
          {status === 'loading' && (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full rounded-full" />
              <Skeleton className="h-12 w-full rounded-full" />
            </div>
          )}
          {status === 'error' && <ErrorState title="Không tải được hồ sơ" onRetry={reload} />}
          {status === 'ready' && (
            <form noValidate onSubmit={saveProfile} className="space-y-4">
              <p className="text-sm text-muted">
                Email: <span className="text-text">{user?.email}</span>
              </p>
              <FormField label="Tên hiển thị" error={errors.displayName}>
                {({ invalid, ...a11y }) => (
                  <Input {...a11y} invalid={invalid} autoComplete="nickname" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                )}
              </FormField>
              <FormField label="Múi giờ" hint="Dùng để tính lịch ôn tập theo ngày của bạn." error={errors.timezone}>
                {({ invalid, ...a11y }) => (
                  <select
                    {...a11y}
                    aria-invalid={invalid || undefined}
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className={cn(inputClasses(invalid), 'appearance-none')}
                  >
                    {zones.map((zone) => (
                      <option key={zone} value={zone}>
                        {zone.replaceAll('_', ' ')}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
              <Button type="submit" variant="primary" loading={saving}>
                Lưu hồ sơ
              </Button>
            </form>
          )}
        </SolidCard>
      </section>

      <LearningPathsSection />

      <section aria-labelledby="display-heading">
        <SolidCard className="space-y-5">
          <h2 id="display-heading" className="text-lg font-bold">
            Giao diện
          </h2>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-muted">Chủ đề màu</legend>
            <div className="grid grid-cols-3 gap-2">
              {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                <div key={value} className="relative">
                  <input
                    type="radio"
                    name="theme"
                    id={`theme-${value}`}
                    value={value}
                    checked={theme.preference === value}
                    onChange={() => chooseTheme(value)}
                    className="peer sr-only"
                  />
                  <label
                    htmlFor={`theme-${value}`}
                    className={cn(
                      'flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-2 text-center text-sm font-medium',
                      'border-border hover:bg-text/5 peer-checked:border-primary peer-checked:bg-primary/12 peer-checked:text-primary',
                      'peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-(--focus-ring)',
                    )}
                  >
                    <Icon aria-hidden className="size-5" />
                    {label}
                  </label>
                </div>
              ))}
            </div>
          </fieldset>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p id="motion-label" className="font-medium">
                Giảm chuyển động
              </p>
              <p id="motion-desc" className="text-sm text-muted">
                Tắt hiệu ứng trượt, mờ và số đếm. Luôn bật nếu hệ điều hành yêu cầu.
              </p>
              {systemForcesMotion && (
                <p id="motion-system" className="mt-1 text-sm text-muted">
                  Hệ điều hành đang bật giảm chuyển động.
                </p>
              )}
            </div>
            {/* 44x44 minimum hit area around a 32px-tall visual track. */}
            <button
              type="button"
              role="switch"
              aria-checked={motionPrefs.userReduceMotion}
              aria-labelledby="motion-label"
              aria-describedby={systemForcesMotion ? 'motion-desc motion-system' : 'motion-desc'}
              onClick={toggleMotion}
              className="inline-flex min-h-11 min-w-14 shrink-0 items-center justify-center rounded-full"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'relative inline-flex h-8 w-14 items-center rounded-full border border-border transition-colors',
                  motionPrefs.userReduceMotion ? 'bg-primary' : 'bg-text/15',
                )}
              >
                <span
                  className={cn(
                    'inline-block size-6 rounded-full bg-white shadow transition-transform',
                    motionPrefs.userReduceMotion ? 'translate-x-7' : 'translate-x-1',
                  )}
                />
              </span>
            </button>
          </div>
        </SolidCard>
      </section>

      <MotivationSection />

      <AiPrivacySection />

      <AccountDataSection />

      {confirmSignOut && pendingTotal > 0 && (
        <div role="alert" className="space-y-3 rounded-2xl bg-warn/15 px-4 py-3">
          <p className="text-[15px]">
            Còn {pendingSummary(pendingAnswers, pendingGrades)} chưa đồng bộ lên máy chủ. Nếu đăng xuất bây giờ, chúng chỉ được
            gửi khi bạn đăng nhập lại trên thiết bị này.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="primary" loading={syncing} onClick={() => void syncNow()}>
              Đồng bộ ngay
            </Button>
            <Button variant="danger" loading={signingOut} onClick={() => void signOut(true)}>
              Vẫn đăng xuất
            </Button>
          </div>
        </div>
      )}

      <Button variant="danger" block loading={signingOut} onClick={() => void signOut()}>
        <LogOut aria-hidden className="size-5" />
        Đăng xuất
      </Button>
    </div>
  );
}
