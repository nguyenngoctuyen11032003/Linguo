import { z } from 'zod';

/**
 * TODO(A1): every schema in this file is a permissive placeholder for the content schemas that
 * `@linguo/shared` (packages/shared/src/content/) will export. Swap them for the shared ones at
 * integration — the rest of the lesson player imports these names only from here.
 *
 * The shared exercise `prompt` schema is `.strict()` and rejects answer fields; this placeholder does
 * not, so it must not be relied on as an answer-leak guard.
 */

/** Localized Vietnamese text `{ vi: "..." }` (PRD content convention, spec §3.1). */
export const localizedTextSchema = z.looseObject({ vi: z.string() });
export type LocalizedText = z.infer<typeof localizedTextSchema>;

/** TODO(A1): discriminated union of public prompts by `exercise_type` (spec §5.1). */
export const exercisePromptSchema = z.record(z.string(), z.unknown());
export type ExercisePrompt = z.infer<typeof exercisePromptSchema>;

/** TODO(A1): lesson body block (`objective | explain | deep_explain | example | common_mistake | summary`). */
export const lessonBlockSchema = z.looseObject({ type: z.string() });
export type LessonBlock = z.infer<typeof lessonBlockSchema>;

/** TODO(A1): lesson objective entry. */
export const lessonObjectiveSchema = z.unknown();

/** TODO(A1): `learning_items.front` / `back` (PRD §6.4). */
export const learningItemSideSchema = z.unknown();
