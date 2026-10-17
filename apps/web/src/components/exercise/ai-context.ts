import {
  PROMPT_SCHEMAS,
  type AiRequestInput,
  type ExerciseResponse,
  type LessonItem,
  type LessonPayload,
  type PublicExercise,
  type SubmitResult,
} from '@linguo/shared';

/** Lesson facts the exercise feedback needs to ask the AI tutor (spec 5 §5). Absent → no AI buttons. */
export interface LessonAiContext {
  language: 'en' | 'ko' | 'ja' | 'de';
  level: string;
  lessonId?: string;
  /** "Lesson title — item", the concept explain_concept asks about. */
  concept: string;
  /** The lesson's curated explanation: shown when the AI cannot answer. */
  curated: { title: string; body: string } | null;
}

export interface AiSheetState {
  request: AiRequestInput;
  fallback?: { title: string; body: string };
}

/** Trims and cuts text to the contract's limits, ending with an ellipsis when cut. */
export function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

/** The question as the learner saw it, in plain text. */
export function exercisePromptText(exercise: PublicExercise): string {
  switch (exercise.type) {
    case 'mcq': {
      const r = PROMPT_SCHEMAS.mcq.safeParse(exercise.prompt);
      return r.success ? `${r.data.stem} (${r.data.options.map((o) => o.text).join(' / ')})` : '';
    }
    case 'listen': {
      const r = PROMPT_SCHEMAS.listen.safeParse(exercise.prompt);
      return r.success ? `Nghe: ${r.data.fallback_text} (${r.data.options.map((o) => o.text).join(' / ')})` : '';
    }
    case 'fill_blank': {
      const r = PROMPT_SCHEMAS.fill_blank.safeParse(exercise.prompt);
      return r.success ? `Điền vào chỗ trống: ${r.data.template.replace(/\{\{[^}]+\}\}/g, '___')}` : '';
    }
    case 'word_bank': {
      const r = PROMPT_SCHEMAS.word_bank.safeParse(exercise.prompt);
      return r.success ? `${r.data.instruction} (${r.data.tokens.map((t) => t.text).join(' / ')})` : '';
    }
    case 'translate': {
      const r = PROMPT_SCHEMAS.translate.safeParse(exercise.prompt);
      return r.success ? `Dịch: ${r.data.source_text}` : '';
    }
  }
}

/** What the learner answered, in plain text ('' for "Xem đáp án" or nothing). */
export function responseText(exercise: PublicExercise, response: ExerciseResponse | null): string {
  if (!response || 'give_up' in response) return '';
  if ('text' in response) return response.text;
  if ('option_id' in response) {
    const schema = exercise.type === 'listen' ? PROMPT_SCHEMAS.listen : PROMPT_SCHEMAS.mcq;
    const r = schema.safeParse(exercise.prompt);
    return (r.success && r.data.options.find((o) => o.id === response.option_id)?.text) || '';
  }
  if ('token_ids' in response) {
    const r = PROMPT_SCHEMAS.word_bank.safeParse(exercise.prompt);
    if (!r.success) return '';
    return response.token_ids.map((id) => r.data.tokens.find((t) => t.id === id)?.text ?? '').filter(Boolean).join(' ');
  }
  if ('blanks' in response) {
    const r = PROMPT_SCHEMAS.fill_blank.safeParse(exercise.prompt);
    if (!r.success) return Object.values(response.blanks).join(' / ');
    return r.data.blanks.map((b) => response.blanks[b.id] ?? '').join(' / ');
  }
  return '';
}

export interface ExerciseAiInput {
  ai: LessonAiContext;
  /** Plain-text question. */
  prompt: string;
  /** Plain-text learner answer. */
  answer: string;
}

const CURATED_TITLE = 'Giải thích trong bài';

/**
 * The AI requests a feedback card may offer. Nothing before the answer is revealed or right, so the AI never
 * gives away an answer the learner may still try again.
 */
export function feedbackAiRequests(result: SubmitResult, input: ExerciseAiInput): { why: AiSheetState | null; explain: AiSheetState } | null {
  if (!result.revealed && !result.is_correct) return null;
  const { ai, prompt, answer } = input;
  const common = { language: ai.language, level: ai.level, ...(ai.lessonId ? { lesson_id: ai.lessonId } : {}) };
  const curated = ai.curated ?? undefined;

  const expected = result.display_answer ?? (result.is_correct ? answer : '');
  const whyBody = result.explanation?.vi ?? result.feedback_vi ?? curated?.body ?? null;
  const why: AiSheetState | null =
    expected.trim() && prompt.trim()
      ? {
          request: {
            task: 'analyze_error',
            ...common,
            prompt: clip(prompt, 500),
            expected: clip(expected, 300),
            answer: clip(answer, 300),
          },
          fallback: whyBody ? { title: CURATED_TITLE, body: whyBody } : undefined,
        }
      : null;

  const explain: AiSheetState = {
    request: { task: 'explain_concept', ...common, concept: clip(ai.concept, 300) },
    fallback: curated,
  };
  return { why, explain };
}

/**
 * What the AI tutor buttons under an exercise ask about: the lesson and the exercise's item, with the lesson's own
 * explanation as the fallback when the AI cannot answer.
 */
export function lessonAiContext(lesson: LessonPayload['lesson'], exercise: PublicExercise, items: LessonItem[]): LessonAiContext {
  const item = exercise.item_id ? items.find((i) => i.id === exercise.item_id) : undefined;
  const itemText = typeof item?.front.text === 'string' ? item.front.text.trim() : '';
  const explains = lesson.body.flatMap((b) => (b.type === 'explain' ? [b.text.vi] : []));
  return {
    language: lesson.language_code,
    level: lesson.level_code,
    lessonId: lesson.id,
    concept: itemText ? `${lesson.title.vi} — ${itemText}` : lesson.title.vi,
    curated: explains.length > 0 ? { title: lesson.title.vi, body: explains.join('\n\n') } : null,
  };
}
