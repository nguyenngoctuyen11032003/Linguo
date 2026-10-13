import { useEffect, useMemo, useState, type FormEvent } from 'react';
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
import { updatePreferences } from '@/features/preferences/service';
import { useProfile } from '@/features/profile/ProfileProvider';
import { updateProfile } from '@/features/profile/service';
import { cn } from '@/lib/cn';
import { requireSupabase } from '@/lib/supabase';
import { useMotionPrefs } from '@/providers/MotionProvider';
import { useTheme } from '@/providers/ThemeProvider';

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Sáng', icon: Sun },
  { value: 'dark', label: 'Tối', icon: Moon },
  { value: 'system', label: 'Theo hệ thống', icon: Monitor },
];

function timeZones(current: string): string[] {
  const all = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [DEFAULT_TIMEZONE, 'UTC'];
  return all.includes(current) ? all : [current, ...all];
}

export function SettingsPage() {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const { status, profile, reload, setProfile } = useProfile();
  const theme = useTheme();
  const motionPrefs = useMotionPrefs();
  const toast = useToast();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState('');
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const zones = useMemo(() => timeZones(timezone), [timezone]);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName);
      setTimezone(profile.timezone);
    }
  }, [profile]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
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
    } catch {
      toast.show({ tone: 'error', message: 'Chưa lưu được hồ sơ. Kiểm tra mạng rồi thử lại.' });
    } finally {
      setSaving(false);
    }
  }

  async function persistPreferences(next: { theme: ThemePreference; reduceMotion: boolean }) {
    try {
      await updatePreferences(requireSupabase(), userId, next);
    } catch {
      toast.show({ tone: 'error', message: 'Chưa đồng bộ được tuỳ chọn lên máy chủ. Thay đổi vẫn áp dụng trên thiết bị này.' });
    }
  }

  function chooseTheme(value: ThemePreference) {
    theme.setPreference(value);
    void persistPreferences({ theme: value, reduceMotion: motionPrefs.userReduceMotion });
  }

  function toggleMotion() {
    const value = !motionPrefs.userReduceMotion;
    motionPrefs.setUserReduceMotion(value);
    void persistPreferences({ theme: theme.preference, reduceMotion: value });
  }

  async function signOut() {
    setSigningOut(true);
    try {
      await requireSupabase().auth.signOut();
    } finally {
      setSigningOut(false);
      navigate('/', { replace: true });
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

      <section aria-labelledby="display-heading">
        <SolidCard className="space-y-5">
          <h2 id="display-heading" className="text-lg font-bold">
            Giao diện
          </h2>
          <div role="radiogroup" aria-label="Chủ đề màu" className="grid grid-cols-3 gap-2">
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
              const checked = theme.preference === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => chooseTheme(value)}
                  className={cn(
                    'flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-2 text-center text-sm font-medium',
                    checked ? 'border-primary bg-primary/12 text-primary' : 'border-border hover:bg-text/5',
                  )}
                >
                  <Icon aria-hidden className="size-5" />
                  {label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p id="motion-label" className="font-medium">
                Giảm chuyển động
              </p>
              <p id="motion-desc" className="text-sm text-muted">
                Tắt hiệu ứng trượt, mờ và số đếm. Luôn bật nếu hệ điều hành yêu cầu.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={motionPrefs.userReduceMotion}
              aria-labelledby="motion-label"
              aria-describedby="motion-desc"
              onClick={toggleMotion}
              className={cn(
                'relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border border-border transition-colors',
                motionPrefs.userReduceMotion ? 'bg-primary' : 'bg-text/15',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'inline-block size-6 rounded-full bg-white shadow transition-transform',
                  motionPrefs.userReduceMotion ? 'translate-x-7' : 'translate-x-1',
                )}
              />
            </button>
          </div>
        </SolidCard>
      </section>

      <Button variant="danger" block loading={signingOut} onClick={signOut}>
        <LogOut aria-hidden className="size-5" />
        Đăng xuất
      </Button>
    </div>
  );
}
