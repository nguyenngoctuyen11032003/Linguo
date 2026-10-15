import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { BellRing, Info } from 'lucide-react';
import { ISO_DAYS, REMINDER_RULES, type NotificationPrefs } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { SolidCard } from '@/components/ui/SolidCard';
import { useToast } from '@/components/ui/Toast';
import { PUSH_MESSAGES } from '@/features/notifications/error-map';
import { useNotificationPrefs } from '@/features/notifications/useNotificationPrefs';
import { usePushNotifications, type PushNotificationsState } from '@/features/notifications/usePushNotifications';
import {
  DAY_LABELS,
  draftFromPrefs,
  draftToPatch,
  isDraftDirty,
  toggleDay,
  validateReminderDraft,
  type ReminderDraft,
} from '@/features/notifications/validation';
import { cn } from '@/lib/cn';
import { SECTION_HEADING_CLASS, SECTION_SCROLL_MARGIN } from './section-state';
import { DISABLED_NEUTRAL, DISABLED_NEUTRAL_TRACK } from '@/components/ui/disabled-styles';

const MAX_OPTIONS = Array.from(
  { length: REMINDER_RULES.max_per_day_max - REMINDER_RULES.max_per_day_min + 1 },
  (_, i) => REMINDER_RULES.max_per_day_min + i,
);

const DEVICE_NOTE = 'Bạn vẫn thấy nhắc nhở trong app kể cả khi không bật thông báo thiết bị.';
const BACKOFF_TEXT = 'Linguo đang nhắc thưa hơn vì dạo này bạn bận. Muốn nhận nhắc đều đặn như trước thì bấm nút bên dưới.';

interface SwitchRowProps {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

function SwitchRow({ label, description, checked, disabled = false, onToggle }: SwitchRowProps) {
  const labelId = useId();
  const descId = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p id={labelId} className="font-medium">
          {label}
        </p>
        <p id={descId} className="text-sm text-muted">
          {description}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={descId}
        disabled={disabled}
        onClick={onToggle}
        className="group inline-flex min-h-11 min-w-14 shrink-0 items-center justify-center rounded-full disabled:cursor-wait"
      >
        <span
          aria-hidden="true"
          className={cn('relative inline-flex h-8 w-14 items-center rounded-full border border-input-border transition-colors', DISABLED_NEUTRAL_TRACK, checked ? 'bg-primary' : 'bg-text/15')}
        >
          <span className={cn('inline-block size-6 rounded-full bg-white shadow transition-transform group-disabled:bg-muted', checked ? 'translate-x-7' : 'translate-x-1')} />
        </span>
      </button>
    </div>
  );
}

function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="px-1 text-sm text-error">
      {children}
    </p>
  );
}

/** DISABLED_NEUTRAL for a chip that is a <label> around a radio: driven by the wrapped input being disabled. */
const DISABLED_NEUTRAL_LABEL =
  'has-[:disabled]:cursor-not-allowed has-[:disabled]:border-transparent has-[:disabled]:bg-surface-solid has-[:disabled]:text-muted ' +
  'has-[:disabled]:outline-2 has-[:disabled]:-outline-offset-2 has-[:disabled]:outline-dashed has-[:disabled]:outline-muted';

/** DISABLED_NEUTRAL for a text/time input (the shared Input has no disabled look of its own). */
const DISABLED_NEUTRAL_INPUT = 'disabled:cursor-not-allowed disabled:bg-surface-solid disabled:text-muted disabled:border-dashed';

const chipClasses = (active: boolean) =>
  cn(
    'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border px-3 text-[15px] font-semibold transition-colors',
    'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/45',
    active ? 'border-primary bg-primary text-on-primary' : 'border-input-border bg-surface-solid text-text hover:bg-text/5',
    DISABLED_NEUTRAL,
  );

