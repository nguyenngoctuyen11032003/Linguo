import {
  AI_OUTPUT_SCHEMAS,
  type AiSuccess,
  type AnalyzeErrorOutput,
  type AnalyzeSentenceOutput,
  type ExplainConceptOutput,
  type GeneratePracticeOutput,
  type PlanReviewOutput,
  type ReviewWritingOutput,
  type SummarizeSessionOutput,
} from '@linguo/shared';

export type ParsedAiResult =
  | { task: 'explain_concept'; data: ExplainConceptOutput }
  | { task: 'generate_practice'; data: GeneratePracticeOutput }
  | { task: 'analyze_error'; data: AnalyzeErrorOutput }
  | { task: 'review_writing'; data: ReviewWritingOutput }
  | { task: 'analyze_sentence'; data: AnalyzeSentenceOutput }
  | { task: 'summarize_session'; data: SummarizeSessionOutput }
  | { task: 'plan_review'; data: PlanReviewOutput };

/** Validates `result.data` against the task's output schema; null when it does not match. */
export function parseAiResult(result: AiSuccess): ParsedAiResult | null {
  switch (result.task) {
    case 'explain_concept': {
      const parsed = AI_OUTPUT_SCHEMAS.explain_concept.safeParse(result.data);
      return parsed.success ? { task: 'explain_concept', data: parsed.data } : null;
    }
    case 'generate_practice': {
      const parsed = AI_OUTPUT_SCHEMAS.generate_practice.safeParse(result.data);
      return parsed.success ? { task: 'generate_practice', data: parsed.data } : null;
    }
    case 'analyze_error': {
      const parsed = AI_OUTPUT_SCHEMAS.analyze_error.safeParse(result.data);
      return parsed.success ? { task: 'analyze_error', data: parsed.data } : null;
    }
    case 'review_writing': {
      const parsed = AI_OUTPUT_SCHEMAS.review_writing.safeParse(result.data);
      return parsed.success ? { task: 'review_writing', data: parsed.data } : null;
    }
    case 'analyze_sentence': {
      const parsed = AI_OUTPUT_SCHEMAS.analyze_sentence.safeParse(result.data);
      return parsed.success ? { task: 'analyze_sentence', data: parsed.data } : null;
    }
    case 'summarize_session': {
      const parsed = AI_OUTPUT_SCHEMAS.summarize_session.safeParse(result.data);
      return parsed.success ? { task: 'summarize_session', data: parsed.data } : null;
    }
    case 'plan_review': {
      const parsed = AI_OUTPUT_SCHEMAS.plan_review.safeParse(result.data);
      return parsed.success ? { task: 'plan_review', data: parsed.data } : null;
    }
  }
}
