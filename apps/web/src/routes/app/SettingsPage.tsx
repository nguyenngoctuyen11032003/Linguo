import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Camera, LogOut, Monitor, Moon, Sun, Trash2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { DEFAULT_TIMEZONE, fieldErrors, profileUpdateSchema, type ThemePreference } from '@linguo/shared';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { FormField } from '@/components/ui/FormField';
import { Input, inputClasses } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { SolidCard } from '@/components/ui/SolidCard';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthProvider';
import { useFocusFirstInvalid } from '@/features/auth/useFocusFirstInvalid';
import { clearAllLocalLearnerData } from '@/features/account/service';
import { useOutboxSyncContext } from '@/features/lesson-player/OutboxSyncProvider';
import { releasePushOnSignOut } from '@/features/notifications/push';
import { markLocalPreferenceEdit } from '@/features/preferences/local-edits';
import { updatePreferences } from '@/features/preferences/service';
import { useProfile } from '@/features/profile/ProfileProvider';
import { profileSaveErrorMessage } from '@/features/profile/errors';
import { avatarErrorMessage, avatarUrl, prepareAvatar, removeAvatar, uploadAvatar } from '@/features/profile/avatar';
import { updateProfile } from '@/features/profile/service';
import { InstallAppSection } from '@/features/pwa/InstallAppSection';
import { cn } from '@/lib/cn';
import { playSound } from '@/lib/sound';
import type { AppStyle } from '@/lib/app-style';
import { getSupabase, requireSupabase } from '@/lib/supabase';
import { useMotionPrefs } from '@/providers/MotionProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { AccountDataSection } from './settings/AccountDataSection';
import { AiPrivacySection } from './settings/AiPrivacySection';
import { LearningPathsSection } from './settings/LearningPathsSection';
import { MotivationSection } from './settings/MotivationSection';
import { MyReportsSection } from './settings/MyReportsSection';
import { OfflineContentSection } from './settings/OfflineContentSection';
import { PasswordSection } from './settings/PasswordSection';
import { RemindersSection } from './settings/RemindersSection';
import { SoundSection } from './settings/SoundSection';
import { COLLAPSIBLE_SECTION_IDS, jumpToSection, SECTION_HEADING_CLASS, SECTION_SCROLL_MARGIN } from './settings/section-state';
import { SettingsJumpList } from './settings/SettingsJumpList';
import { PageHeader } from './PageHeader';
import { timeZoneLabel, timeZoneOptions } from './settings/timezones';
import { SelectChevron, SELECT_WITH_CHEVRON } from './settings/SelectChevron';

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string; short?: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Sáng', icon: Sun },
  { value: 'dark', label: 'Tối', icon: Moon },
  { value: 'system', label: 'Theo hệ thống', short: 'Hệ thống', icon: Monitor },
];

const STYLE_OPTIONS: Array<{ value: AppStyle; label: string; hint: string }> = [
  { value: 'default', label: 'Mặc định', hint: 'Giao diện hiện tại của Linguo' },
  { value: 'glass', label: 'Kính lỏng', hint: 'Thẻ kính mờ, nền xanh xám và điểm nhấn vàng' },
  { value: 'warm', label: 'Cà phê ấm', hint: 'Tông nâu espresso ấm, thẻ trong mờ' },
];

/** Mini preview of each style (drawn in the current light/dark theme). */
const STYLE_SWATCH: Record<AppStyle, { light: string; dark: string; dot: string }> = {
  default: { light: 'bg-[#f3f1ec]', dark: 'bg-[#070b12]', dot: 'bg-[#f37d25]' },
  glass: { light: 'bg-[linear-gradient(160deg,#dbe3ea,#b9c9d6)]', dark: 'bg-[linear-gradient(160deg,#1b2631,#3d566b)]', dot: 'bg-[#e6cf5a]' },
  warm: { light: 'bg-[linear-gradient(160deg,#f6ede2,#e9d3b8)]', dark: 'bg-[linear-gradient(160deg,#180a06,#4a2412)]', dot: 'bg-[#e2a56c]' },
};

/** Mini preview of each theme in the picker. */
const THEME_SWATCH: Record<ThemePreference, string> = {
  light: 'bg-[#f3f1ec] text-[#0d1622]',
  dark: 'bg-[#070b12] text-white',
  system: 'bg-[linear-gradient(135deg,#f3f1ec_50%,#070b12_50%)] text-[#59646f]',
};