function DeviceNotifications({ push, pushEnabled }: { push: PushNotificationsState; pushEnabled: boolean }) {
  const { state, support, busy, error, enable, disable } = push;
  let body: ReactNode;
  if (state === null) {
    body = <Skeleton className="block h-11 w-56 rounded-full" />;
  } else if (state === 'unsupported') {
    body = (
      <p className="text-sm text-muted">
        {support === 'not_configured' ? PUSH_MESSAGES.push_not_configured : PUSH_MESSAGES.push_unsupported} Trên iPhone, hãy
        cài Linguo lên màn hình chính trước rồi bật thông báo trong ứng dụng đã cài.
      </p>
    );
  } else if (state === 'denied') {
    body = (
      <div className="space-y-1 text-sm">
        <p className="font-medium">Thông báo đang bị chặn trên trình duyệt này.</p>
        <p className="text-muted">
          Để bật lại: bấm biểu tượng ổ khoá hoặc cài đặt trang cạnh thanh địa chỉ → Thông báo → Cho phép, rồi tải lại trang.
          Trên điện thoại, mở Cài đặt của máy → Thông báo → chọn trình duyệt hoặc Linguo.
        </p>
      </div>
    );
  } else if (state === 'granted-subscribed' && pushEnabled) {
    body = (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-medium">Đã bật trên thiết bị này.</p>
        <Button variant="ghost" loading={busy} onClick={() => void disable()}>
          Tắt trên thiết bị này
        </Button>
      </div>
    );
  } else if (state === 'granted-subscribed') {
    // Subscribed, but push_enabled is off for the account (turned off on another device): the server sends no push
    // until it is switched back on, so offer that instead of claiming the device is set up.
    body = (
      <div className="space-y-2">
        <p className="text-sm text-muted">Thông báo thiết bị đang tắt cho tài khoản của bạn, nên thiết bị này chưa nhận được nhắc.</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" loading={busy} onClick={() => void enable()}>
            <BellRing aria-hidden className="size-4" />
            Bật thông báo trên thiết bị này
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => void disable()}>
            Huỷ đăng ký thiết bị này
          </Button>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="space-y-2">
        {state === 'default' && (
          <p className="text-sm text-muted">Trình duyệt sẽ hỏi bạn có cho phép Linguo gửi thông báo không.</p>
        )}
        <Button variant="ghost" loading={busy} onClick={() => void enable()}>
          <BellRing aria-hidden className="size-4" />
          Bật thông báo trên thiết bị này
        </Button>
      </div>
    );
  }

  return (
    <section aria-labelledby="device-notifications-heading" className="space-y-3 border-t border-border pt-5">
      <h3 id="device-notifications-heading" className="font-semibold">
        Thông báo trên thiết bị
      </h3>
      {body}
      {error && (
        <p role="alert" className="text-sm text-error-text">
          {error}
        </p>
      )}
      <p className="flex items-start gap-2 text-sm text-muted">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
        {DEVICE_NOTE}
      </p>
    </section>
  );
}

function ReminderForm({ prefs, saving, onSave }: { prefs: NotificationPrefs; saving: boolean; onSave: (draft: ReminderDraft) => Promise<boolean> }) {
  const [edited, setEdited] = useState<ReminderDraft | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const draft = edited ?? draftFromPrefs(prefs);
  const errors = submitted ? validateReminderDraft(draft) : {};
  const dirty = edited !== null && isDraftDirty(edited, prefs);
  const daysLegendId = useId();
  const daysErrorId = useId();
  const quietErrorId = useId();
  const maxErrorId = useId();

  const saveHintId = useId();

  const change = (patch: Partial<ReminderDraft>) => setEdited({ ...draft, ...patch });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(validateReminderDraft(draft)).length > 0) return;
    if (await onSave(draft)) {
      setEdited(null);
      setSubmitted(false);
    }
  };

  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="space-y-5">
      <SwitchRow
        label="Nhắc tôi học"
        description="Một lời nhắc ngắn dẫn thẳng tới việc nên làm: ôn 5 phút, học tiếp bài dở hoặc kiểm tra nhanh."
        checked={draft.reminders_enabled}
        onToggle={() => change({ reminders_enabled: !draft.reminders_enabled })}
      />

      <fieldset disabled={!draft.reminders_enabled} className="min-w-0 space-y-5 disabled:text-muted">
        <legend className="sr-only">Lịch nhắc</legend>
        <FormField label="Giờ nhắc" error={errors.remind_at}>
          {(a11y) => (
            <Input
              type="time"
              id={a11y.id}
              aria-describedby={a11y['aria-describedby']}
              invalid={a11y.invalid}
              value={draft.remind_at}
              onChange={(e) => change({ remind_at: e.target.value })}
              className={cn('max-w-40', DISABLED_NEUTRAL_INPUT)}
            />
          )}
        </FormField>

        <div role="group" aria-labelledby={daysLegendId} aria-describedby={errors.remind_days ? daysErrorId : undefined} className="space-y-2">
          <p id={daysLegendId} className="px-1 text-sm font-medium">
            Ngày nhắc
          </p>
          <div className="flex flex-wrap gap-2">
            {ISO_DAYS.map((day) => {
              const on = draft.remind_days.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  aria-label={DAY_LABELS[day].long}
                  onClick={() => change({ remind_days: toggleDay(draft.remind_days, day) })}
                  className={chipClasses(on)}
                >
                  {DAY_LABELS[day].short}
                </button>
              );
            })}
          </div>
          {errors.remind_days && <FieldError id={daysErrorId}>{errors.remind_days}</FieldError>}
        </div>

        <fieldset className="min-w-0 space-y-2" aria-describedby={errors.quiet ? quietErrorId : undefined}>
          <legend className="px-1 text-sm font-medium">Giờ yên lặng</legend>
          <p className="px-1 text-sm text-muted">Linguo không nhắc trong khoảng này, kể cả khi khoảng giờ qua nửa đêm.</p>
          <div className="flex flex-wrap gap-3">
            <FormField label="Từ">
              {(a11y) => (
                <Input
                  type="time"
                  id={a11y.id}
                  invalid={Boolean(errors.quiet)}
                  value={draft.quiet_start}
                  onChange={(e) => change({ quiet_start: e.target.value })}
                  className={cn('w-40', DISABLED_NEUTRAL_INPUT)}
                />
              )}
            </FormField>
            <FormField label="Đến">
              {(a11y) => (
                <Input
                  type="time"
                  id={a11y.id}
                  invalid={Boolean(errors.quiet)}
                  value={draft.quiet_end}
                  onChange={(e) => change({ quiet_end: e.target.value })}
                  className={cn('w-40', DISABLED_NEUTRAL_INPUT)}
                />
              )}
            </FormField>
          </div>
          {errors.quiet && <FieldError id={quietErrorId}>{errors.quiet}</FieldError>}
        </fieldset>

        <fieldset className="min-w-0 space-y-2" aria-describedby={errors.max_per_day ? maxErrorId : undefined}>
          <legend className="px-1 text-sm font-medium">Số lần nhắc tối đa mỗi ngày</legend>
          <div className="flex gap-2">
            {MAX_OPTIONS.map((n) => (
              <label
                key={n}
                className={cn(chipClasses(draft.max_per_day === n), 'cursor-pointer has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary/45', DISABLED_NEUTRAL_LABEL)}
              >
                <input
                  type="radio"
                  name="max_per_day"
                  value={n}
                  checked={draft.max_per_day === n}
                  onChange={() => change({ max_per_day: n })}
                  className="sr-only"
                />
                {n} lần
              </label>
            ))}
          </div>
          {errors.max_per_day && <FieldError id={maxErrorId}>{errors.max_per_day}</FieldError>}
        </fieldset>
      </fieldset>

      <SwitchRow
        label="Báo cáo tuần"
        description="Mỗi Chủ nhật: thời gian đã học, kỹ năng nên luyện thêm và một gợi ý nhỏ cho tuần sau."
        checked={draft.weekly_summary}
        onToggle={() => change({ weekly_summary: !draft.weekly_summary })}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={saving} disabled={!dirty} aria-describedby={saveHintId}>
          Lưu cài đặt nhắc học
        </Button>
        <p id={saveHintId} className="text-sm text-muted">
          {dirty ? 'Bạn có thay đổi chưa lưu.' : 'Chưa có thay đổi nào để lưu.'}
        </p>
      </div>
    </form>
  );
}

