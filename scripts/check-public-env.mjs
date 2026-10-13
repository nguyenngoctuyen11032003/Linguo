#!/usr/bin/env node
// Everything in VITE_* is bundled into public JavaScript. Fail if the Supabase key is not the
// publishable/anon key, or if any VITE_* variable looks like a secret (names containing
// SERVICE_ROLE or GEMINI always fail: spec 2 §4.4).
//
// Usage: node scripts/check-public-env.mjs [--strict]
//   --strict  require VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (production deploy)
//   (any mode) setting only one of the two is always an error (half-filled template).
import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SECRET_NAME = /SECRET|PASSWORD|SERVICE_ROLE|PRIVATE|DB_URL|DATABASE|GEMINI|ACCESS_TOKEN/i;
const URL_PATTERN = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?$/i;
const KEY_NAME = 'VITE_SUPABASE_PUBLISHABLE_KEY';

// Returns null when `value` is not shaped like a JWT (eyJ… with 3 segments); otherwise
// { role, invalid } where role is undefined when the payload has no string role.
function parseJwt(value) {
  const parts = value.split('.');
  if (!value.startsWith('eyJ') || parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return { role: typeof payload?.role === 'string' ? payload.role : undefined, invalid: false };
  } catch {
    return { role: undefined, invalid: true };
  }
}

export function checkPublicEnv(env, { strict = false } = {}) {
  const errors = [];
  const url = (env.VITE_SUPABASE_URL || '').trim();
  const key = (env[KEY_NAME] || '').trim();

  if (!url && !key) {
    if (strict) {
      errors.push(
        'VITE_SUPABASE_URL và VITE_SUPABASE_PUBLISHABLE_KEY phải được đặt trong GitHub → Settings → Secrets and variables → Actions → Variables.',
      );
    }
  } else if (!url || !key) {
    errors.push(
      `Chỉ đặt một trong hai: ${url ? 'thiếu VITE_SUPABASE_PUBLISHABLE_KEY' : 'thiếu VITE_SUPABASE_URL'}. Phải đặt cả VITE_SUPABASE_URL và VITE_SUPABASE_PUBLISHABLE_KEY (hoặc để trống cả hai).`,
    );
  }

  if (url && !URL_PATTERN.test(url.replace(/\/$/, ''))) {
    errors.push('VITE_SUPABASE_URL phải có dạng https://<project-ref>.supabase.co (thay <project-ref> bằng giá trị thật).');
  }

  if (key) {
    if (key.startsWith('sb_secret_')) {
      errors.push('VITE_SUPABASE_PUBLISHABLE_KEY đang là SECRET key (sb_secret_…). Chỉ dùng publishable key.');
    } else if (key.startsWith('eyJ')) {
      const jwt = parseJwt(key);
      if (!jwt || jwt.invalid) {
        errors.push('VITE_SUPABASE_PUBLISHABLE_KEY không phải JWT hợp lệ.');
      } else if (jwt.role !== 'anon') {
        errors.push(
          `VITE_SUPABASE_PUBLISHABLE_KEY có role ${jwt.role ? `"${jwt.role}"` : '(không có)'} (service_role?) — chỉ dùng key role "anon".`,
        );
      }
    } else if (!key.startsWith('sb_publishable_')) {
      errors.push('VITE_SUPABASE_PUBLISHABLE_KEY không giống publishable key (sb_publishable_…) hay anon JWT (eyJ…).');
    }
  }

  for (const [name, raw] of Object.entries(env)) {
    if (!name.startsWith('VITE_')) continue;
    if (SECRET_NAME.test(name)) {
      errors.push(`${name} trông giống secret nhưng có tiền tố VITE_ → sẽ bị lộ trong bundle.`);
    }
    if (name === KEY_NAME) continue; // already validated above
    const value = String(raw ?? '').trim();
    if (value.includes('sb_secret_')) {
      errors.push(`${name} chứa Supabase SECRET key (sb_secret_…) → sẽ bị lộ trong bundle.`);
    } else {
      const jwt = parseJwt(value);
      if (jwt && jwt.role !== 'anon') {
        errors.push(`${name} là JWT có role ${jwt.role ? `"${jwt.role}"` : '(không có)'} — chỉ JWT role "anon" được phép trong VITE_*.`);
      }
    }
  }
  return errors;
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
  if (!process.env.CI && existsSync('.env')) process.loadEnvFile('.env');
  const errors = checkPublicEnv(process.env, { strict: process.argv.includes('--strict') });
  if (errors.length) {
    for (const e of errors) console.error(`::error::${e}`);
    process.exit(1);
  }
  console.log('Public env OK (publishable/anon key only).');
}
