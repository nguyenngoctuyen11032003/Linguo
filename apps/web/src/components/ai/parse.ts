import {
  AI_OUTPUT_SCHEMAS,
  type AiSuccess,
  type AnalyzeErrorOutput,
  type ExplainConceptOutput,
  type GeneratePracticeOutput,
} from '@linguo/shared';

export type ParsedAiResult =
  | { task: 'explain_concept'; data: ExplainConceptOutput }
  | { task: 'generate_practice'; data: GeneratePracticeOutput }
  | { task: 'analyze_error'; data: AnalyzeErrorOutput };

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
  }
}