/** Settings "Nhắc học" (spec 10 §5): schedule, quiet hours, weekly summary, device notifications and backoff reset. */
export function RemindersSection() {
  const { status, prefs, update, resetBackoff, reload, saving, error } = useNotificationPrefs();
  const push = usePushNotifications();
  const toast = useToast();

  const save = async (draft: ReminderDraft) => {
    const ok = await update(draftToPatch(draft));
    if (ok) toast.show({ tone: 'success', message: 'Đã lưu cài đặt nhắc học.' });
    return ok;
  };

  // The banner (and the button the learner just pressed) disappears on success: say what happened and keep focus
  // in the section instead of dropping it on <body>.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const undoBackoff = async () => {
    if (await resetBackoff()) {
      toast.show({ tone: 'success', message: 'Linguo sẽ nhắc bạn như cũ.' });
      headingRef.current?.focus();
    }
  };

  return (
    <section id="nhac-hoc" aria-labelledby="reminders-heading" className={SECTION_SCROLL_MARGIN}>
      <SolidCard className="space-y-5">
        <h2 ref={headingRef} id="reminders-heading" tabIndex={-1} className={SECTION_HEADING_CLASS}>
          Nhắc học
        </h2>
        {status === 'loading' && (
          <div role="status" className="space-y-3">
            <span className="sr-only">Đang tải cài đặt nhắc học…</span>
            <Skeleton className="block h-12 w-full rounded-2xl" />
            <Skeleton className="block h-12 w-full rounded-2xl" />
          </div>
        )}
        {status === 'error' && (
          <div role="alert" className="space-y-2">
            <p className="text-sm text-error-text">Không tải được cài đặt nhắc học. {error}</p>
            <Button variant="ghost" onClick={reload}>
              Thử lại
            </Button>
          </div>
        )}
        {prefs && (
          <>
            {prefs.backoff_level > 0 && (
              <div className="space-y-2 rounded-2xl bg-primary/10 px-4 py-3">
                <p className="flex items-start gap-2 text-sm font-medium text-text">
                  <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                  {BACKOFF_TEXT}
                </p>
                <Button variant="ghost" onClick={() => void undoBackoff()} disabled={saving}>
                  Nhắc như cũ
                </Button>
              </div>
            )}
            <ReminderForm prefs={prefs} saving={saving} onSave={save} />
            {status === 'ready' && error && (
              <p role="alert" className="text-sm text-error-text">
                {error}
              </p>
            )}
            <DeviceNotifications push={push} pushEnabled={prefs.push_enabled} />
          </>
        )}
      </SolidCard>
    </section>
  );
}
