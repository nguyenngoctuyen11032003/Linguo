import { SCHEDULE_PRESETS, type SchedulePreset } from '@linguo/shared';
import { Input } from '@/components/ui/Input';
import { ChoiceList } from './ChoiceList';
import { formatMinutes, PRESET_LABELS, WEEKDAYS, weekFromPreset } from './schedule';

export interface ScheduleValue {
  preset: SchedulePreset;
  weeklyMinutes: number[];
}

interface ScheduleEditorProps {
  value: ScheduleValue;
  onChange: (value: ScheduleValue) => void;
  labelledBy: string;
  error?: string;
}

export function ScheduleEditor({ value, onChange, labelledBy, error }: ScheduleEditorProps) {
  const total = value.weeklyMinutes.reduce((sum, m) => sum + m, 0);
  const choosePreset = (preset: SchedulePreset) =>
    onChange({ preset, weeklyMinutes: preset === 'custom' ? value.weeklyMinutes : weekFromPreset(preset) });
  const setDay = (index: number, raw: string) => {
    const minutes = Math.max(0, Math.min(720, Number.parseInt(raw, 10) || 0));
    onChange({ preset: 'custom', weeklyMinutes: value.weeklyMinutes.map((m, i) => (i === index ? minutes : m)) });
  };

  return (
    <div className="space-y-4">
      <ChoiceList
        name="schedule-preset"
        labelledBy={labelledBy}
        value={value.preset}
        onChange={choosePreset}
        options={SCHEDULE_PRESETS.map((p) => ({ value: p, label: PRESET_LABELS[p] }))}
      />
      {value.preset === 'custom' && (
        <div className="grid grid-cols-2 gap-3 min-[380px]:grid-cols-4">
          {WEEKDAYS.map((day, i) => (
            <label key={day.short} className="space-y-1 text-sm font-medium">
              <span className="block px-1">{day.long}</span>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={720}
                step={5}
                value={String(value.weeklyMinutes[i] ?? 0)}
                onChange={(e) => setDay(i, e.target.value)}
                aria-label={day.long}
                className="px-4"
              />
            </label>
          ))}
        </div>
      )}
      <p className="px-1 text-sm text-muted">Tổng: {formatMinutes(total)} mỗi tuần</p>
      {error && (
        <p role="alert" className="px-1 text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}
