import { useId } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { SolidCard } from '@/components/ui/SolidCard';
import { useMotivationPrefs } from '@/features/progress/useMotivationPrefs';
import { cn } from '@/lib/cn';
import { SECTION_SCROLL_MARGIN } from './section-state';
import { DISABLED_NEUTRAL_TRACK } from '@/components/ui/disabled-styles';

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}

function ToggleRow({ label, description, checked, disabled, onToggle }: ToggleRowProps) {
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
      {/* 44x44 minimum hit area around a 32px-tall visual track, like "Giảm chuyển động". */}
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

/** Settings "Động lực và dữ liệu": show or hide streak/XP/badges, and opt out of internal usage analytics (spec 8 §4). */
export function MotivationSection() {
  const { status, prefs, update, saving, error } = useMotivationPrefs();

  return (
    <section id="dong-luc" aria-labelledby="motivation-heading" className={SECTION_SCROLL_MARGIN}>
      <SolidCard className="space-y-5">
        <h2 id="motivation-heading" className="text-lg font-bold">
          Động lực và dữ liệu
        </h2>
        {status === 'loading' && (
          <div className="space-y-3">
            <span className="sr-only">Đang tải cài đặt…</span>
            <Skeleton className="block h-12 w-full rounded-2xl" />
            <Skeleton className="block h-12 w-full rounded-2xl" />
          </div>
        )}
        {prefs && (
          <>
            <ToggleRow
              label="Hiện chuỗi ngày, XP và huy hiệu"
              description="Hiện trên Trang chủ và Tiến độ. Phần này đo sự đều đặn, không đo trình độ, nên tắt đi cũng không ảnh hưởng việc học."
              checked={prefs.show_motivation}
              disabled={saving}
              onToggle={() => void update({ show_motivation: !prefs.show_motivation })}
            />
            <ToggleRow
              label="Gửi thống kê sử dụng"
              description="Linguo ghi các sự kiện như mở trang hay hoàn thành bài để cải thiện ứng dụng. Không kèm tên, email hay nội dung câu trả lời."
              checked={!prefs.analytics_opt_out}
              disabled={saving}
              onToggle={() => void update({ analytics_opt_out: !prefs.analytics_opt_out })}
            />
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-error-text">
            {status === 'error' ? `Không tải được cài đặt. ${error}` : error}
          </p>
        )}
      </SolidCard>
    </section>
  );
}
