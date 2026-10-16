import { useId } from 'react';
import { Target, UserRound } from 'lucide-react';
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
  featured,
}: {
  scenario: RoleplayScenario;
  suits: boolean;
  /** The first suitable scenario carries the screen's one filled CTA. */
  featured: boolean;
  onPick: () => void;
  disabled: boolean;
  describedBy?: string;
}) {
  return (
    <li>
      <SolidCard className="flex h-full flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h3 className="text-[17px] font-bold leading-snug tracking-[-0.01em]">{scenario.title_vi}</h3>
            <p className="text-[14px] text-muted">{scenario.summary_vi}</p>
          </div>
          <span aria-hidden="true" className="flex shrink-0 flex-col items-center rounded-2xl bg-primary/10 px-2.5 py-2 ring-1 ring-primary/20 ring-inset">
            <span className="stat-num text-[28px] text-primary">{scenario.goals.length}</span>
            <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">mục tiêu</span>
          </span>
        </div>
        <p className="flex items-center gap-2 text-[13px] text-muted">
          <UserRound aria-hidden className="size-4 shrink-0 text-primary" />
          <span>
            Bạn nói chuyện với: <span className="font-semibold text-text">{scenario.partner_role_vi}</span>
          </span>
        </p>
        <div className="space-y-1.5">
          <p className="eyebrow flex items-center gap-1.5">
            <Target aria-hidden className="size-3.5 text-primary" />
            Mục tiêu
          </p>
          <ul className="space-y-1 text-[15px]">
            {scenario.goals.map((g) => (
              <li key={g.key} className="flex items-start gap-2">
                <span aria-hidden="true" className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-primary" />
                {g.label_vi}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <p className="text-[13px] text-muted">
            Trình độ gợi ý: {levelName(scenario.level_min)} – {levelName(scenario.level_max)}
            {!suits && ' (khác trình độ hiện tại của bạn)'}
          </p>
          <Button variant={featured ? 'accent' : 'ghost'} disabled={disabled} onClick={onPick} aria-label={`Bắt đầu: ${scenario.title_vi}`} aria-describedby={describedBy}>
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
          <h2 className="text-xl font-extrabold tracking-[-0.02em]">{title}</h2>
          <p className="text-[13px] text-muted">{hint}</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((s, i) => (
            <ScenarioCard
              key={s.key}
              scenario={s}
              suits={suits}
              featured={suits && i === 0}
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
        <p id={gateHintId} className="rounded-2xl bg-warn/10 px-4 py-3 text-[15px] ring-1 ring-warn/35 ring-inset">
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
