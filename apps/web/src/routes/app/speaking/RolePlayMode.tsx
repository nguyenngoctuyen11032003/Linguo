import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { SolidCard } from '@/components/ui/SolidCard';
import { ROLE_PLAYS } from '@/features/speaking/content';
import type { Ratings, SpeakingLanguage } from '@/features/speaking/ratings';
import type { TtsApi } from '@/features/speaking/useTts';
import { cn } from '@/lib/cn';
import { SelectField } from './controls';
import { ListenButton } from './ListenButton';
import { PracticePanel } from './PracticePanel';

interface Props {
  lang: SpeakingLanguage;
  tts: TtsApi;
  transcribe: boolean;
  onSaveReflection: (ratings: Ratings) => void;
}

/**
 * "Hội thoại mẫu": a fixed script where the partner's lines are given and the learner says their own. No AI involved;
 * deliberately not called "Đóng vai", which is the separate AI conversation feature at /app/dong-vai.
 */
export function RolePlayMode({ lang, tts, transcribe, onSaveReflection }: Props) {
  const scripts = ROLE_PLAYS[lang];
  const [scriptId, setScriptId] = useState(scripts[0]?.id ?? '');
  const [step, setStep] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const script = scripts.find((s) => s.id === scriptId) ?? scripts[0];
  if (!script) return null;

  const done = step >= script.turns.length;
  const turn = script.turns[step];

  const change = (id: string) => {
    tts.stop();
    setScriptId(id);
    setStep(0);
  };
  const next = () => {
    tts.stop();
    // The button that was just pressed is about to disappear: keep keyboard focus on the screen's heading.
    if (step + 1 >= script.turns.length) headingRef.current?.focus();
    setStep((s) => s + 1);
  };

  return (
    <SolidCard className="space-y-5 max-[379px]:p-4">
      <h2 ref={headingRef} tabIndex={-1} className="text-xl font-extrabold tracking-[-0.02em] focus:outline-none">
        Hội thoại mẫu
      </h2>
      <SelectField label="Tình huống" value={script.id} onChange={change}>
        {scripts.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title}
          </option>
        ))}
      </SelectField>
      <p className="text-[15px] text-muted">{script.setting} Lời của đối phương có sẵn, bạn nói phần của mình.</p>

      {step > 0 && (
        <ol aria-label="Đoạn hội thoại đến lúc này" className="space-y-2">
          {script.turns.slice(0, Math.min(step, script.turns.length)).map((t, i) => (
            <li
              key={i}
              className={cn(
                'w-fit max-w-[86%] rounded-[1.5rem] px-4 py-2.5 text-[15px]',
                t.speaker === 'you' ? 'ml-auto rounded-tr-md bg-primary/12 ring-1 ring-primary/20 ring-inset' : 'rounded-tl-md border border-border bg-surface-solid shadow-[var(--shadow-card)]',
              )}
            >
              <span className="block text-xs font-semibold text-muted">{t.speaker === 'you' ? 'Bạn' : 'Đối phương'}</span>
              <span lang={lang} className="[overflow-wrap:anywhere]">
                {t.text}
              </span>
            </li>
          ))}
        </ol>
      )}

      {done ? (
        <div className="space-y-3 rounded-2xl bg-primary/8 p-4">
          <p className="font-semibold">Bạn đã đi hết đoạn hội thoại rồi, làm tốt lắm!</p>
          <p className="text-sm text-muted">Thử lại một lần nữa, lần sau thường tự nhiên hơn.</p>
          <Button
            variant="ghost"
            onClick={() => {
              setStep(0);
              headingRef.current?.focus();
            }}
          >
            Luyện lại từ đầu
          </Button>
        </div>
      ) : turn ? (
        <div className="space-y-4">
          <p className="text-sm text-muted" aria-live="polite">
            Lượt {step + 1}/{script.turns.length}: {turn.speaker === 'you' ? 'đến lượt bạn' : 'đối phương nói'}
          </p>
          <div className="space-y-2 rounded-2xl bg-primary/8 p-4">
            <p lang={lang} className="text-2xl font-bold leading-snug tracking-[-0.02em] [overflow-wrap:anywhere]">
              {turn.text}
            </p>
            <p className="text-[15px] text-muted">{turn.translation}</p>
          </div>
          <ListenButton text={turn.text} lang={lang} tts={tts} label={turn.speaker === 'you' ? 'Nghe mẫu' : 'Nghe đối phương'} />
          {turn.speaker === 'you' && (
            <PracticePanel
              key={`${script.id}:${step}`}
              lang={lang}
              target={turn.text}
              transcribe={transcribe}
              tts={tts}
              onSaveReflection={onSaveReflection}
            />
          )}
          <Button onClick={next}>{turn.speaker === 'you' ? 'Xong lượt của tôi' : 'Tiếp tục'}</Button>
        </div>
      ) : null}
    </SolidCard>
  );
}
