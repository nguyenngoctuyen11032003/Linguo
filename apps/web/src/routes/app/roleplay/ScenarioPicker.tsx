import { useId } from 'react';
import { Target } from 'lucide-react';
import { LEVEL_INFO, roleplayScenarioFitsLevel, roleplayScenariosFor, type LevelCode, type RoleplayScenario } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { SolidCard } from '@/components/ui/SolidCard';

type Lang = 'en' | 'ko' | 'ja';

const levelName = (code: string) => LEVEL_INFO[code as LevelCode]?.label ?? code;

function ScenarioCard({
  scenario,
  suits,
  onPick,
  disabled,
  describedBy,
}: {
  scenario: RoleplayScenario;
  suits: boolean;
  onPick: () => void;
  disabled: boolean;
  describedBy?: string;
}) {
  return (
    <li>
      <SolidCard className="flex h-full flex-col gap-3 p-4">
        <div className="space-y-1">
          <h3 className="text-[17px] font-bold leading-snug">{scenario.title_vi}</h3>
          <p className="text-[15px] text-muted">{scenario.summary_vi}</p>
          <p className="text-sm text-muted">
            Bạn nói chuyện với: <span className="font-medium text-text">{scenario.partner_role_vi}</span>
          </p>
        </div>
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Target aria-hidden className="size-4 text-primary" />
            Mục tiêu
          </p>
          <ul className="list-disc space-y-0.5 pl-5 text-[15px]">
            {scenario.goals.map((g) => (
              <li key={g.key}>{g.label_vi}</li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-muted">
          Trình độ gợi ý: {levelName(scenario.level_min)} – {levelName(scenario.level_max)}
          {!suits && ' (khác trình độ hiện tại của bạn)'}
        </p>
        <div className="mt-auto">
          <Button variant={suits ? 'accent' : 'ghost'} disabled={disabled} onClick={onPick} aria-label={`Bắt đầu: ${scenario.title_vi}`} aria-describedby={describedBy}>
            Bắt đầu
          </Button>
        </div>
      </SolidCard>
    </li>
  );
}

/** Scenario cards for the current path's language: the ones that suit the learner's level first. */
export function ScenarioPicker({
  language,
  level,
  onPick,
  disabled,
  gateHint = null,
}: {
  language: Lang;
  level: string;
  onPick: (scenario: RoleplayScenario) => void;
  disabled: boolean;
  /** Today's AI turns are used up: why every "Bắt đầu" is off and when it comes back. */
  gateHint?: string | null;
}) {
  const gateHintId = useId();
  const all = roleplayScenariosFor(language);
  const fitting = all.filter((s) => roleplayScenarioFitsLevel(s, level));
  const others = all.filter((s) => !roleplayScenarioFitsLevel(s, level));
  const group = (title: string, hint: string, list: RoleplayScenario[], suits: boolean) =>
    list.length > 0 && (
      <section aria-label={title} className="space-y-3">
        <div className="space-y-0.5 px-1">
          <h2 className="text-lg font-bold tracking-[-0.02em]">{title}</h2>
          <p className="text-sm text-muted">{hint}</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((s) => (
            <ScenarioCard
              key={s.key}
              scenario={s}
              suits={suits}
              disabled={disabled}
              describedBy={gateHint ? gateHintId : undefined}
              onPick={() => onPick(s)}
            />
          ))}
        </ul>
      </section>
    );
  return (
    <div className="space-y-6">
      {gateHint && (
        <p id={gateHintId} className="rounded-2xl border border-border bg-surface-solid px-4 py-3 text-[15px]">
          {gateHint} Bài học và ôn tập vẫn dùng bình thường.
        </p>
      )}
      {group('Hợp trình độ của bạn', 'Chọn một tình huống rồi trò chuyện với đối tác AI nhé.', fitting, true)}
      {group(
        fitting.length > 0 ? 'Tình huống khác' : 'Các tình huống',
        'Có thể dễ hơn hoặc khó hơn một chút. Bạn vẫn thử được, đối tác sẽ nói chậm và đơn giản theo trình độ của bạn.',
        others,
        false,
      )}
    </div>
  );
}
