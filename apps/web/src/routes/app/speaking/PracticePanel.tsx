import { useEffect, useId, useState } from 'react';
import { Check, Mic, Square, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { alignToTarget } from '@/features/speaking/align';
import { compareToTarget } from '@/features/speaking/overlap';
import { RATING_AXES, RATING_LABELS, type Ratings, type RatingValue, type SpeakingLanguage } from '@/features/speaking/ratings';
import { useRecorder, type RecorderError } from '@/features/speaking/useRecorder';
import { useSpeechRecognition } from '@/features/speaking/useSpeechRecognition';
import type { TtsApi } from '@/features/speaking/useTts';
import { cn } from '@/lib/cn';
import { FOCUS_RING } from './controls';
import { WordFeedback } from './WordFeedback';

const RECORDER_MESSAGES: Record<RecorderError, string> = {
  unsupported: 'Trình duyệt này chưa hỗ trợ ghi âm. Bạn vẫn luyện bình thường theo cách bên dưới.',
  denied:
    'Linguo chưa được dùng micro. Bạn có thể cho phép micro trong cài đặt trình duyệt rồi thử lại, hoặc cứ luyện không cần ghi âm.',
  no_device: 'Không tìm thấy micro trên thiết bị này. Bạn vẫn có thể nghe, đọc to theo script và tự đánh giá.',
  failed: 'Lần này chưa ghi âm được. Bạn có thể thử lại hoặc luyện không cần ghi âm.',
};

const OVERLAP_TEXT = {
  close: 'Bản chép khá khớp với câu mẫu. Dù vậy máy chép có thể sai, hãy tin tai của bạn hơn.',
  partial: 'Bản chép có vài từ khác câu mẫu. Có thể bạn nói khác đi một chút, hoặc máy nghe chưa đúng.',
  far: 'Bản chép khác câu mẫu khá nhiều. Có thể máy nghe chưa đúng, hãy nghe lại giọng bạn và so với câu mẫu.',
} as const;

const MISSING_SHOWN = 8;

export interface PracticePanelProps {
  lang: SpeakingLanguage;
  /** Sentence to compare the transcript with; null for free answers. */
  target: string | null;
  /** The learner switched on the optional automatic transcript. */
  transcribe: boolean;
  /** Sample voice, used to replay single words the transcript did not have. */
  tts?: TtsApi;
  onSaveReflection: (ratings: Ratings) => void;
}

function RatingGroup({
  axis,
  value,
  onChange,
}: {
  axis: (typeof RATING_AXES)[number];
  value: RatingValue | undefined;
  onChange: (v: RatingValue) => void;
}) {
  const hintId = useId();
  return (
    <fieldset aria-describedby={hintId} className="min-w-0 space-y-1.5">
      <legend className="text-[15px] font-semibold">{axis.label}</legend>
      <p id={hintId} className="text-sm text-muted">
        {axis.hint}
      </p>
      <div className="grid grid-cols-3 gap-1.5 min-[380px]:gap-2">
        {([1, 2, 3] as const).map((n) => (
          <label
            key={n}
            className={cn(
              'flex min-h-12 min-w-0 cursor-pointer items-center justify-center rounded-[1.25rem] border-2 px-2 py-1.5 text-center text-[13px] leading-tight font-bold text-balance transition-[translate,box-shadow,background-color] active:translate-y-[2px] max-[379px]:px-1 min-[380px]:text-[15px]',
              'has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary/40',
              value === n ? 'border-primary bg-primary/12 text-primary shadow-[0_3px_0_var(--primary-depth)] active:shadow-[0_1px_0_var(--primary-depth)]' : 'border-border bg-surface-solid shadow-[0_3px_0_var(--border)] hover:bg-text/5 active:shadow-[0_1px_0_var(--border)]',
            )}
          >
            <input
              type="radio"
              name={`${axis.id}-${hintId}`}
              checked={value === n}
              onChange={() => onChange(n)}
              className="sr-only"
            />
            {RATING_LABELS[n]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Record yourself, listen back, and rate it on separate axes (spec 6.9). Audio never leaves this component's memory.
 * Without a usable microphone it turns into "Nghe và tự luyện": the same self-rating, no recording.
 */
export function PracticePanel({ lang, target, transcribe, tts, onSaveReflection }: PracticePanelProps) {
  const recorder = useRecorder();
  const stt = useSpeechRecognition(lang);
  const [ratings, setRatings] = useState<Ratings>({});
  const [saved, setSaved] = useState(false);
  const transcriptId = useId();
  const transcriptHelpId = useId();
  const saveHintId = useId();
  const { status, error } = recorder;
  const selfPractice = !recorder.supported || status === 'error';
  const useTranscript = transcribe && stt.supported;
  const { start: startStt, stop: stopStt } = stt;

  useEffect(() => {
    if (status === 'recording' && useTranscript) startStt();
    if (status !== 'recording') stopStt();
  }, [status, useTranscript, startStt, stopStt]);

  function startRecording() {
    setRatings({});
    setSaved(false);
    stt.reset();
    void recorder.start();
  }

  function discard() {
    recorder.discard();
    stt.reset();
    setRatings({});
    setSaved(false);
  }

  const announce =
    status === 'requesting'
      ? 'Đang xin quyền dùng micro.'
      : status === 'recording'
        ? 'Đang ghi âm.'
        : status === 'recorded'
          ? 'Đã ghi xong. Bạn có thể nghe lại giọng của mình.'
          : status === 'error' && error
            ? RECORDER_MESSAGES[error]
            : '';

  const showRatings = selfPractice || status === 'recorded';
  const rated = Object.keys(ratings).length > 0;
  const hint = target && status === 'recorded' && useTranscript ? compareToTarget(target, stt.transcript) : null;
  const alignment = hint && target ? alignToTarget(target, stt.transcript) : null;

  return (
    <div className="space-y-5">
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>

      {!selfPractice && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            {status === 'recording' ? (
              <Button variant="accent" size="lg" onClick={recorder.stop}>
                <Square aria-hidden className="size-5" />
                Dừng ghi âm
              </Button>
            ) : (
              <Button size="lg" onClick={startRecording} loading={status === 'requesting'}>
                <Mic aria-hidden className="size-5" />
                {status === 'recorded' ? 'Ghi âm lại' : 'Bắt đầu ghi âm'}
              </Button>
            )}
            {status === 'recording' && (
              <span className="inline-flex items-center gap-2 text-[15px] font-semibold tabular-nums text-error-text">
                <span aria-hidden="true" className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full rounded-full bg-error opacity-70 motion-safe:animate-ping" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-error" />
                </span>
                Đang ghi: {recorder.seconds} giây
              </span>
            )}
          </div>
          {status === 'idle' && <p className="text-sm text-muted">Nhấn nút, cho phép micro và nói thật tự nhiên. Không cần hoàn hảo.</p>}
          {status === 'requesting' && <p className="text-sm text-muted">Đang chờ bạn cho phép dùng micro…</p>}
        </div>
      )}

      {status === 'recorded' && recorder.audioUrl && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Nghe lại giọng của bạn</p>
          {/* A recording is a few seconds of speech with no captions to offer: the script above is its text. */}
          <audio controls src={recorder.audioUrl} className="w-full max-w-full" aria-label="Bản ghi giọng của bạn">
            <track kind="captions" />
          </audio>
          <Button variant="ghost" onClick={discard}>
            <Trash2 aria-hidden className="size-4" />
            Xoá bản ghi
          </Button>
        </div>
      )}

      {useTranscript && (status === 'recorded' || stt.transcript.length > 0) && (
        <div className="space-y-2">
          <label htmlFor={transcriptId} className="block text-sm font-semibold">
            Bản chép lời có thể sai
          </label>
          <p id={transcriptHelpId} className="text-sm text-muted">
            Máy tự chép những gì nghe được. Bạn hãy sửa lại cho đúng với điều mình đã nói.
          </p>
          <textarea
            id={transcriptId}
            aria-describedby={transcriptHelpId}
            lang={lang}
            rows={3}
            value={stt.transcript}
            onChange={(e) => stt.setTranscript(e.target.value)}
            className={cn('block w-full rounded-2xl border border-input-border bg-surface-solid p-3 text-base text-text', FOCUS_RING)}
          />
          {hint && (
            <div className="rounded-2xl bg-primary/8 p-3.5 text-sm ring-1 ring-primary/20 ring-inset" data-testid="overlap-hint">
              <p>{OVERLAP_TEXT[hint.level]}</p>
              {hint.missing.length > 0 && hint.level !== 'close' && (
                <p className="mt-1 text-muted">
                  Từ trong câu mẫu chưa thấy trong bản chép:{' '}
                  <span lang={lang}>{hint.missing.slice(0, MISSING_SHOWN).join(', ')}</span>
                </p>
              )}
              {alignment && <WordFeedback lang={lang} alignment={alignment} tts={tts} />}
              <p className="mt-3 text-muted">Đây chỉ là gợi ý so từ, không phải điểm số.</p>
            </div>
          )}
        </div>
      )}

      {selfPractice && (
        <section aria-labelledby={`${transcriptId}-self`} className="space-y-3 rounded-2xl bg-text/[0.03] p-4 ring-1 ring-border ring-inset">
          <h3 id={`${transcriptId}-self`} className="text-lg font-bold tracking-[-0.02em]">
            Nghe và tự luyện
          </h3>
          {error && <p className="text-sm text-muted">{RECORDER_MESSAGES[error]}</p>}
          {!error && !recorder.supported && <p className="text-sm text-muted">{RECORDER_MESSAGES.unsupported}</p>}
          <ol className="list-decimal space-y-1 pl-5 text-[15px]">
            <li>Nghe câu mẫu một hai lần.</li>
            <li>Nhìn script và đọc to theo, chậm trước rồi nhanh dần.</li>
            <li>Tự đánh giá bên dưới để biết lần sau cần chú ý gì.</li>
          </ol>
          {error && error !== 'unsupported' && (
            <Button variant="ghost" onClick={startRecording}>
              <Mic aria-hidden className="size-4" />
              Thử ghi âm lại
            </Button>
          )}
        </section>
      )}

      {showRatings && (
        <section className="space-y-4" aria-label="Tự đánh giá">
          <div className="space-y-1">
            <h3 className="text-lg font-bold tracking-[-0.02em]">Tự đánh giá</h3>
            <p className="text-sm text-muted">
              Chọn theo cảm nhận của bạn cho từng mục. Một lần luyện chưa nói lên trình độ của bạn, nên Linguo không chấm điểm.
            </p>
          </div>
          {RATING_AXES.map((axis) => (
            <RatingGroup
              key={axis.id}
              axis={axis}
              value={ratings[axis.id]}
              onChange={(v) => {
                setRatings((r) => ({ ...r, [axis.id]: v }));
                setSaved(false);
              }}
            />
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="ghost"
              disabled={!rated || saved}
              aria-describedby={rated ? undefined : saveHintId}
              aria-label={saved ? undefined : 'Lưu tự đánh giá trên thiết bị này'}
              onClick={() => {
                onSaveReflection(ratings);
                setSaved(true);
              }}
            >
              {saved ? (
                <>
                  <Check aria-hidden className="size-4" />
                  Đã lưu
                </>
              ) : (
                <>
                  Lưu tự đánh giá<span className="max-[379px]:hidden"> trên thiết bị này</span>
                </>
              )}
            </Button>
            {!rated && (
              <p id={saveHintId} className="text-sm text-muted">
                Chọn ít nhất một mức tự đánh giá để lưu
              </p>
            )}
            <p role="status" className="text-sm text-muted">
              {saved ? 'Đã lưu trên thiết bị này. Bạn chưa mất gì, cứ luyện tiếp nhé!' : ''}
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
