import {
  ANSWER_SCHEMAS,
  examServedQuestionSchema,
  gradeResponse,
  knownWrongSchema,
  localizedTextSchema,
  publicExerciseSchema,
  reviewCardSchema,
  rubricSchema,
  type AdminContentDetail,
  type CardDirection,
  type ExamServedQuestion,
  type ExerciseResponse,
  type PublicExercise,
  type ReviewCard,
  type SubmitResult,
} from '@linguo/shared';

// Maps admin_get_content rows to the shapes the learner components take, so the preview is what learners see.
// Every builder returns null when the stored row does not fit; the page then falls back to a JSON view.

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** exercises row → the PublicExercise served by get_lesson. */
export function toPublicExercise(detail: AdminContentDetail): PublicExercise | null {
  if (detail.kind !== 'exercise') return null;
  const r = detail.row;
  const parsed = publicExerciseSchema.safeParse({
    id: detail.id,
    key: detail.key ?? r.key,
    version: detail.version ?? r.version ?? 1,
    order_index: r.order_index ?? 0,
    type: r.exercise_type ?? r.type,
    stage: r.stage,
    answer_lang: r.answer_lang,
    item_id: r.item_id ?? null,
    difficulty: r.difficulty ?? 1,
    prompt: r.prompt,
  });
  return parsed.success ? parsed.data : null;
}

const PREVIEW_DUE = '1970-01-01T00:00:00Z';

/** learning_items row → a new review card in the given direction (scheduling fields are placeholders). */
export function toReviewCard(detail: AdminContentDetail, direction: CardDirection): ReviewCard | null {
  if (detail.kind !== 'learning_item') return null;
  const r = detail.row;
  const preview = { interval_minutes: 0, due_at: PREVIEW_DUE };
  const parsed = reviewCardSchema.safeParse({
    card_id: detail.id,
    item_id: detail.id,
    direction,
    state: 'new',
    is_new: true,
    due_at: PREVIEW_DUE,
    postpone_count: 0,
    item: { language_code: r.language_code, item_type: r.item_type, front: r.front, back: r.back, audio_path: r.audio_path ?? null },
    previews: { again: preview, hard: preview, good: preview, easy: preview },
  });
  return parsed.success ? parsed.data : null;
}

/** Target language of a row: its language_code, else the `<lang>:` prefix of its key. */
export function rowLanguage(detail: AdminContentDetail): 'en' | 'ko' | null {
  const code = detail.row.language_code ?? detail.key?.split(':')[0];
  return code === 'en' || code === 'ko' ? code : null;
}

/** exam_questions row → the question as the exam runner serves it (unanswered, not flagged). */
export function toExamQuestion(detail: AdminContentDetail): ExamServedQuestion | null {
  if (detail.kind !== 'exam_question') return null;
  const r = detail.row;
  if (!isRecord(r.prompt)) return null;
  const prompt: Record<string, unknown> = { audio_asset_id: null, ...r.prompt };
  const tts = detail.private?.tts_text ?? detail.private?.script;
  if (r.section === 'listening' && prompt.audio_asset_id === null && typeof tts === 'string') prompt.tts_text = tts;
  const parsed = examServedQuestionSchema.safeParse({
    question_id: detail.id,
    seq: r.seq ?? 1,
    section: r.section,
    kind: r.kind,
    question_type: r.question_type ?? '',
    points: r.points ?? 1,
    prompt,
    answer: null,
    flagged: false,
  });
  return parsed.success ? parsed.data : null;
}

let previewAttempt = 0;

/**
 * Grades a preview answer locally with the shared grading algorithm (the one the server mirrors) and the answer key
 * from `private`, so staff can try the exercise. Null when the key cannot be read.
 */
export function gradePreview(detail: AdminContentDetail, exercise: PublicExercise, response: ExerciseResponse): SubmitResult | null {
  const priv = detail.private;
  if (!priv) return null;
  const answer = ANSWER_SCHEMAS[exercise.type].safeParse(priv.answer_key ?? priv.answer);
  const rubric = rubricSchema.safeParse(priv.rubric ?? {});
  const knownWrong = knownWrongSchema.array().safeParse(priv.known_wrong ?? []);
  if (!answer.success || !rubric.success || !knownWrong.success) return null;
  const graded = gradeResponse(
    { type: exercise.type, answer: answer.data, rubric: rubric.data, knownWrong: knownWrong.data, lang: exercise.answer_lang },
    response,
  );
  const explanation = localizedTextSchema.safeParse(priv.explanation);
  previewAttempt += 1;
  return {
    attempt_id: `00000000-0000-4000-8000-${String(previewAttempt).padStart(12, '0')}`,
    attempt_no: 1,
    verdict: graded.verdict,
    is_correct: graded.verdict !== 'incorrect',
    score: graded.score,
    error_tags: graded.errorTags,
    feedback_vi: graded.feedbackVi,
    revealed: true,
    display_answer: typeof priv.display_answer === 'string' ? priv.display_answer : null,
    explanation: explanation.success ? explanation.data : null,
    final: true,
    requeued: false,
    replayed: false,
  };
}
