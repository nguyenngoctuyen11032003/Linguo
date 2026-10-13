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
  type WordBankPrompt,
} from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import type { Confidence, ExerciseUiState, SubmitMeta } from '@/features/lesson-player/types';
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
  onSubmit: (response: ExerciseResponse, meta: SubmitMeta) => void;
  /** Shown when `state.lastResult?.final` (and while an attempt waits for sync). */
  onContinue: () => void;
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

const LANG_NAMES: Record<AnswerLang, string> = { en: 'tiếng Anh', ko: 'tiếng Hàn', vi: 'tiếng Việt' };
const STAGE_LABELS: Record<ExerciseStage, string> = { recognition: 'Nhận diện', recall: 'Nhớ lại', application: 'Vận dụng' };

function instructionFor(parsed: Parsed, answerLang: AnswerLang): string {
  switch (parsed.type) {
    case 'mcq':
      return 'Chọn đáp án đúng';
    case 'listen':
      return 'Bài nghe';
    case 'fill_blank':
      return 'Điền vào chỗ trống';
    case 'word_bank':
      return 'Ghép câu';
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

function ExerciseFrameInner({ exercise, state, recheck, onSubmit, onContinue }: ExerciseFrameProps) {
  const titleId = useId();
  const parsed = useMemo(() => parsePrompt(exercise), [exercise]);
  const gate = useMemo(() => createCompositionGate(), []);
  const [response, setResponseState] = useState<ExerciseResponse | null>(null);
  const responseRef = useRef<ExerciseResponse | null>(null);
  const [hintsShown, setHintsShown] = useState(0);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [submittedOptionId, setSubmittedOptionId] = useState<string | null>(null);
  const [retries, setRetries] = useState(0);
  const startRef = useRef(Date.now());
  const bodyRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLButtonElement>(null);

  const setResponse = (next: ExerciseResponse | null) => {
    responseRef.current = next;
    setResponseState(next);
  };

  useEffect(() => {
    if (retries === 0) return;
    bodyRef.current?.querySelector<HTMLElement>('input:not([disabled]), [role="radio"]:not([disabled]), button:not([disabled])')?.focus();
  }, [retries]);

  if (!parsed) {
    return (
      <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-4">
        <div role="alert" className="flex items-start gap-3 rounded-3xl border border-error/50 bg-error/10 p-4">
          <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-error-text" />
          <h2 id={titleId} className="text-[17px] font-semibold">
            Bài tập bị lỗi định dạng
          </h2>
        </div>
        <ActionBar>
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
    if (busy) return;
    if ('option_id' in r) setSubmittedOptionId(r.option_id);
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

  const choiceMarks = showResult && result ? { chosenId: submittedOptionId, correctText: result.display_answer } : null;
  const selectedId = response && 'option_id' in response ? response.option_id : null;

  let body: ReactNode;
  switch (parsed.type) {
    case 'mcq':
      body = (
        <McqExercise
          prompt={parsed.prompt}
          seed={exercise.id}
          selectedId={selectedId}
          onSelect={(id) => setResponse({ option_id: id })}
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
          onSelect={(id) => setResponse({ option_id: id })}
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
          tokenIds={response && 'token_ids' in response ? response.token_ids : []}
          onChange={(ids) => setResponse(ids.length > 0 ? { token_ids: ids } : null)}
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
      <Button variant="accent" size="lg" block onClick={onContinue}>
        Tiếp tục
      </Button>
    );
  } else if (showResult) {
    actions = (
      <div className="grid gap-2">
        <Button variant="primary" size="lg" block onClick={retry} disabled={busy}>
          <RotateCcw aria-hidden className="size-5" />
          Thử lại
        </Button>
        {canGiveUp && (
          <Button variant="ghost" block onClick={giveUp} disabled={busy}>
            Xem đáp án
          </Button>
        )}
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
      <section aria-labelledby={titleId} className="flex min-w-0 flex-col">
        <div className="min-w-0 pb-4">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-muted">
            <span>{STAGE_LABELS[exercise.stage]}</span>
            {recheck && (
              <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs font-semibold text-text">
                <RotateCcw aria-hidden className="size-3" />
                Làm lại
              </span>
            )}
          </p>
          <h2 id={titleId} className="mt-1 text-[22px] font-bold leading-tight tracking-[-0.02em]">
            {instructionFor(parsed, exercise.answer_lang)}
          </h2>
          <div ref={bodyRef} className="mt-4 min-w-0">
            {body}
          </div>
          {hintLevels.length > 0 && (
            <HintReveal levels={hintLevels} shown={hintsShown} onReveal={() => setHintsShown((n) => n + 1)} disabled={locked} />
          )}
          <div role="status" className="mt-4 empty:hidden">
            {pending && <PendingSyncBadge />}
          </div>
          <FeedbackPanel result={showResult ? result : null} className="mt-4" />
        </div>
        <ActionBar>{actions}</ActionBar>
      </section>
    </CompositionGateContext.Provider>
  );
}

function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 mt-auto border-t border-border bg-bg/95 pb-safe backdrop-blur-md">
      <div className="py-3">{children}</div>
    </div>
  );
}
