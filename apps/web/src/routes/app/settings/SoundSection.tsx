import { useId } from 'react';
import { Volume1, Volume2 } from 'lucide-react';
import { SolidCard } from '@/components/ui/SolidCard';
import { cn } from '@/lib/cn';
import { playSound, setSoundPrefs, useSoundPrefs } from '@/lib/sound';
import { SECTION_HEADING_CLASS, SECTION_SCROLL_MARGIN } from './section-state';

/** Haptics only exist on browsers with navigator.vibrate (Android Chrome); hide the switch elsewhere. */
const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;

/**
 * "Âm thanh": interface sounds, their volume and vibration. Device-local on purpose (a laptop at the office and a phone
 * on the bus want different answers), so nothing here is synced to the account.
 */
export function SoundSection() {
  const prefs = useSoundPrefs();
  const volumeId = useId();

  const toggleSound = () => {
    const enabled = !prefs.enabled;
    setSoundPrefs({ enabled });
    // Turning sound on answers with a sample so the learner hears the level right away.
    if (enabled) playSound('correct');
  };

  const toggleHaptics = () => {
    const haptics = !prefs.haptics;
    setSoundPrefs({ haptics });
    if (haptics) navigator.vibrate?.(20);
  };

  return (
    <section id="am-thanh" aria-labelledby="sound-heading" className={SECTION_SCROLL_MARGIN}>
      <SolidCard className="space-y-5">
        <h2 id="sound-heading" tabIndex={-1} className={SECTION_HEADING_CLASS}>
          Âm thanh
        </h2>
        <SwitchRow
          id="sound-enabled"
          label="Âm thanh hiệu ứng"
          description="Tiếng khi trả lời đúng, sai, hoàn thành bài và đạt thành tích. Lưu trên thiết bị này."
          checked={prefs.enabled}
          onToggle={toggleSound}
        />
        <div className={cn('space-y-2', !prefs.enabled && 'opacity-50')}>
          <label htmlFor={volumeId} className="font-medium">
            Âm lượng
          </label>
          <div className="flex items-center gap-3">
            <Volume1 aria-hidden className="size-5 shrink-0 text-muted" />
            <input
              id={volumeId}
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(prefs.volume * 100)}
              disabled={!prefs.enabled}
              onChange={(e) => setSoundPrefs({ volume: Number(e.target.value) / 100 })}
              // Preview on release, not on every step of a drag.
              onPointerUp={() => playSound('correct')}
              onKeyUp={(e) => {
                if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') playSound('select');
              }}
              aria-valuetext={`${Math.round(prefs.volume * 100)}%`}
              className="h-11 min-w-0 flex-1 cursor-pointer accent-(--primary) disabled:cursor-not-allowed"
            />
            <Volume2 aria-hidden className="size-5 shrink-0 text-muted" />
          </div>
        </div>
        {canVibrate && (
          <SwitchRow
            id="sound-haptics"
            label="Rung khi phản hồi"
            description="Rung nhẹ khi trả lời và khi hoàn thành bài."
            checked={prefs.haptics}
            onToggle={toggleHaptics}
          />
        )}
      </SolidCard>
    </section>
  );
}

function SwitchRow({ id, label, description, checked, onToggle }: { id: string; label: string; description: string; checked: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p id={`${id}-label`} className="font-medium">
          {label}
        </p>
        <p id={`${id}-desc`} className="text-sm text-muted">
          {description}
        </p>
      </div>
      {/* 44x44 minimum hit area around a 32px-tall visual track (same switch as "Giảm chuyển động"). */}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-desc`}
        onClick={onToggle}
        className="inline-flex min-h-11 min-w-14 shrink-0 items-center justify-center rounded-full"
      >
        <span
          aria-hidden="true"
          className={cn('relative inline-flex h-8 w-14 items-center rounded-full border border-border transition-colors', checked ? 'bg-primary' : 'bg-text/15')}
        >
          <span className={cn('inline-block size-6 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-7' : 'translate-x-1')} />
        </span>
      </button>
    </div>
  );
}
