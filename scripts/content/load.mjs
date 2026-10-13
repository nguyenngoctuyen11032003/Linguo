// Walks a content tree (spec 2 §4.1), parses every YAML file and validates it with the shared
// zod schema for its kind. Cross-file rules live in check.mjs; bundle building in build.mjs.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parse } from 'yaml';
import {
  LANGUAGE_CODES,
  diagnosticFileSchema,
  itemsFileSchema,
  lessonFileSchema,
  programFileSchema,
  sourcesFileSchema,
  unitFileSchema,
} from '@linguo/shared';

const SCHEMAS = {
  sources: sourcesFileSchema,
  items: itemsFileSchema,
  program: programFileSchema,
  unit: unitFileSchema,
  lesson: lessonFileSchema,
  diagnostic: diagnosticFileSchema,
};

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const YAML_FILE = /\.ya?ml$/i;
const DOC_FILE = /\.md$/i;
const BOM = '\u{FEFF}';

/**
 * Review status a row is imported with: the authored one, else `published` for demo content.
 * Non-demo rows without a status are rejected by check.mjs (undefined here).
 */
export function effectiveStatus(status, demo) {
  return status ?? (demo ? 'published' : undefined);
}

/** Classifies a path relative to the content root (posix segments) per spec 2 §4.1. */
export function classify(parts) {
  const yaml = (name) => YAML_FILE.test(name);
  if (parts.length === 1 && parts[0] === 'sources.yaml') return { kind: 'sources' };
  // Diagnostic item bank (spec 4 §3): diagnostic/<lang>/<skill>.yaml.
  if (parts[0] === 'diagnostic') {
    return parts.length === 3 && LANGUAGE_CODES.includes(parts[1]) && yaml(parts[2]) ? { kind: 'diagnostic', lang: parts[1] } : null;
  }
  const [lang, area] = parts;
  if (!LANGUAGE_CODES.includes(lang)) return null;
  if (area === 'items' && parts.length === 3 && yaml(parts[2])) return { kind: 'items', lang };
  if (area !== 'programs' || parts.length < 4) return null;
  const program = parts[2];
  if (parts.length === 4 && parts[3] === 'program.yaml') return { kind: 'program', lang, program };
  if (parts[3] !== 'units' || parts.length < 6) return null;
  const unit = parts[4];
  if (parts.length === 6 && parts[5] === 'unit.yaml') return { kind: 'unit', lang, program, unit };
  if (parts.length === 7 && parts[5] === 'lessons' && yaml(parts[6])) return { kind: 'lesson', lang, program, unit };
  return null;
}

export function formatIssues(error) {
  return error.issues.map((issue) => `${issue.path.length ? issue.path.join('.') : '(root)'}: ${issue.message}`);
}

/**
 * Loads `dir`. `label` is the display prefix for file paths in messages (default: the path of
 * `dir` relative to the cwd, e.g. `content`).
 * Returns { files: [{ file, kind, lang?, program?, unit?, raw, doc, data }], errors: string[] }
 * (`raw`: file text without a BOM, `doc`: parsed YAML, `data`: the schema-validated document).
 * Files that fail YAML parsing or schema validation are reported and left out of `files`.
 */
export function loadContent(dir, { label } = {}) {
  const prefix = (label ?? relative(process.cwd(), dir).split(sep).join('/')) || '.';
  const files = [];
  const errors = [];
  if (!existsSync(dir)) return { label: prefix, files, errors: [`${prefix}: content directory not found`] };

  for (const full of walk(dir)) {
    const parts = relative(dir, full).split(sep);
    const file = `${prefix}/${parts.join('/')}`;
    if (DOC_FILE.test(full)) continue; // README.md and other docs
    if (!YAML_FILE.test(full)) {
      errors.push(`${file}: unexpected file (content/ holds only .yaml/.yml content files and .md docs)`);
      continue;
    }
    const where = classify(parts);
    if (!where) {
      errors.push(`${file}: unexpected file location (see spec 2 §4.1 for the content layout)`);
      continue;
    }
    // An editor-added UTF-8 BOM must not hide the demo header (check.mjs reads `raw`).
    let raw = readFileSync(full, 'utf8');
    if (raw.startsWith(BOM)) raw = raw.slice(BOM.length);
    let doc;
    try {
      doc = parse(raw, { uniqueKeys: true, prettyErrors: true });
    } catch (e) {
      errors.push(`${file}: invalid YAML: ${String(e.message).split('\n')[0]}`);
      continue;
    }
    const result = SCHEMAS[where.kind].safeParse(doc);
    if (!result.success) {
      for (const msg of formatIssues(result.error)) errors.push(`${file}: ${msg}`);
      continue;
    }
    files.push({ file, ...where, raw, doc, data: result.data });
  }
  return { label: prefix, files, errors };
}

/**
 * Groups loaded files into entities and links units → programs and lessons → units by folder.
 * `program`/`unit` are undefined when the parent file is missing (check.mjs reports it).
 */
export function indexContent(files) {
  const sources = [];
  const items = [];
  const programs = [];
  const units = [];
  const lessons = [];
  const programByDir = new Map();
  const unitByDir = new Map();

  for (const f of files) {
    if (f.kind === 'sources') for (const src of f.data.sources) sources.push({ file: f.file, data: src });
    if (f.kind === 'items') {
      const { demo, source, status, reviewed_by, reviewed_at } = f.data;
      const review = { status, reviewed_by, reviewed_at };
      for (const item of f.data.items) items.push({ file: f.file, lang: f.lang, source, demo, review, data: item });
    }
    if (f.kind === 'program') {
      const p = { file: f.file, lang: f.lang, raw: f.raw, data: f.data };
      programs.push(p);
      programByDir.set(`${f.lang}/${f.program}`, p);
    }
  }
  for (const f of files) {
    if (f.kind !== 'unit') continue;
    const u = { file: f.file, lang: f.lang, program: programByDir.get(`${f.lang}/${f.program}`), data: f.data };
    units.push(u);
    unitByDir.set(`${f.lang}/${f.program}/${f.unit}`, u);
  }
  for (const f of files) {
    if (f.kind !== 'lesson') continue;
    const unit = unitByDir.get(`${f.lang}/${f.program}/${f.unit}`);
    lessons.push({ file: f.file, lang: f.lang, unit, program: unit?.program, data: f.data });
  }
  return { sources, items, programs, units, lessons };
}
