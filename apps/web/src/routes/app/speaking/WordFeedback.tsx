import { useId } from 'react';
import { Check, CircleDashed, Ear, EqualApproximately, Square, Volume2, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { practiceTargets, type Alignment, type MarkKind, type TargetMark } from '@/features/speaking/align';
import type { SpeakingLanguage } from '@/features/speaking/ratings';
import type { TtsApi } from '@/features/speaking/useTts';
import { cn } from '@/lib/cn';

/** Each state has its own icon, underline style and words, so colour is never the only cue. */
const KIND: Record<MarkKind, { icon: LucideIcon; label: string; word: string; tone: string }> = {
  match: { icon: Check, label: 'nghe khớp', word: '', tone: 'text-success-text' },
  near: { icon: EqualApproximately, label: 'gần đúng', word: 'underline decoration-dotted decoration-2 underline-offset-4', tone: 'text-gold' },
  misheard: { icon: Ear, label: 'nghe thành từ khác', word: 'underline decoration-wavy underline-offset-4', tone: 'text-accent-text' },
  missed: { icon: CircleDashed, label: 'chưa thấy', word: 'text-muted underline decoration-dashed underline-offset-4', tone: 'text-muted' },
};

const LEGEND: MarkKind[] = ['match', 'near', 'misheard', 'missed'];

function caption(mark: TargetMark): string | null {
  if (mark.kind === 'near') return 'gần đúng';
  if (mark.kind === 'misheard') return 'nghe thành';
  if (mark.kind === 'missed') return 'chưa thấy';
  return null;
}

function joinHeard(list: string[], alignment: Alignment): string {
  return list.join(alignment.unit === 'char' ? '' : ', ');
}

/** Screen-reader summary of the marks, grouped by state, in sentence order. Words only, never counts or a score. */
function summarize(alignment: Alignment): string {
  const of = (kind: MarkKind) => alignment.target.filter((m) => m.kind === kind);
  const parts: string[] = [];
  const near = of('near');
  const misheard = of('misheard');
  const missed = of('missed');
  if (near.length + misheard.length + missed.length === 0) parts.push('Mọi từ trong câu mẫu đều có trong bản chép.');
  if (near.length) parts.push(`Gần đúng: ${near.map((m) => `${m.text} (nghe là ${m.heard})`).join(', ')}.`);
  if (misheard.length) parts.push(`Nghe thành từ khác: ${misheard.map((m) => `${m.text} (nghe là ${m.heard})`).join(', ')}.`);
  if (missed.length) parts.push(`Chưa thấy trong bản chép: ${missed.map((m) => m.text).join(', ')}.`);
  return parts.join(' ');
}

export interface WordFeedbackProps {
  lang: SpeakingLanguage;
  alignment: Alignment;
  /** The sample voice; without one (or without a voice for the language) the tips have no listen button. */
  tts?: TtsApi;
}

/**
 * The target sentence word by word, each marked heard / near / heard as something else / not heard, plus a few
 * words worth listening to again. The transcript can be wrong, so this is a hint, never a score.
 */
export function WordFeedback({ lang, alignment, tts }: WordFeedbackProps) {
  const titleId = useId();
  const tipsId = useId();
  const targets = practiceTargets(alignment);
  const char = alignment.unit === 'char';

  return (
    <div className="mt-3 space-y-3" data-testid="word-feedback">
      <p id={titleId} className="font-semibold">
        Từng từ trong câu mẫu
      </p>
      <p className="sr-only">{summarize(alignment)}</p>
      <ul
        aria-labelledby={titleId}
        className={cn('flex min-w-0 flex-wrap items-start gap-y-2', char ? 'gap-x-1' : 'gap-x-3')}
      >
        {alignment.target.map((mark, k) => {
          const kind = KIND[mark.kind];
          const Icon = kind.icon;
          const text = caption(mark);
          return (
            <li key={k} data-mark={mark.kind} className="flex min-w-0 flex-col items-start">
              <span className="inline-flex min-w-0 items-center gap-1">
                <Icon aria-hidden className={cn('size-3.5 shrink-0', kind.tone)} />
                <span lang={lang} className={cn('text-base font-medium [overflow-wrap:anywhere]', kind.word)}>
                  {mark.text}
                </span>
              </span>
              {text ? (
                <span className="text-xs text-muted [overflow-wrap:anywhere]">
                  <span className="sr-only">, </span>
                  {text}
                  {mark.heard && (
                    <>
                      {' '}
                      “<span lang={lang}>{mark.heard}</span>”
                    </>
                  )}
                </span>
              ) : (
                <span className="sr-only">, {kind.label}</span>
              )}
            </li>
          );
        })}
      </ul>
      {alignment.extra.length > 0 && (
        <p className="text-muted">
          Máy còn nghe thêm: <span lang={lang}>{joinHeard(alignment.extra, alignment)}</span>
        </p>
      )}
      <ul aria-label="Chú thích" className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        {LEGEND.map((k) => {
          const Icon = KIND[k].icon;
          return (
            <li key={k} className="inline-flex items-center gap-1">
              <Icon aria-hidden className={cn('size-3.5 shrink-0', KIND[k].tone)} />
              {KIND[k].label}
            </li>
          );
        })}
      </ul>

      {targets.length > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          <p id={tipsId} className="font-semibold">
            Gợi ý luyện lại
          </p>
          <ul aria-labelledby={tipsId} className="space-y-2">
            {targets.map((word) => {
              const playing = tts?.speakingText === word;
              return (
                <li key={word} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    Nghe mẫu rồi nói lại chậm {char ? 'cụm' : 'từ'}:{' '}
                    <span lang={lang} className="font-semibold">
                      {word}
                    </span>
                  </span>
                  {tts?.available &&
                    (playing ? (
                      <Button variant="ghost" onClick={tts.stop} aria-label={`Dừng đọc: ${word}`}>
                        <Square aria-hidden className="size-4" />
                        Dừng đọc
                      </Button>
                    ) : (
                      <Button variant="ghost" onClick={() => tts.play(word)} aria-label={`Nghe mẫu: ${word}`}>
                        <Volume2 aria-hidden className="size-4" />
                        Nghe mẫu
                      </Button>
                    ))}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
