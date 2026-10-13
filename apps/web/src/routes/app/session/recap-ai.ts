import type { AiRequestInput } from '@linguo/shared';
import { clip, type AiSheetState } from '@/components/exercise/ai-context';
import type { SessionMistake } from '@/features/session/service';

interface LearnerLevel {
  language: 'en' | 'ko';
  level: string;
}

/**
 * "Giải thích AI" on a recap mistake: analyze_error when we know the question and the right answer, otherwise
 * explain_concept on whatever text we have. The right answer is the fallback when the AI cannot answer.
 */
export function recapAiState(mistake: SessionMistake, learner: LearnerLevel): AiSheetState | null {
  const prompt = mistake.prompt.trim();
  const expected = mistake.expected.trim();
  const lesson = mistake.lesson_id ? { lesson_id: mistake.lesson_id } : {};
  let request: AiRequestInput;
  if (prompt && expected) {
    request = {
      task: 'analyze_error',
      language: learner.language,
      level: learner.level,
      ...lesson,
      prompt: clip(prompt, 500),
      expected: clip(expected, 300),
      answer: clip(mistake.answer, 300),
    };
  } else if (prompt || expected) {
    request = { task: 'explain_concept', language: learner.language, level: learner.level, ...lesson, concept: clip(prompt || expected, 300) };
  } else {
    return null;
  }
  return {
    request,
    fallback: expected ? { title: 'Đáp án đúng', body: expected } : undefined,
  };
}
