// Spec 5 §3: one prompt module per AI task. Changing a prompt or schema = bump its version,
// which changes the cache key and so invalidates cached answers automatically.
import type { AiTask } from '../../../_shared/ai-contract.ts';
import { analyzeError } from './analyze_error.ts';
import { explainConcept } from './explain_concept.ts';
import { generatePractice } from './generate_practice.ts';
import { reviewWriting } from './review_writing.ts';
import type { PromptModule } from './shared.ts';

export type { PromptModule, ValidateResult } from './shared.ts';

export const PROMPTS: Record<AiTask, PromptModule> = {
  explain_concept: explainConcept,
  generate_practice: generatePractice,
  analyze_error: analyzeError,
  review_writing: reviewWriting,
};
