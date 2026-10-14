import type { AdminContentDetail, AdminContentKind } from '@linguo/shared';

// Spec 11 §1/§4 "Gợi ý sửa trong repo": the admin never edits content in the DB. It shows the YAML file the row
// comes from and a YAML snippet of the row as it is stored now, close to the authoring shape in content/**.yaml,
// so an editor can find the entry and fix it in the repo. Pure; a tiny emitter instead of a YAML dependency.

/** DB bookkeeping that never appears in the authoring YAML. */
const DROPPED = new Set([
  'id',
  'source_id',
  'program_id',
  'unit_id',
  'lesson_id',
  'item_id',
  'form_id',
  'assessment_id',
  'exercise_id',
  'question_id',
  'content_hash',
  'content_version',
  'created_at',
  'updated_at',
  'published_at',
  'version',
  'status',
  'is_demo',
  'reviewed_by',
  'reviewed_at',
  'language_code',
  'key_confidence',
]);

/** Column → authoring field, per kind. */
const RENAMES: Partial<Record<AdminContentKind, Record<string, string>>> = {
  program: {},
  unit: {},
  lesson: { level_code: 'level' },
  learning_item: { item_type: 'type', level_code: 'level' },
  exercise: { exercise_type: 'type', answer_key: 'answer' },
  assessment_item: { level_code: 'level', answer_key: 'answer' },
  exam_form: {},
  exam_question: { answer_key: 'answer' },
};

/** Kinds that are list entries (`- key: …`) inside their file rather than the whole file. */
const LIST_ENTRY: ReadonlySet<AdminContentKind> = new Set(['learning_item', 'exercise', 'assessment_item', 'exam_question']);

/** Private fields of an exam question that the YAML keeps under `prompt`. */
const EXAM_PROMPT_FIELDS = new Set(['script', 'tts_text']);

/** Fields in the order the authoring files use them; anything else follows alphabetically. */
const FIELD_ORDER = [
  'key',
  'type',
  'kind',
  'family',
  'section',
  'item_type',
  'question_type',
  'stage',
  'answer_lang',
  'order_index',
  'seq',
  'level',
  'level_code',
  'level_from',
  'level_to',
  'skill',
  'difficulty',
  'points',
  'skill_tags',
  'skills',
  'goal_types',
  'title',
  'title_vi',
  'description',
  'description_vi',
  'objectives',
  'estimated_minutes',
  'time_limits',
  'scoring',
  'front',
  'back',
  'audio_path',
  'prompt',
  'body',
  'answer',
  'rubric',
  'known_wrong',
  'explanation',
  'display_answer',
];

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

function orderedEntries(obj: Record<string, unknown>): [string, unknown][] {
  const rank = (k: string) => {
    const i = FIELD_ORDER.indexOf(k);
    return i === -1 ? FIELD_ORDER.length : i;
  };
  return Object.entries(obj).sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
}

/** The row as an authoring-shaped object: bookkeeping dropped, columns renamed, private fields merged. */
export function authoringObject(detail: AdminContentDetail): Record<string, unknown> {
  const renames = RENAMES[detail.kind] ?? {};
  const out: Record<string, unknown> = {};
  const put = (column: string, value: unknown) => {
    if (DROPPED.has(column) || value === undefined) return;
    out[renames[column] ?? column] = value;
  };
  for (const [column, value] of Object.entries(detail.row)) put(column, value);
  if (detail.key !== null) out.key = detail.key;
  for (const [column, value] of Object.entries(detail.private ?? {})) {
    if (detail.kind === 'exam_question' && EXAM_PROMPT_FIELDS.has(column)) {
      out.prompt = { ...(isRecord(out.prompt) ? out.prompt : {}), [column]: value };
    } else {
      put(column, value);
    }
  }
  // Empty defaults are left out of the authoring files.
  for (const field of ['known_wrong', 'goal_types', 'skill_tags']) {
    if (Array.isArray(out[field]) && (out[field] as unknown[]).length === 0) delete out[field];
  }
  if (isRecord(out.rubric) && Object.keys(out.rubric).length === 0) delete out.rubric;
  if (out.audio_path === null) delete out.audio_path;
  return Object.fromEntries(orderedEntries(out));
}

