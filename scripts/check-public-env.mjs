#!/usr/bin/env node
// Everything in VITE_* is bundled into public JavaScript. Fail if the Supabase key is not the
// publishable/anon key, or if any VITE_* variable looks like a secret.
//
// Usage: node scripts/check-public-env.mjs [--strict]
//   --strict  require VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (production deploy)
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SECRET_NAME = /SECRET|PASSWORD|SERVICE_ROLE|PRIVATE|DB_URL|DATABASE|GEMINI|ACCESS_TOKEN/i;

export function checkPublicEnv(env, { strict = false } = {}) {
  const errors = [];
  const url = (env.VITE_SUPABASE_URL || '').trim();
  const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();

  if (!url || !key) {
    if (strict) {
      errors.push(
        'VITE_SUPABASE_URL và VITE_SUPABASE_PUBLISHABLE_KEY phải được đặt trong GitHub → Settings → Secrets and variables → Actions → Variables.',
      );
    }
  } else {
    if (!/^https:\/\/[^/\s]+$/.test(url.replace(/\/$/, ''))) {
      errors.push('VITE_SUPABASE_URL phải có dạng https://<project-ref>.supabase.co');
    }
    if (key.startsWith('sb_secret_')) {
      errors.push('VITE_SUPABASE_PUBLISHABLE_KEY đang là SECRET key (sb_secret_…). Chỉ dùng publishable key.');
    } else if (key.startsWith('eyJ')) {
      let role;
      try {
        role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')).role;
      } catch {
        errors.push('VITE_SUPABASE_PUBLISHABLE_KEY không phải JWT hợp lệ.');
      }
      if (role && role !== 'anon') errors.push(`VITE_SUPABASE_PUBLISHABLE_KEY có role "${role}" (service_role?) — chỉ dùng key role "anon".`);
    } else if (!key.startsWith('sb_publishable_')) {
      errors.push('VITE_SUPABASE_PUBLISHABLE_KEY không giống publishable key (sb_publishable_…) hay anon JWT (eyJ…).');
    }
  }

  for (const name of Object.keys(env)) {
    if (name.startsWith('VITE_') && SECRET_NAME.test(name)) {
      errors.push(`${name} trông giống secret nhưng có tiền tố VITE_ → sẽ bị lộ trong bundle.`);
    }
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.CI && existsSync('.env')) process.loadEnvFile('.env');
  const errors = checkPublicEnv(process.env, { strict: process.argv.includes('--strict') });
  if (errors.length) {
    for (const e of errors) console.error(`::error::${e}`);
    process.exit(1);
  }
  console.log('Public env OK (publishable/anon key only).');
}
