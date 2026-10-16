import { allowedTargets, GOAL_LABELS, GOALS_BY_LANGUAGE, LEVEL_INFO, type GoalType, type LanguageCode, type LevelCode } from '@linguo/shared';
import { ChoiceList } from '@/features/learning-paths/components/ChoiceList';

interface Props {
  language: LanguageCode;
  currentLevel: string;
  goalType?: GoalType;
  targetLevel?: string;
  onGoal: (goal: GoalType) => void;
  onTarget: (level: LevelCode) => void;
}

export function StepGoal({ language, currentLevel, goalType, targetLevel, onGoal, onTarget }: Props) {
  const targets = goalType ? allowedTargets(language, goalType, currentLevel) : [];
  return (
    <div className="space-y-6">
      <ChoiceList
        name="goal"
        labelledBy="onboarding-title"
        value={goalType}
        onChange={onGoal}
        options={GOALS_BY_LANGUAGE[language].map((g) => ({ value: g, label: GOAL_LABELS[g] }))}
      />
      {goalType && (
        <section className="space-y-3">
          <h2 id="target-heading" className="eyebrow">
            Bậc bạn muốn đạt
          </h2>
          {targets.length === 0 ? (
            <p role="alert" className="text-[15px] text-muted">
              Bạn đã đạt mục tiêu này. Hãy chọn một mục tiêu cao hơn.
            </p>
          ) : (
            <ChoiceList
              name="target-level"
              labelledBy="target-heading"
              value={targetLevel as LevelCode | undefined}
              onChange={onTarget}
              options={targets.map((code) => ({ value: code, label: LEVEL_INFO[code].label, description: LEVEL_INFO[code].description }))}
            />
          )}
        </section>
      )}
    </div>
  );
}