// ---------------------------------------------------------------------------
// Emitter
// ---------------------------------------------------------------------------

const RESERVED = /^(?:true|false|yes|no|on|off|null|~|y|n)$/i;
const NUMERIC = /^[-+]?(?:\d[\d_]*(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$|^[-+]?\.(?:inf|nan)$|^0x[0-9a-f]+$|^0o[0-7]+$/i;
/** Characters that cannot start a plain scalar. */
const BAD_START = /^[-?:,[\]{}#&*!|>'"%@`\s]/;

function plainSafe(s: string): boolean {
  if (s === '' || s !== s.trim()) return false;
  if (RESERVED.test(s) || NUMERIC.test(s) || BAD_START.test(s)) return false;
  if (/[\n\r\t]/.test(s) || s.includes(': ') || s.endsWith(':') || s.includes(' #')) return false;
  // Flow indicators would be fine in block context, but quoting them keeps snippets unambiguous when pasted inline.
  return !/[{}[\],]/.test(s);
}

function scalar(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  const s = String(value);
  // A JSON string is a valid YAML double-quoted scalar.
  return plainSafe(s) ? s : JSON.stringify(s);
}

const yamlKey = (k: string) => (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(k) ? k : JSON.stringify(k));

const isEmptyCollection = (v: unknown) => (Array.isArray(v) && v.length === 0) || (isRecord(v) && Object.keys(v).length === 0);
const isCollection = (v: unknown) => (Array.isArray(v) || isRecord(v)) && !isEmptyCollection(v);
const emptyCollection = (v: unknown) => (Array.isArray(v) ? '[]' : '{}');

function emitLines(value: unknown, indent: number): string[] {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (!isCollection(item)) return [`${pad}- ${isEmptyCollection(item) ? emptyCollection(item) : scalar(item)}`];
      // The first line of a nested block goes on the dash line.
      const nested = emitLines(item, indent + 2);
      return [`${pad}- ${nested[0]!.slice(indent + 2)}`, ...nested.slice(1)];
    });
  }
  if (isRecord(value)) {
    return Object.entries(value).flatMap(([k, v]) => {
      if (isCollection(v)) return [`${pad}${yamlKey(k)}:`, ...emitLines(v, indent + 2)];
      return [`${pad}${yamlKey(k)}: ${isEmptyCollection(v) ? emptyCollection(v) : scalar(v)}`];
    });
  }
  return [`${pad}${scalar(value)}`];
}

/** Block-style YAML for plain JSON data (objects, arrays, strings, numbers, booleans, null). */
export function toYaml(value: unknown): string {
  if (!isCollection(value)) return isEmptyCollection(value) ? emptyCollection(value) : scalar(value);
  return `${emitLines(value, 0).join('\n')}\n`;
}

export interface YamlHint {
  /** File under content/ (repo-relative), or null when it cannot be derived. */
  path: string | null;
  /** What to search for in the file. */
  key: string | null;
  snippet: string;
}

/** The "Gợi ý sửa trong repo" block of a content row. */
export function yamlHint(detail: AdminContentDetail): YamlHint {
  const obj = authoringObject(detail);
  const path = detail.repo_path ? (detail.repo_path.startsWith('content/') ? detail.repo_path : `content/${detail.repo_path}`) : null;
  const header = [`# ${path ?? 'Không xác định được file'}${detail.key ? ` — mục key: ${detail.key}` : ''}`];
  header.push(`# Trạng thái hiện tại trong DB: ${detail.status}${detail.version !== null ? `, version ${detail.version}` : ''}`);
  const body = LIST_ENTRY.has(detail.kind) ? toYaml([obj]) : toYaml(obj);
  return { path, key: detail.key, snippet: `${header.join('\n')}\n${body}` };
}
