import { useId, useState } from 'react';
import { Eye, EyeOff, Flag, Loader2, Volume2, VolumeX } from 'lucide-react';
import { EXAM_ESSAY_MAX_CHARS, EXAM_SHORT_TEXT_MAX_CHARS, type ExamServedQuestion } from '@linguo/shared';
import { AnswerInput } from '@/components/exercise/AnswerInput';
import { ChoiceGroup } from '@/components/exercise/ChoiceGroup';
import { cn } from '@/lib/cn';
import { SECTION_LABELS, charCount } from './labels';

export interface QuestionViewProps {
  question: ExamServedQuestion;
  /** Target language of the attempt: `lang` of the learner's typed answer. */
  language: 'en' | 'ko' | 'ja' | 'de';
  /** Plays allowed per listening question (2 in a full mock); null = unlimited. */
  listenLimit: number | null;
  /** New answer; a blank text answer is reported as null. */
  onAnswer(a: string | null): void;
  onToggleFlag(): void;
  /**
   * Plays the listening prompt: `audioAssetId` when there is a recording, otherwise `text` with TTS.
   * Calls `onStarted` as soon as playback has really begun (that is when a play is counted), then resolves `true`
   * when it ends or `false` when it could not play at all (network error, autoplay block): a failure costs no play.
   * Omit to disable playback.
   */
  onListen?(text: string | null, audioAssetId: string | null, onStarted: () => void): Promise<boolean | void>;
  /** A TTS voice exists for `language`. Without one, a TTS-only prompt offers "Hiện lời thoại" instead. */
  canListen?: boolean;
}

/**
 * One exam question. Keep it mounted across questions (do not key it by question): per-question listening
 * counts live here and must survive navigating away and back. Text fields reset per question on their own.
 */
export function QuestionView({ question, language, listenLimit, onAnswer, onToggleFlag, onListen, canListen = false }: QuestionViewProps) {
  const stemId = useId();
  const [plays, setPlays] = useState<Record<string, number>>({});
  const { prompt } = question;
  const isListening = question.section === 'listening' && (prompt.audio_asset_id !== null || prompt.tts_text !== undefined);

  return (
    <article aria-labelledby={stemId} className="mx-auto w-full min-w-0 max-w-prose space-y-4">
      <header className="flex items-start justify-between gap-3">
        <p className="pt-2 text-sm font-semibold text-muted">
          Câu {question.seq} · {SECTION_LABELS[question.section]} · {question.points} điểm
        </p>
        <button
          type="button"
          aria-pressed={question.flagged}
          aria-label="Đánh dấu xem lại"
          onClick={onToggleFlag}
          className={cn(
            'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors',
            'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40',
            question.flagged ? 'border-warn bg-warn/15 text-text' : 'border-border text-muted hover:bg-text/5',
          )}
        >
          <Flag aria-hidden className={cn('size-4', question.flagged && 'fill-current text-gold')} />
          <span>
            Đánh dấu<span className="max-[379px]:hidden"> xem lại</span>
          </span>
        </button>
      </header>

      <p className="text-[15px] font-medium text-muted">{prompt.instruction_vi}</p>

      {isListening && (
        <ListenControls
          // Distinct from the AnswerField key below: two siblings sharing a key left a stale listen box on later questions.
          key={`listen-${question.question_id}`}
          question={question}
          language={language}
          listenLimit={listenLimit}
          used={plays[question.question_id] ?? 0}
          onPlayed={() => setPlays((p) => ({ ...p, [question.question_id]: (p[question.question_id] ?? 0) + 1 }))}
          onListen={onListen}
          canListen={canListen}
        />
      )}

      {prompt.passage && (
        <div
          lang={prompt.stem_lang}
          className="rounded-2xl border border-border bg-surface-solid px-4 py-3 text-[17px] leading-relaxed whitespace-pre-line break-words"
        >
          {prompt.passage}
        </div>
      )}

      <p
        id={stemId}
        lang={prompt.stem_lang}
        className={cn(
          'break-words whitespace-pre-line',
          // A long task card (writing prompts) reads as body text; a short question stays a bold headline.
          prompt.stem.length > 140 ? 'text-[16px] font-medium leading-relaxed' : 'text-[18px] font-semibold leading-snug',
        )}
      >
        {prompt.stem}
      </p>

      <AnswerField key={question.question_id} question={question} language={language} stemId={stemId} onAnswer={onAnswer} />
    </article>
  );
}