/**
 * "3 câu trả lời", "2 lượt chấm thẻ ôn tập", "1 lượt chấm từ vựng cá nhân" or any mix of them: what still waits in the
 * offline outboxes.
 */
function pendingSummary(answers: number, grades: number, personalGrades: number): string {
  const parts: string[] = [];
  if (answers > 0) parts.push(`${answers} câu trả lời`);
  if (grades > 0) parts.push(`${grades} lượt chấm thẻ ôn tập`);
  if (personalGrades > 0) parts.push(`${personalGrades} lượt chấm từ vựng cá nhân`);
  const last = parts.pop();
  return parts.length > 0 ? `${parts.join(', ')} và ${last}` : (last ?? '');
}

export function SettingsPage() {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const { status, profile, reload, setProfile } = useProfile();
  const theme = useTheme();
  const motionPrefs = useMotionPrefs();
  const toast = useToast();
  const navigate = useNavigate();
  const { hash } = useLocation();
  const outbox = useOutboxSyncContext();
  const pendingAnswers = outbox.pendingCount;
  const pendingGrades = outbox.reviews.pendingCount;
  const pendingPersonalGrades = outbox.personalVocab.pendingCount;
  const pendingTotal = pendingAnswers + pendingGrades + pendingPersonalGrades;

  const [displayName, setDisplayName] = useState('');
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const { formRef: profileFormRef, focusFirstInvalid } = useFocusFirstInvalid();
  const [signingOut, setSigningOut] = useState(false);
  /**
   * Sign-out was asked while lesson answers, review grades or personal vocabulary grades still wait in their outboxes:
   * they only sync once this user signs in here again.
   */
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);
  const prefSeq = useRef(0);
  const prefQueue = useRef<Promise<void>>(Promise.resolve());
  const systemForcesMotion = motionPrefs.reduceMotion && !motionPrefs.userReduceMotion;
  const zones = useMemo(() => timeZoneOptions(timezone), [timezone]);

  // A link such as /app/cai-dat#bao-loi must land on an open section.
  useEffect(() => {
    const id = hash.slice(1);
    if (COLLAPSIBLE_SECTION_IDS.includes(id)) jumpToSection(id);
  }, [hash]);

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
      focusFirstInvalid();
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await updateProfile(requireSupabase(), userId, parsed.data);
      setProfile({ ...profile, id: userId, ...parsed.data });
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

  async function onAvatarFile(file: File | undefined) {
    if (!file || avatarBusy || !user || !profile) return;
    setAvatarBusy(true);
    try {
      const blob = await prepareAvatar(file);
      const path = await uploadAvatar(requireSupabase(), userId, blob, profile.avatarPath ?? null);
      setProfile({ ...profile, avatarPath: path });
      toast.show({ tone: 'success', message: 'Đã cập nhật ảnh đại diện.' });
    } catch (error) {
      toast.show({ tone: 'error', message: avatarErrorMessage(error) });
    } finally {
      setAvatarBusy(false);
      if (avatarInput.current) avatarInput.current.value = '';
    }
  }

  async function onAvatarRemove() {
    if (avatarBusy || !user || !profile?.avatarPath) return;
    setAvatarBusy(true);
    try {
      await removeAvatar(requireSupabase(), userId, profile.avatarPath);
      setProfile({ ...profile, avatarPath: null });
      toast.show({ tone: 'success', message: 'Đã xoá ảnh đại diện.' });
    } catch (error) {
      toast.show({ tone: 'error', message: avatarErrorMessage(error) });
    } finally {
      setAvatarBusy(false);
    }
  }

  function chooseTheme(value: ThemePreference) {
    playSound('select');
    markLocalPreferenceEdit();
    theme.setPreference(value);
    persistPreferences({ theme: value, reduceMotion: motionPrefs.userReduceMotion });
  }

  function toggleMotion() {
    const value = !motionPrefs.userReduceMotion;
    playSound(value ? 'toggleOn' : 'toggleOff');
    markLocalPreferenceEdit();
    motionPrefs.setUserReduceMotion(value);
    persistPreferences({ theme: theme.preference, reduceMotion: value });
  }

  async function syncNow() {
    if (syncing) return;
    setSyncing(true);
    try {
      await Promise.all([outbox.flush(), outbox.reviews.flush(), outbox.personalVocab.flush()]);
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
      const client = requireSupabase();
      const auth = client.auth;
      // This browser must stop getting the learner's reminders once signed out: release its push subscription while
      // the session can still delete it server-side. Best effort with a short timeout; it never blocks signing out.
      try {
        await releasePushOnSignOut(client);
      } catch {
        // Nothing to do: a dead endpoint is removed by the dispatcher on its first 404/410.
      }
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
      // The device is handed over: drop this user's cached lessons and every user's private stores (role-play chat,
      // speaking ratings, onboarding draft), but keep the queued answers that are not synced yet: they are scoped by
      // user id and are sent after the next sign-in, so signing out never loses learning progress.
      clearAllLocalLearnerData(userId, { mode: 'sign-out' });
      navigate('/', { replace: true });
    } catch {
      toast.show({ tone: 'error', message: 'Không đăng xuất được. Vui lòng thử lại.' });
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeader title="Cài đặt" lede="Hồ sơ, lộ trình, giao diện và quyền riêng tư của bạn." />

      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start lg:gap-12 xl:grid-cols-[15rem_minmax(0,1fr)]">
      <SettingsJumpList />

      <div className="reveal-stagger min-w-0 space-y-6 lg:max-w-[48rem] lg:space-y-8">
      <section id="ho-so" aria-labelledby="profile-heading" className={SECTION_SCROLL_MARGIN}>
        <SolidCard className="space-y-4">
          <h2 id="profile-heading" tabIndex={-1} className={SECTION_HEADING_CLASS}>
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
            <form ref={profileFormRef} noValidate onSubmit={saveProfile} className="space-y-4">
              <div className="flex items-center gap-3 rounded-[1.25rem] bg-text/[0.04] p-3">
                <Avatar
                  src={avatarUrl(getSupabase(), profile?.avatarPath)}
                  initial={(displayName || user?.email || '?').trim().charAt(0).toUpperCase()}
                  className="size-16"
                  initialClassName="stat-num text-[30px]"
                />
                <p className="min-w-0 flex-1">
                  <span className="eyebrow block">
                    Email<span className="sr-only">:</span>
                  </span>
                  <span className="mt-0.5 block text-[15px] font-medium [overflow-wrap:anywhere]">{user?.email}</span>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={avatarInput}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  tabIndex={-1}
                  aria-label="Chọn ảnh đại diện"
                  onChange={(e) => void onAvatarFile(e.target.files?.[0])}
                />
                <Button type="button" variant="glass" loading={avatarBusy} onClick={() => avatarInput.current?.click()}>
                  <Camera aria-hidden className="size-5" />
                  {profile?.avatarPath ? 'Đổi ảnh đại diện' : 'Tải ảnh đại diện'}
                </Button>
                {profile?.avatarPath && (
                  <Button type="button" variant="ghost" disabled={avatarBusy} onClick={() => void onAvatarRemove()}>
                    <Trash2 aria-hidden className="size-5" />
                    Xoá ảnh
                  </Button>
                )}
                <p className="w-full text-sm text-muted">JPG, PNG, WebP hoặc ảnh chụp từ điện thoại (tối đa 25 MB). Ảnh được cắt vuông tự động.</p>
              </div>
              <FormField label="Tên hiển thị" error={errors.displayName}>
                {({ invalid, ...a11y }) => (
                  <Input {...a11y} invalid={invalid} autoComplete="nickname" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                )}
              </FormField>
              <FormField
                label="Múi giờ"
                hint="Dùng để tính lịch ôn tập theo ngày của bạn. Mỗi lần đổi múi giờ cần cách nhau ít nhất 24 giờ."
                error={errors.timezone}
              >
                {({ invalid, ...a11y }) => (
                  <SelectChevron>
                    <select
                      {...a11y}
                      aria-invalid={invalid || undefined}
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className={cn(inputClasses(invalid), SELECT_WITH_CHEVRON)}
                    >
                      {zones.map((zone) => (
                        <option key={zone} value={zone}>
                          {timeZoneLabel(zone)}
                        </option>
                      ))}
                    </select>
                  </SelectChevron>
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

      <section id="giao-dien" aria-labelledby="display-heading" className={SECTION_SCROLL_MARGIN}>
        <SolidCard className="space-y-5">
          <h2 id="display-heading" tabIndex={-1} className={SECTION_HEADING_CLASS}>
            Giao diện
          </h2>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-muted">Chủ đề màu</legend>
            <div className="grid grid-cols-3 gap-2">
              {THEME_OPTIONS.map(({ value, label, short, icon: Icon }) => (
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
                      'flex min-h-16 cursor-pointer flex-col items-center justify-center gap-2 rounded-[1.25rem] border p-1.5 pb-2.5 text-center text-[13px] font-semibold leading-tight whitespace-nowrap min-[380px]:p-2 transition-[background-color,border-color,scale] duration-150 active:scale-[0.97] min-[380px]:text-sm',
                      'border-border hover:bg-text/5 peer-checked:border-primary peer-checked:bg-primary/12 peer-checked:text-primary',
                      'peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-(--focus-ring)',
                    )}
                  >
                    <span aria-hidden="true" className={cn('relative block h-12 w-full overflow-hidden rounded-xl ring-1 ring-border ring-inset', THEME_SWATCH[value])}>
                      <span className="absolute inset-x-2 top-2 h-2 rounded-full bg-current opacity-25" />
                      <span className="absolute bottom-2 left-2 h-3 w-8 rounded-full bg-[#f37d25]" />
                    </span>
                    <span className="inline-flex min-h-5 items-center gap-1.5">
                      <Icon aria-hidden className="size-4 max-[379px]:hidden" />
                      {short ? (
                        <>
                          <span className="sr-only">{label}</span>
                          <span aria-hidden="true">{short}</span>
                        </>
                      ) : (
                        label
                      )}
                    </span>
                  </label>
                </div>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-muted">Phong cách</legend>
            <div className="grid grid-cols-3 gap-2">
              {STYLE_OPTIONS.map(({ value, label, hint }) => (
                <div key={value} className="relative">
                  <input
                    type="radio"
                    name="app-style"
                    id={`style-${value}`}
                    value={value}
                    checked={theme.style === value}
                    onChange={() => {
                      playSound('select');
                      theme.setStyle(value);
                    }}
                    aria-describedby={`style-${value}-hint`}
                    className="peer sr-only"
                  />
                  <label
                    htmlFor={`style-${value}`}
                    className={cn(
                      'flex min-h-16 cursor-pointer flex-col items-center justify-center gap-2 rounded-[1.25rem] border p-1.5 pb-2.5 text-center text-[13px] font-semibold leading-tight whitespace-nowrap min-[380px]:p-2 transition-[background-color,border-color,scale] duration-150 active:scale-[0.97] min-[380px]:text-sm',
                      'border-border hover:bg-text/5 peer-checked:border-primary peer-checked:bg-primary/12 peer-checked:text-primary',
                      'peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-(--focus-ring)',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'relative block h-12 w-full overflow-hidden rounded-xl ring-1 ring-border ring-inset',
                        theme.resolved === 'dark' ? STYLE_SWATCH[value].dark : STYLE_SWATCH[value].light,
                      )}
                    >
                      <span className={cn('absolute inset-x-2 top-2 h-2 rounded-full opacity-25', theme.resolved === 'dark' ? 'bg-white' : 'bg-black')} />
                      <span className={cn('absolute bottom-2 left-2 h-3 w-8 rounded-full', STYLE_SWATCH[value].dot)} />
                    </span>
                    <span>{label}</span>
                  </label>
                  <span id={`style-${value}-hint`} className="sr-only">
                    {hint}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-sm text-muted" aria-live="polite">
              {STYLE_OPTIONS.find((o) => o.value === theme.style)?.hint}. Áp dụng cho cả chế độ sáng và tối, lưu trên thiết bị này.
            </p>
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

      <SoundSection />

      <MotivationSection />

      <RemindersSection />

      <AiPrivacySection />

      <InstallAppSection />

      <OfflineContentSection />

      <MyReportsSection />

      <PasswordSection />

      <AccountDataSection />

      {confirmSignOut && pendingTotal > 0 && (
        <div role="alert" className="space-y-3 rounded-2xl bg-warn/15 px-4 py-3">
          <p className="text-[15px]">
            Còn {pendingSummary(pendingAnswers, pendingGrades, pendingPersonalGrades)} chưa đồng bộ lên máy chủ. Nếu đăng xuất bây giờ, chúng chỉ được
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
      </div>
    </div>
  );
}
