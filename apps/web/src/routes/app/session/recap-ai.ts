import type { AiRequestInput } from '@linguo/shared';
import { clip, type AiSheetState } from '@/components/exercise/ai-context';
import type { SessionMistake } from '@/features/session/service';

interface LearnerLevel {
  language: 'en' | 'ko';
  level: string;
}

/**
 * "Giải thích AI" on a recap mistake: analyze_error when the right answer is known, otherwise explain_concept on
 * the question (with the learner's answer as context). The right answer is the fallback when the AI cannot answer.
 */
export function recapAiState(mistake: SessionMistake, learner: LearnerLevel): AiSheetState | null {
  const prompt = mistake.prompt_text.trim();
  const expected = mistake.expected_answer?.trim() ?? '';
  const answer = mistake.learner_answer?.trim() ?? '';
  if (!prompt) return null;
  const common = { language: learner.language, level: learner.level, lesson_id: mistake.lesson_id };
  const request: AiRequestInput = expected
    ? { task: 'analyze_error', ...common, prompt: clip(prompt, 500), expected: clip(expected, 300), answer: clip(answer, 300) }
    : {
        task: 'explain_concept',
        ...common,
        concept: clip(prompt, 300),
        ...(answer ? { context: clip(`Người học trả lời: ${answer}`, 600) } : {}),
      };
  return { request, fallback: expected ? { title: 'Đáp án đúng', body: expected } : undefined };
}
