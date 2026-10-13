#!/usr/bin/env node
// Spec 7 §3: the built site is public. Fail if apps/web/dist contains a Google API key (AIza…),
// a Supabase secret key (sb_secret_…), the string service_role or a JWT whose role is service_role,
// or any source map (.map file or sourceMappingURL comment). Matches are printed redacted.
//
// Usage: node scripts/check-bundle-secrets.mjs [dir]   (default: apps/web/dist)
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RULES = [
  { id: 'google-api-key', pattern: /AIza[0-9A-Za-z_-]{35}/g, message: 'Google API key (AIza…)' },
  // supabase-js itself contains the bare prefix (`sb_secret_` in a startsWith check): require a key body.
  { id: 'supabase-secret-key', pattern: /sb_secret_[0-9A-Za-z_-]{16,}/g, message: 'Supabase secret key (sb_secret_…)' },
  { id: 'service-role', pattern: /service_role/g, message: 'chuỗi "service_role"' },
  { id: 'source-map-comment', pattern: /[#@]\s*sourceMappingURL=/g, message: 'tham chiếu source map (sourceMappingURL)' },
];

const JWT = /eyJ[0-9A-Za-z_-]+\.eyJ[0-9A-Za-z_-]+\.[0-9A-Za-z_-]*/g;

/** First characters only: enough to find the match, never the whole secret in CI logs. */
function redact(value) {
  return `${value.slice(0, 8)}…(${value.length} ký tự)`;
}

function jwtRole(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return typeof payload?.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

/** Findings for one file's text (binary files are read as latin1, which keeps ASCII patterns intact). */
export function scanText(text, file = '') {
  const findings = [];
  for (const rule of RULES) {
    for (const m of text.matchAll(rule.pattern)) {
      findings.push({ file, rule: rule.id, message: rule.message, sample: redact(m[0]) });
    }
  }
  for (const m of text.matchAll(JWT)) {
    if (jwtRole(m[0]) === 'service_role') {
      findings.push({ file, rule: 'service-role-jwt', message: 'JWT có role service_role', sample: redact(m[0]) });
    }
  }
  return findings;
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

export function scanDir(dir) {
  const findings = [];
  for (const path of walk(dir)) {
    const file = relative(dir, path).replace(/\\/g, '/');
    if (file.endsWith('.map')) {
      findings.push({ file, rule: 'source-map-file', message: 'file source map (.map)', sample: file });
      continue;
    }
    findings.push(...scanText(readFileSync(path, 'latin1'), file));
  }
  return findings;
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    const a = realpathSync(process.argv[1]);
    const b = realpathSync(fileURLToPath(import.meta.url));
    return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  const dir = resolve(process.argv[2] ?? 'apps/web/dist');
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    console.error(`::error::Không thấy thư mục build ${dir}. Chạy pnpm build trước.`);
    process.exit(1);
  }
  const findings = scanDir(dir);
  if (findings.length) {
    for (const f of findings) console.error(`::error file=${f.file}::${f.message}: ${f.sample}`);
    console.error(`Bundle có ${findings.length} vấn đề. Secret không bao giờ được vào VITE_* hay mã web; source map phải tắt.`);
    process.exit(1);
  }
  console.log(`Bundle OK: không có secret hay source map trong ${relative(process.cwd(), dir) || dir}.`);
}
