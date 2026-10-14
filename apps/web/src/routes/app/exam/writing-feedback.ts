import {
  REVIEW_WRITING_ANSWER_MAX_CHARS,
  REVIEW_WRITING_MAX_CRITERIA,
  REVIEW_WRITING_PROMPT_MAX_CHARS,
  reviewWritingRequestSchema,
  type AiRequestInput,
  type ExamResult,
} from '@linguo/shared';

type ReviewItem = ExamResult['review'][number];

/** Review items carry no level, so feedback is pitched at a typical level of the family (CEFR: the form's level). */
export function writingFeedbackLevel(result: Pick<ExamResult, 'family' | 'cefr_sections'>): string {
  if (result.family === 'cefr') return result.cefr_sections?.[0]?.level_code ?? 'a2';
  return result.family === 'topik_i' ? 'topik2' : 'topik4';
}

const rubricRowSchema = reviewWritingRequestSchema.shape.rubric.element;

/**
 * The `review_writing` request for an essay review item (Spec 9 X6), or null when there is nothing the AI may
 * review: not an essay, blank, longer than the contract allows (never truncated) or without a usable rubric.
 */
export function writingFeedbackRequest(result: ExamResult, item: ReviewItem): AiRequestInput | null {
  if (item.kind !== 'essay') return null;
  const answer = item.answer?.trim() ?? '';
  if (!answer || answer.length > REVIEW_WRITING_ANSWER_MAX_CHARS) return null;
  const rubric = (item.rubric ?? []).filter((row) => rubricRowSchema.safeParse(row).success).slice(0, REVIEW_WRITING_MAX_CRITERIA);
  if (rubric.length === 0) return null;
  const { instruction_vi, passage, stem } = item.prompt;
  const prompt = [instruction_vi, passage, stem]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join('\n\n')
    .slice(0, REVIEW_WRITING_PROMPT_MAX_CHARS)
    .trim();
  const request: AiRequestInput = {
    task: 'review_writing',
    language: result.family === 'cefr' ? 'en' : 'ko',
    level: writingFeedbackLevel(result),
    prompt,
    answer,
    rubric: rubric.map(({ key, label_vi, description_vi, max_points }) => ({ key, label_vi, description_vi, max_points })),
  };
  return reviewWritingRequestSchema.safeParse(request).success ? request : null;
}
