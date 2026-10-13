import { z } from 'zod';
import { CONTENT_STATUSES, ITEM_ROLES, ITEM_TYPES, LICENSES, PROGRAM_KINDS, lessonBlockSchema, localizedTextSchema } from './authoring';
import { ANSWER_LANGS, EXERCISE_STAGES, EXERCISE_TYPES, knownWrongSchema, rubricSchema } from './exercises';

// Spec 2 §3.5/§4.3: the JSON document `scripts/content-import.mjs` builds and
// `content_private.import_bundle(jsonb)` consumes. Ids are UUIDv5 of `key`
// (namespace CONTENT_UUID_NAMESPACE); `content_hash` is the sha256 hex of the
// row's canonical content (see scripts/content/hash.mjs). Units, lessons and
// exercises inherit `source_id` from their program.

export const BUNDLE_VERSION = 1;
export const CONTENT_UUID_NAMESPACE = '0b6f3a52-7c1d-5e4f-8a9b-1c2d3e4f5a6b';

const uuid = z.uuid();
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const key = z.string().min(1);
const review = {
  status: z.enum(CONTENT_STATUSES),
  is_demo: z.boolean(),
  reviewed_by: z.string().nullable(),
  reviewed_at: z.string().nullable(),
  content_hash: hash,
};

export const bundleSchema = z.strictObject({
  bundle_version: z.literal(BUNDLE_VERSION),
  git_sha: z.string().nullable(),
  sources: z.array(
    z.strictObject({
      id: uuid,
      key,
      title: z.string(),
      author_or_org: z.string(),
      url: z.string().nullable(),
      license: z.enum(LICENSES),
      attribution_required: z.boolean(),
      ...review,
    }),
  ),
  programs: z.array(
    z.strictObject({
      id: uuid,
      key,
      source_id: uuid,
      language_code: z.enum(['en', 'ko']),
      title: localizedTextSchema,
      description: localizedTextSchema,
      kind: z.enum(PROGRAM_KINDS),
      goal_types: z.array(z.string()),
      level_from: z.string(),
      level_to: z.string(),
      order_index: z.number().int(),
      ...review,
    }),
  ),
  units: z.array(
    z.strictObject({ id: uuid, key, source_id: uuid, program_id: uuid, order_index: z.number().int(), title: localizedTextSchema, ...review }),
  ),
  lessons: z.array(
    z.strictObject({
      id: uuid,
      key,
      source_id: uuid,
      unit_id: uuid,
      language_code: z.enum(['en', 'ko']),
      level_code: z.string(),
      order_index: z.number().int(),
      title: localizedTextSchema,
      objectives: z.array(localizedTextSchema),
      body: z.array(lessonBlockSchema),
      estimated_minutes: z.number().int(),
      skills: z.array(z.string()),
      ...review,
    }),
  ),
  lesson_prerequisites: z.array(z.strictObject({ lesson_id: uuid, prerequisite_lesson_id: uuid })),
  learning_items: z.array(
    z.strictObject({
      id: uuid,
      key,
      source_id: uuid,
      language_code: z.enum(['en', 'ko']),
      item_type: z.enum(ITEM_TYPES),
      level_code: z.string(),
      difficulty: z.number().int(),
      skill_tags: z.array(z.string()),
      front: z.record(z.string(), z.unknown()),
      back: z.record(z.string(), z.unknown()),
      audio_path: z.string().nullable(),
      ...review,
    }),
  ),
  lesson_items: z.array(z.strictObject({ lesson_id: uuid, item_id: uuid, position: z.number().int(), role: z.enum(ITEM_ROLES) })),
  exercises: z.array(
    z.strictObject({
      id: uuid,
      key,
      source_id: uuid,
      lesson_id: uuid,
      item_id: uuid.nullable(),
      order_index: z.number().int(),
      exercise_type: z.enum(EXERCISE_TYPES),
      stage: z.enum(EXERCISE_STAGES),
      answer_lang: z.enum(ANSWER_LANGS),
      difficulty: z.number().int(),
      prompt: z.record(z.string(), z.unknown()),
      ...review,
      /** Moved into content_private.exercise_keys; never exposed to clients. */
      key_data: z.strictObject({
        answer_key: z.record(z.string(), z.unknown()),
        rubric: rubricSchema,
        known_wrong: z.array(knownWrongSchema),
        explanation: localizedTextSchema,
        display_answer: z.string(),
      }),
    }),
  ),
});

export type ContentBundle = z.infer<typeof bundleSchema>;

/** Result of `content_private.import_bundle`. */
export const importResultSchema = z.strictObject({
  inserted: z.number().int(),
  updated: z.number().int(),
  archived: z.number().int(),
  unchanged: z.number().int(),
});
export type ImportResult = z.infer<typeof importResultSchema>;
