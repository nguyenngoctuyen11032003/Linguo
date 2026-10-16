import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import {
  PROMPT_SCHEMAS,
  type AnswerLang,
  type ExerciseResponse,
  type ExerciseStage,
  type FillBlankPrompt,
  type ListenPrompt,
  type McqPrompt,
  type PublicExercise,
  type TranslatePrompt,
  type Verdict,
  type WordBankPrompt,
} from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { playSound, playVerdict } from '@/lib/sound';
import type { Confidence, ExerciseUiState, SubmitMeta } from '@/features/lesson-player/types';
import { exercisePromptText, responseText, type LessonAiContext } from './ai-context';
import { CompositionGateContext, createCompositionGate } from './compositionGate';
import { PendingSyncBadge } from './Badges';
import { ConfidenceChips } from './ConfidenceChips';
import { FeedbackPanel } from './FeedbackPanel';
import { FillBlankExercise } from './FillBlankExercise';
import { HintReveal } from './HintReveal';
import { ListenExercise } from './ListenExercise';
import { McqExercise } from './McqExercise';
import { TranslateExercise } from './TranslateExercise';
import { WordBankExercise } from './WordBankExercise';

export interface ExerciseFrameProps {
  exercise: PublicExercise;
  state: ExerciseUiState;
  recheck: boolean;
  /** Run the exercise belongs to; seeds the word_bank order so it differs per run but survives reloads. */
  runId?: string | null;
  onSubmit: (response: ExerciseResponse, meta: SubmitMeta) => void;
  /** Shown when `state.lastResult?.final` (and while an attempt waits for sync). */
  onContinue: () => void;
  /** Lesson facts for the AI tutor buttons under the feedback; omit to hide them. */
  ai?: LessonAiContext;
  /** Shows "Báo lỗi nội dung" for this exercise under the feedback (learner screens only, not admin previews). */
  reportable?: boolean;
  /** The action bar spans the page gutter (lesson player); off inside a padded card such as the admin preview. */
  bleed?: boolean;
}

type Parsed =
  | { type: 'mcq'; prompt: McqPrompt }
  | { type: 'listen'; prompt: ListenPrompt }
  | { type: 'fill_blank'; prompt: FillBlankPrompt }
  | { type: 'word_bank'; prompt: WordBankPrompt }
  | { type: 'translate'; prompt: TranslatePrompt };

function parsePrompt(exercise: PublicExercise): Parsed | null {
  switch (exercise.type) {
    case 'mcq': {
      const r = PROMPT_SCHEMAS.mcq.safeParse(exercise.prompt);
      return r.success ? { type: 'mcq', prompt: r.data } : null;
    }
    case 'listen': {
      const r = PROMPT_SCHEMAS.listen.safeParse(exercise.prompt);
      return r.success ? { type: 'listen', prompt: r.data } : null;
    }
    case 'fill_blank': {
      const r = PROMPT_SCHEMAS.fill_blank.safeParse(exercise.prompt);
      return r.success ? { type: 'fill_blank', prompt: r.data } : null;
    }
    case 'word_bank': {
      const r = PROMPT_SCHEMAS.word_bank.safeParse(exercise.prompt);
      return r.success ? { type: 'word_bank', prompt: r.data } : null;
    }
    case 'translate': {
      const r = PROMPT_SCHEMAS.translate.safeParse(exercise.prompt);
      return r.success ? { type: 'translate', prompt: r.data } : null;
    }
  }
}

const LANG_NAMES: Record<AnswerLang, string> = { en: 'tiếng Anh', ko: 'tiếng Hàn', ja: 'tiếng Nhật', vi: 'tiếng Việt' };
const STAGE_LABELS: Record<ExerciseStage, string> = { recognition: 'Nhận biết', recall: 'Nhớ lại', application: 'Vận dụng' };

function instructionFor(parsed: Parsed, answerLang: AnswerLang): string {
  switch (parsed.type) {
    case 'mcq':
      return 'Chọn đáp án đúng';
    case 'listen':
      return 'Bài nghe';
    case 'fill_blank':
      return 'Điền vào chỗ trống';
    case 'word_bank':
      return 'Sắp xếp từ';
    case 'translate':
      return `Dịch sang ${LANG_NAMES[answerLang]}`;
  }
}

