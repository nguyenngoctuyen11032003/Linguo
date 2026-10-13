import { useId, useState } from 'react';
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

const clampMinutes = (raw: string) => Math.max(0, Math.min(720, Number.parseInt(raw, 10) || 0));

export function ScheduleEditor({ value, onChange, labelledBy, error }: ScheduleEditorProps) {
  const uid = useId();
  const errorId = `${uid}-error`;
  // Raw text per day while it is being typed, so a field can be emptied; it is dropped on blur.
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const total = value.weeklyMinutes.reduce((sum, m) => sum + m, 0);

  const choosePreset = (preset: SchedulePreset) => {
    setDrafts({});
    onChange({ preset, weeklyMinutes: preset === 'custom' ? value.weeklyMinutes : weekFromPreset(preset) });
  };
  const setDay = (index: number, minutes: number) => {
    if (value.weeklyMinutes[index] === minutes && value.preset === 'custom') return;
    onChange({ preset: 'custom', weeklyMinutes: value.weeklyMinutes.map((m, i) => (i === index ? minutes : m)) });
  };
  const typeDay = (index: number, raw: string) => {
    setDrafts((d) => ({ ...d, [index]: raw }));
    setDay(index, clampMinutes(raw));
  };
  const blurDay = (index: number, raw: string) => {
    setDrafts((d) => {
      const rest = { ...d };
      delete rest[index];
      return rest;
    });
    setDay(index, clampMinutes(raw));
  };
  // Show the draft only while it still matches the real value (an external change such as a preset wins).
  const shown = (index: number) => {
    const actual = value.weeklyMinutes[index] ?? 0;
    const draft = drafts[index];
    return draft !== undefined && clampMinutes(draft) === actual ? draft : String(actual);
  };

  return (
    <div className="space-y-4">
      <ChoiceList
        name={`${uid}-preset`}
        labelledBy={labelledBy}
        describedBy={error ? errorId : undefined}
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
                value={shown(i)}
                onChange={(e) => typeDay(i, e.target.value)}
                onBlur={(e) => blurDay(i, e.target.value)}
                aria-describedby={error ? errorId : undefined}
                className="px-4"
              />
            </label>
          ))}
        </div>
      )}
      <p className="px-1 text-sm text-muted">Tổng: {formatMinutes(total)} mỗi tuần</p>
      {error && (
        <p id={errorId} role="alert" className="px-1 text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}
