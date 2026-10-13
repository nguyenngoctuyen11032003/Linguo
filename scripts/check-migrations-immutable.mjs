#!/usr/bin/env node
// Supabase applies a migration file once and never again, so editing a migration that already reached
// the hosted database silently forks production from a fresh `supabase db reset` (see
// 20261014000600_spec2_sync.sql). supabase/migrations-applied.json records the sha256 of every
// deployed migration; this check fails when a recorded file changes or disappears. New files are fine.
//
// Usage:
//   node scripts/check-migrations-immutable.mjs                 check (CI, `pnpm test`)
//   node scripts/check-migrations-immutable.mjs --record <file…> add deployed files to the manifest
//                                                              (after a successful Deploy; docs/DEPLOY.md)
// MIGRATIONS_DIR / MIGRATIONS_MANIFEST override supabase/migrations and supabase/migrations-applied.json (tests).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.env.MIGRATIONS_DIR || join(root, 'supabase', 'migrations');
// Outside supabase/migrations: the Supabase CLI warns about every non-migration file in that folder.
const manifestPath = process.env.MIGRATIONS_MANIFEST || join(dir, '..', 'migrations-applied.json');

// CRLF is normalised so a Windows checkout (core.autocrlf) hashes like CI.
const sha256 = (file) => createHash('sha256').update(readFileSync(file, 'utf8').replaceAll('\r\n', '\n')).digest('hex');

function readManifest() {
  if (!existsSync(manifestPath)) return {};
  const parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${manifestPath} must be a JSON object { "<file>.sql": "<sha256>" }`);
  }
  return parsed;
}

function check() {
  const manifest = readManifest();
  const errors = [];
  for (const [name, expected] of Object.entries(manifest)) {
    const file = join(dir, name);
    if (!existsSync(file)) {
      errors.push(`${name}: đã deploy nhưng file bị xoá/đổi tên`);
    } else if (sha256(file) !== expected) {
      errors.push(`${name}: đã deploy nhưng nội dung bị sửa`);
    }
  }
  if (errors.length) {
    console.error('Migration đã deploy không được sửa (Supabase không bao giờ áp lại). Hoàn tác thay đổi và tạo migration mới:');
    for (const e of errors) console.error(`  - ${e}`);
    return 1;
  }
  console.log(`OK: ${Object.keys(manifest).length} migration đã deploy không đổi.`);
  return 0;
}

function record(files) {
  if (!files.length) {
    console.error('--record cần ít nhất một file migration');
    return 1;
  }
  const manifest = readManifest();
  for (const arg of files) {
    const name = basename(arg);
    const file = join(dir, name);
    if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(name) || !existsSync(file)) {
      console.error(`Không phải file migration trong ${dir}: ${arg}`);
      return 1;
    }
    const sum = sha256(file);
    if (manifest[name] && manifest[name] !== sum) {
      console.error(`${name}: đã ghi checksum khác; migration đã deploy không được sửa`);
      return 1;
    }
    manifest[name] = sum;
  }
  const sorted = Object.fromEntries(Object.keys(manifest).sort().map((k) => [k, manifest[k]]));
  writeFileSync(manifestPath, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`Đã ghi ${files.length} migration vào ${manifestPath}.`);
  return 0;
}

const args = process.argv.slice(2);
process.exitCode = args[0] === '--record' ? record(args.slice(1)) : check();