function AnswerField({
  question,
  language,
  stemId,
  onAnswer,
}: {
  question: ExamServedQuestion;
  language: 'en' | 'ko' | 'ja' | 'de';
  stemId: string;
  onAnswer(a: string | null): void;
}) {
  if (question.kind === 'mcq') {
    return (
      <ChoiceGroup labelledBy={stemId} options={question.prompt.options ?? []} selectedId={question.answer} onSelect={(id) => onAnswer(id)} />
    );
  }
  if (question.kind === 'short_text') return <ShortTextField question={question} language={language} onAnswer={onAnswer} />;
  return <EssayField question={question} language={language} onAnswer={onAnswer} />;
}

const toAnswer = (value: string) => (value.trim() === '' ? null : value);

function ShortTextField({ question, language, onAnswer }: { question: ExamServedQuestion; language: 'en' | 'ko' | 'ja' | 'de'; onAnswer(a: string | null): void }) {
  const inputId = useId();
  const [value, setValue] = useState(question.answer ?? '');
  return (
    <div>
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold">
        Câu trả lời của bạn
      </label>
      <AnswerInput
        id={inputId}
        lang={language}
        value={value}
        maxLength={EXAM_SHORT_TEXT_MAX_CHARS}
        onValueChange={(next) => {
          setValue(next);
          onAnswer(toAnswer(next));
        }}
      />
    </div>
  );
}

type Band = 'below' | 'in' | 'above' | 'none';

function EssayField({ question, language, onAnswer }: { question: ExamServedQuestion; language: 'en' | 'ko' | 'ja' | 'de'; onAnswer(a: string | null): void }) {
  const areaId = useId();
  const guideId = useId();
  const [value, setValue] = useState(question.answer ?? '');
  const { min_chars: min, max_chars: max } = question.prompt;
  const count = charCount(value);
  const band: Band = min === undefined && max === undefined ? 'none' : min !== undefined && count < min ? 'below' : max !== undefined && count > max ? 'above' : 'in';
  const guide =
    min !== undefined && max !== undefined
      ? `Gợi ý độ dài: ${min}–${max} ký tự.`
      : min !== undefined
        ? `Gợi ý độ dài: từ ${min} ký tự.`
        : max !== undefined
          ? `Gợi ý độ dài: tối đa ${max} ký tự.`
          : null;
  const hint =
    band === 'below' ? `Viết thêm khoảng ${min! - count} ký tự` : band === 'above' ? `Dài hơn gợi ý ${count - max!} ký tự — vẫn nộp được` : band === 'in' ? 'Độ dài phù hợp' : null;
  // Announced only when the band changes, never per keystroke.
  const live = band === 'in' ? 'Đã đủ độ dài gợi ý' : band === 'above' ? 'Đã vượt độ dài gợi ý' : '';

  return (
    <div>
      <label htmlFor={areaId} className="mb-1.5 block text-sm font-semibold">
        Bài viết của bạn
      </label>
      {guide && (
        <p id={guideId} className="mb-1.5 text-sm text-muted">
          {guide} Đây chỉ là gợi ý, không chặn khi nộp.
        </p>
      )}
      <textarea
        id={areaId}
        lang={language}
        value={value}
        rows={8}
        maxLength={EXAM_ESSAY_MAX_CHARS}
        aria-describedby={guide ? guideId : undefined}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        onChange={(e) => {
          setValue(e.target.value);
          onAnswer(toAnswer(e.target.value));
        }}
        className="block w-full min-w-0 resize-y rounded-2xl border border-input-border bg-surface-solid px-4 py-3 text-[17px] leading-relaxed text-text focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/45"
      />
      <p className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 text-sm">
        <span className="font-semibold tabular-nums">{count} ký tự</span>
        {hint && <span className={cn(band === 'in' ? 'text-success-text' : 'text-muted')}>{hint}</span>}
      </p>
      <span role="status" aria-live="polite" className="sr-only">
        {live}
      </span>
    </div>
  );
}