function isAnswerEmpty(parsed: Parsed, response: ExerciseResponse | null): boolean {
  if (!response) return true;
  switch (parsed.type) {
    case 'mcq':
    case 'listen':
      return !('option_id' in response);
    case 'fill_blank':
      return !('blanks' in response) || parsed.prompt.blanks.some((b) => !(response.blanks[b.id] ?? '').trim());
    case 'word_bank':
      return !('token_ids' in response) || response.token_ids.length === 0;
    case 'translate':
      return !('text' in response) || !response.text.trim();
  }
}

/** Renders one exercise with its answer controls, feedback and sticky action bar (spec 2 §7.3). */
export function ExerciseFrame(props: ExerciseFrameProps) {
  // Local state (answer, hints, timer) belongs to one exercise entry.
  return <ExerciseFrameInner key={`${props.exercise.id}:${props.exercise.version}:${props.recheck}`} {...props} />;
}

function ExerciseFrameInner({ exercise, state, recheck, runId, onSubmit, onContinue, ai, reportable = false, bleed = false }: ExerciseFrameProps) {
  const titleId = useId();
  const parsed = useMemo(() => parsePrompt(exercise), [exercise]);
  const gate = useMemo(() => createCompositionGate(), []);
  const [response, setResponseState] = useState<ExerciseResponse | null>(null);
  const responseRef = useRef<ExerciseResponse | null>(null);
  const [hintsShown, setHintsShown] = useState(0);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [submittedOptionId, setSubmittedOptionId] = useState<string | null>(null);
  /** The last graded answer for the AI tutor; "Xem đáp án" keeps the answer it follows. */
  const [sentResponse, setSentResponse] = useState<ExerciseResponse | null>(null);
  const [retries, setRetries] = useState(0);
  const startRef = useRef(Date.now());
  /**
   * An answer was handed to onSubmit and the parent has not re-rendered yet: requests queued behind an IME
   * composition run together with closures from before that render, so `busy` alone cannot stop a second send.
   */
  const sentRef = useRef(false);
  const [sends, setSends] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLButtonElement>(null);

  const setResponse = (next: ExerciseResponse | null) => {
    responseRef.current = next;
    setResponseState(next);
  };

  const busyNow = state.status === 'submitting' || state.status === 'pending_sync';
  // Re-render after every send (`sends`); once the parent is not busy (graded, failed, or ignored) allow the next one.
  useEffect(() => {
    if (!busyNow) sentRef.current = false;
  }, [busyNow, sends, state.lastResult]);

  // Sound once per graded attempt, and only for answers sent from this screen (not a result restored on remount).
  const sounded = useRef<string | null>(null);
  const graded = state.status === 'graded' ? state.lastResult : null;
  useEffect(() => {
    if (!graded || sends === 0 || sounded.current === graded.attempt_id) return;
    sounded.current = graded.attempt_id;
    playVerdict(graded.verdict, { revealed: graded.revealed });
  }, [graded, sends]);

  useEffect(() => {
    if (retries === 0) return;
    bodyRef.current?.querySelector<HTMLElement>('input:not([disabled]), [role="radio"]:not([disabled]), button:not([disabled])')?.focus();
  }, [retries]);

  if (!parsed) {
    return (
      <section aria-labelledby={titleId} className="flex min-w-0 flex-1 flex-col gap-4">
        <div role="alert" className="flex items-start gap-3 rounded-3xl border border-error/50 bg-error/10 p-4">
          <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-error-text" />
          <h2 id={titleId} className="text-[17px] font-semibold">
            Bài tập bị lỗi định dạng
          </h2>
        </div>
        <ActionBar bleed={bleed}>
          <Button variant="accent" size="lg" block onClick={onContinue}>
            Tiếp tục
          </Button>
        </ActionBar>
      </section>
    );
  }

  const result = state.lastResult;
  const busy = state.status === 'submitting' || state.status === 'pending_sync';
  const pending = state.status === 'pending_sync';
  const showResult = !pending && result !== null && result.attempt_id !== dismissedId;
  const locked = busy || showResult;
  const empty = isAnswerEmpty(parsed, response);
  const canGiveUp = result !== null && !result.is_correct && !result.final && state.attempts >= 1;
  const recognition = exercise.stage === 'recognition';
  const hintLevels =
    recognition && (parsed.type === 'translate' || parsed.type === 'fill_blank') ? (parsed.prompt.hint_levels ?? []) : [];

  const send = (r: ExerciseResponse, confidence: Confidence | null) => {
    if (busy || sentRef.current) return;
    sentRef.current = true;
    setSends((n) => n + 1);
    if ('option_id' in r) setSubmittedOptionId(r.option_id);
    if (!('give_up' in r)) setSentResponse(r);
    onSubmit(r, { confidence, responseMs: Math.max(0, Math.round(Date.now() - startRef.current)), hintCount: hintsShown });
  };

  const requestSubmit = (confidence: Confidence | null) =>
    gate.run(() => {
      const r = responseRef.current;
      if (locked || !r || isAnswerEmpty(parsed, r)) return;
      send(r, confidence);
    });

  /** Enter in a text input: submit in recognition, otherwise ask for a confidence level first. */
  const onEnter = () => {
    if (recognition) requestSubmit(null);
    else if (!isAnswerEmpty(parsed, responseRef.current)) chipsRef.current?.focus();
  };

  const retry = () => {
    if (result) setDismissedId(result.attempt_id);
    setResponse(null);
    setSubmittedOptionId(null);
    startRef.current = Date.now();
    setRetries((n) => n + 1);
  };

  const giveUp = () => send({ give_up: true }, null);

  const aiInput = ai ? { ai, prompt: exercisePromptText(exercise), answer: responseText(exercise, sentResponse) } : undefined;
  const choiceMarks = showResult && result ? { chosenId: submittedOptionId, correctText: result.display_answer } : null;
  const selectedId = response && 'option_id' in response ? response.option_id : null;
  const pick = (id: string) => {
    playSound('select');
    setResponse({ option_id: id });
  };

  let body: ReactNode;
  switch (parsed.type) {
    case 'mcq':
      body = (
        <McqExercise
          prompt={parsed.prompt}
          seed={exercise.id}
          selectedId={selectedId}
          onSelect={pick}
          disabled={locked}
          marks={choiceMarks}
        />
      );
      break;
    case 'listen':
      body = (
        <ListenExercise
          prompt={parsed.prompt}
          seed={exercise.id}
          selectedId={selectedId}
          onSelect={pick}
          disabled={locked}
          marks={choiceMarks}
        />
      );
      break;
    case 'fill_blank':
      body = (
        <FillBlankExercise
          prompt={parsed.prompt}
          lang={exercise.answer_lang}
          values={response && 'blanks' in response ? response.blanks : {}}
          onChange={(blanks) => setResponse({ blanks })}
          onSubmitRequest={onEnter}
          disabled={locked}
        />
      );
      break;
    case 'word_bank':
      body = (
        <WordBankExercise
          prompt={parsed.prompt}
          lang={exercise.answer_lang}
          seed={`${runId ?? ''}:${exercise.id}`}
          tokenIds={response && 'token_ids' in response ? response.token_ids : []}
          onChange={(ids) => {
            playSound('select');
            setResponse(ids.length > 0 ? { token_ids: ids } : null);
          }}
          disabled={locked}
        />
      );
      break;
    case 'translate':
      body = (
        <TranslateExercise
          prompt={parsed.prompt}
          lang={exercise.answer_lang}
          text={response && 'text' in response ? response.text : ''}
          onChange={(text) => setResponse({ text })}
          onSubmitRequest={onEnter}
          disabled={locked}
        />
      );
      break;
  }

  let actions: ReactNode;
  if ((showResult && result.final) || pending) {
    // While pending the learner keeps going; the verdict appears once the outbox syncs (spec 2 §7.4).
    actions = (
      <Button
        variant="accent"
        size="lg"
        block
        onClick={() => {
          playSound('next');
          onContinue();
        }}
      >
        Tiếp tục
      </Button>
    );
  } else if (showResult) {
    actions = (
      // One row: two stacked buttons would cover the feedback card on a small screen.
      <div className={canGiveUp ? 'grid grid-cols-2 gap-3' : 'grid gap-2'}>
        {canGiveUp && (
          <Button variant="ghost" size="lg" block className="px-3!" onClick={giveUp} disabled={busy}>
            Xem đáp án
          </Button>
        )}
        <Button variant="primary" size="lg" block className={canGiveUp ? 'px-3!' : undefined} onClick={retry} disabled={busy}>
          <RotateCcw aria-hidden className="size-5" />
          Thử lại
        </Button>
      </div>
    );
  } else {
    actions = (
      <div className="grid gap-2">
        {recognition ? (
          <Button variant="accent" size="lg" block disabled={empty || busy} loading={state.status === 'submitting'} onClick={() => requestSubmit(null)}>
            Kiểm tra
          </Button>
        ) : (
          <ConfidenceChips ref={chipsRef} disabled={empty || busy} onPick={(c) => requestSubmit(c)} />
        )}
        {canGiveUp && (
          <Button variant="ghost" block onClick={giveUp} disabled={busy}>
            Xem đáp án
          </Button>
        )}
      </div>
    );
  }

  return (
    <CompositionGateContext.Provider value={gate}>
      <section aria-labelledby={titleId} className="flex min-w-0 flex-1 flex-col">
        <div className="min-w-0 pb-6">
          {/* Stage + instruction read as one quiet line; the prompt below is the thing to look at. */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <span className="eyebrow inline-flex items-center gap-1.5 text-accent-text">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
              {STAGE_LABELS[exercise.stage]}
            </span>
            <h2 id={titleId} className="text-[15px] font-semibold leading-snug text-muted">
              {instructionFor(parsed, exercise.answer_lang)}
            </h2>
            {recheck && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warn/15 px-2.5 py-0.5 text-xs font-bold text-text ring-1 ring-warn/40 ring-inset">
                <RotateCcw aria-hidden className="size-3" />
                Làm lại
              </span>
            )}
          </div>
          <div ref={bodyRef} className="mt-4 min-w-0">
            {body}
          </div>
          {hintLevels.length > 0 && (
            <HintReveal levels={hintLevels} shown={hintsShown} onReveal={() => setHintsShown((n) => n + 1)} disabled={locked} />
          )}
          <div role="status" className="mt-4 empty:hidden">
            {pending && <PendingSyncBadge />}
          </div>
          <FeedbackPanel
            result={showResult ? result : null}
            className="mt-4"
            ai={aiInput}
            report={reportable ? { kind: 'exercise', id: exercise.id } : undefined}
            answerLang={exercise.answer_lang}
          />
        </div>
        <ActionBar bleed={bleed} verdict={showResult ? result.verdict : null}>
          {actions}
        </ActionBar>
      </section>
    </CompositionGateContext.Provider>
  );
}

