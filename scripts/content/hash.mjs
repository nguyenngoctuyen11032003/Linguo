// Canonical JSON (object keys sorted recursively, arrays kept in order) and content hashes.
import { createHash } from 'node:crypto';

/** Review/publication state, not content: changing these must not bump `version`. */
export const NON_CONTENT_FIELDS = ['status', 'is_demo', 'reviewed_by', 'reviewed_at', 'content_hash'];

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) {
      if (value[k] !== undefined) out[k] = sortValue(value[k]);
    }
    return out;
  }
  return value;
}

/** JSON.stringify with recursively sorted object keys (stable across runs and authoring key order). */
export function canonicalJson(value, indent) {
  return JSON.stringify(sortValue(value), null, indent);
}

export function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function contentFields(row) {
  const content = {};
  for (const [k, v] of Object.entries(row)) {
    if (!NON_CONTENT_FIELDS.includes(k)) content[k] = v;
  }
  return content;
}

/**
 * sha256 hex of the row's content fields (review/status fields excluded). `children` (optional)
 * is folded in so that a change in child rows (a lesson's exercises, item links, prerequisites)
 * changes the parent's hash too.
 */
export function hashRow(row, children) {
  const content = contentFields(row);
  return sha256Hex(canonicalJson(children === undefined ? content : { row: content, children }));
}