function ListenControls({
  question,
  language,
  listenLimit,
  used,
  onPlayed,
  onListen,
  canListen,
}: {
  question: ExamServedQuestion;
  language: 'en' | 'ko' | 'ja' | 'de';
  listenLimit: number | null;
  used: number;
  onPlayed(): void;
  onListen?: QuestionViewProps['onListen'];
  canListen: boolean;
}) {
  const remainingId = useId();
  const scriptId = useId();
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const { audio_asset_id: assetId, tts_text: ttsText } = question.prompt;
  const playable = onListen !== undefined && (assetId !== null || (canListen && ttsText !== undefined));
  const remaining = listenLimit === null ? null : Math.max(0, listenLimit - used);
  const exhausted = remaining === 0;

  const play = async () => {
    if (!onListen || playing || exhausted) return;
    // A play is counted once, only after playback really began (or a read-aloud finished); a failure is free.
    let counted = false;
    const markPlayed = () => {
      if (counted) return;
      counted = true;
      onPlayed();
    };
    setFailed(false);
    setPlaying(true);
    try {
      const ok = await onListen(ttsText ?? null, assetId, markPlayed);
      if (ok !== false) markPlayed();
      else if (!counted) setFailed(true);
    } catch {
      if (!counted) setFailed(true);
    } finally {
      setPlaying(false);
    }
  };

  if (!playable) {
    return (
      <div className="rounded-2xl border border-border bg-surface-solid px-4 py-3">
        <p className="flex items-start gap-2 text-sm text-muted">
          <VolumeX aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0">Thiết bị chưa phát được âm thanh cho câu này — chuyển sang đọc thay nghe.</span>
        </p>
        {ttsText !== undefined && (
          <>
            <button
              type="button"
              aria-expanded={showScript}
              aria-controls={scriptId}
              onClick={() => setShowScript((v) => !v)}
              className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold hover:bg-text/5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
            >
              {showScript ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
              Hiện lời thoại
            </button>
            <div id={scriptId} hidden={!showScript}>
              {showScript && (
                <p lang={language} className="mt-2 text-[17px] leading-relaxed whitespace-pre-line break-words">
                  {ttsText}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => void play()}
        disabled={playing || exhausted}
        aria-describedby={remainingId}
        className={cn(
          'inline-flex min-h-12 items-center gap-2 rounded-full px-5 text-[15px] font-semibold',
          'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40 disabled:cursor-not-allowed',
          exhausted ? 'border border-border text-muted' : 'bg-primary text-on-primary not-disabled:hover:bg-primary-strong disabled:opacity-80',
        )}
      >
        {playing ? <Loader2 aria-hidden className="size-5 motion-safe:animate-spin" /> : <Volume2 aria-hidden className="size-5" />}
        {playing ? 'Đang phát…' : 'Nghe'}
      </button>
      <span id={remainingId} className="text-sm text-muted">
        {remaining === null ? 'Nghe không giới hạn' : exhausted ? 'Đã hết lượt nghe' : `Còn ${remaining} lượt nghe`}
      </span>
      <p role="status" aria-live="polite" className={failed ? 'w-full text-sm font-medium text-error-text' : 'sr-only'}>
        {failed ? 'Không phát được, thử lại. Lượt nghe của bạn chưa bị trừ.' : ''}
      </p>
    </div>
  );
}