const BAR_TONE: Record<Verdict, string> = {
  correct: 'border-success/50 bg-[color-mix(in_srgb,var(--success)_16%,var(--bg))]',
  almost: 'border-warn/55 bg-[color-mix(in_srgb,var(--warn)_16%,var(--bg))]',
  incorrect: 'border-error/50 bg-[color-mix(in_srgb,var(--error)_14%,var(--bg))]',
};

/**
 * Sticky bottom bar holding the main action. It is opaque (content never shows through the buttons), fades the
 * content scrolling under it, sits on the home indicator inset and takes the verdict's tint once an answer is graded.
 */
function ActionBar({ children, verdict = null, bleed = false }: { children: ReactNode; verdict?: Verdict | null; bleed?: boolean }) {
  return (
    <div
      className={cn(
        'sticky bottom-0 z-10 mt-auto rounded-t-[1.75rem] border-t-2 pb-safe transition-colors duration-200',
        'before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-6 before:bg-gradient-to-t before:from-bg before:to-transparent',
        bleed
          ? '-mx-[max(1.25rem,env(safe-area-inset-left,0px))] px-[max(1.25rem,env(safe-area-inset-left,0px))]'
          : '-mx-4 px-4',
        verdict ? BAR_TONE[verdict] : 'border-transparent bg-bg',
        verdict && 'before:hidden',
      )}
    >
      <div className="pt-4 pb-4">{children}</div>
    </div>
  );
}
