import { useState } from 'react';
import type { AdminContentDetail, CardDirection, ExerciseResponse, PublicExercise, SubmitResult } from '@linguo/shared';
import { ExerciseFrame } from '@/components/exercise/ExerciseFrame';
import { Flashcard } from '@/components/flashcard/Flashcard';
import { Button } from '@/components/ui/Button';
import type { ExerciseUiState } from '@/features/lesson-player/types';
import { QuestionView } from '@/routes/app/exam/components/QuestionView';
import { cn } from '@/lib/cn';
import { JsonView } from './JsonView';
import { gradePreview, rowLanguage, toExamQuestion, toPublicExercise, toReviewCard } from './preview-model';

/** Learner-faithful preview of a content row, or a readable JSON view when no learner component fits. */
export function ContentPreview({ detail }: { detail: AdminContentDetail }) {
  const exercise = toPublicExercise(detail);
  if (exercise) return <ExercisePreview key={`${detail.id}:${detail.version ?? ''}`} detail={detail} exercise={exercise} />;
  if (detail.kind === 'learning_item' && toReviewCard(detail, 'recognize')) return <FlashcardPreview key={detail.id} detail={detail} />;
  if (toExamQuestion(detail)) return <ExamQuestionPreview key={detail.id} detail={detail} />;
  return (
    <div className="space-y-2">
      {detail.kind === 'exercise' || detail.kind === 'learning_item' || detail.kind === 'exam_question' ? (
        <p className="text-sm text-muted">Dữ liệu không khớp định dạng người học, nên chỉ hiện dạng thô.</p>
      ) : (
        <p className="text-sm text-muted">Loại nội dung này không có màn hình người học riêng; dưới đây là dữ liệu đang lưu.</p>
      )}
      <JsonView value={detail.row} label="Dữ liệu công khai" />
    </div>
  );
}

function ExercisePreview({ detail, exercise }: { detail: AdminContentDetail; exercise: PublicExercise }) {
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [ungraded, setUngraded] = useState(false);
  const state: ExerciseUiState = result
    ? { status: 'graded', attempts: 1, lastResult: result }
    : { status: 'idle', attempts: 0, lastResult: null };

  const onSubmit = (response: ExerciseResponse) => {
    const graded = gradePreview(detail, exercise, response);
    if (graded) setResult(graded);
    else setUngraded(true);
  };

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">Làm thử như người học; câu trả lời được chấm ngay trên máy bạn, không lưu lại.</p>
      {ungraded && (
        <p role="status" className="text-sm text-muted">
          Không đọc được đáp án của bài tập này nên không chấm thử được.
        </p>
      )}
      <div className="rounded-3xl border border-border bg-bg px-4 pt-4">
        <ExerciseFrame
          key={round}
          exercise={exercise}
          state={state}
          recheck={false}
          onSubmit={onSubmit}
          onContinue={() => {
            setResult(null);
            setUngraded(false);
            setRound((n) => n + 1);
          }}
        />
      </div>
    </div>
  );
}

function FlashcardPreview({ detail }: { detail: AdminContentDetail }) {
  const [direction, setDirection] = useState<CardDirection>('recognize');
  const [flipped, setFlipped] = useState(false);
  const card = toReviewCard(detail, direction);
  if (!card) return null;
  return (
    <div className="space-y-3">
      <div role="group" aria-label="Chiều thẻ" className="inline-flex rounded-full border border-border bg-surface-solid p-1">
        {(['recognize', 'recall'] as const).map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={direction === d}
            onClick={() => {
              setDirection(d);
              setFlipped(false);
            }}
            className={cn(
              'min-h-11 rounded-full px-4 text-[15px] font-semibold transition-colors',
              direction === d ? 'bg-primary text-on-primary' : 'text-muted hover:bg-text/5',
            )}
          >
            {d === 'recognize' ? 'Nhận diện' : 'Nhớ lại'}
          </button>
        ))}
      </div>
      <div className="max-w-md">
        <Flashcard key={direction} card={card} flipped={flipped} onFlip={() => setFlipped(true)} />
      </div>
      {flipped && (
        <Button variant="ghost" onClick={() => setFlipped(false)}>
          Lật lại mặt trước
        </Button>
      )}
    </div>
  );
}

function ExamQuestionPreview({ detail }: { detail: AdminContentDetail }) {
  const [answer, setAnswer] = useState<string | null>(null);
  const [flagged, setFlagged] = useState(false);
  const question = toExamQuestion(detail);
  if (!question) return null;
  return (
    <div className="rounded-3xl border border-border bg-bg p-4">
      <QuestionView
        question={{ ...question, answer, flagged }}
        language={rowLanguage(detail) ?? 'en'}
        listenLimit={null}
        onAnswer={setAnswer}
        onToggleFlag={() => setFlagged((f) => !f)}
      />
    </div>
  );
}
