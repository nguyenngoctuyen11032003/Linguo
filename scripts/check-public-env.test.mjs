import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPublicEnv } from './check-public-env.mjs';

const jwt = (role) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.sig`;
const ok = { VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_123' };

test('accepts publishable and anon keys', () => {
  assert.deepEqual(checkPublicEnv(ok), []);
  assert.deepEqual(checkPublicEnv({ ...ok, VITE_SUPABASE_PUBLISHABLE_KEY: jwt('anon') }), []);
});

test('rejects secret and service_role keys', () => {
  assert.match(checkPublicEnv({ ...ok, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc' })[0], /SECRET/);
  assert.match(checkPublicEnv({ ...ok, VITE_SUPABASE_PUBLISHABLE_KEY: jwt('service_role') })[0], /service_role/);
});

test('rejects secret-looking VITE_ names', () => {
  const errors = checkPublicEnv({ ...ok, VITE_GEMINI_API_KEY: 'x', VITE_DB_PASSWORD: 'y' });
  assert.equal(errors.length, 2);
});

test('strict mode requires values; non-strict allows empty', () => {
  assert.deepEqual(checkPublicEnv({}), []);
  assert.equal(checkPublicEnv({}, { strict: true }).length, 1);
});

test('rejects non-https URLs', () => {
  assert.match(checkPublicEnv({ ...ok, VITE_SUPABASE_URL: 'http://abc.supabase.co' })[0], /https/);
});

test('rejects half-configured env in any mode', () => {
  const urlOnly = { VITE_SUPABASE_URL: 'https://abc.supabase.co' };
  const keyOnly = { VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_123' };
  for (const strict of [false, true]) {
    assert.match(checkPublicEnv(urlOnly, { strict })[0], /VITE_SUPABASE_PUBLISHABLE_KEY/);
    assert.match(checkPublicEnv(keyOnly, { strict })[0], /VITE_SUPABASE_URL/);
  }
});

test('rejects placeholder and malformed URLs', () => {
  for (const bad of ['https://<project-ref>.supabase.co', 'https://localhost', 'https://abc.supabase.co/rest']) {
    assert.ok(checkPublicEnv({ ...ok, VITE_SUPABASE_URL: bad }).length > 0, bad);
  }
  assert.deepEqual(checkPublicEnv({ ...ok, VITE_SUPABASE_URL: 'https://abc.supabase.co/' }), []);
});

test('JWT key must have role anon explicitly', () => {
  const noRole = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from('{}').toString('base64url')}.sig`;
  assert.ok(checkPublicEnv({ ...ok, VITE_SUPABASE_PUBLISHABLE_KEY: noRole }).length > 0);
  assert.match(checkPublicEnv({ ...ok, VITE_SUPABASE_PUBLISHABLE_KEY: jwt('authenticated') })[0], /authenticated/);
});

test('scans every VITE_ value for secrets', () => {
  assert.match(checkPublicEnv({ ...ok, VITE_SUPABASE_ANON_KEY: 'sb_secret_x' })[0], /sb_secret_/);
  assert.match(checkPublicEnv({ ...ok, VITE_OTHER: jwt('service_role') })[0], /service_role/);
  assert.deepEqual(checkPublicEnv({ ...ok, VITE_OTHER: jwt('anon') }), []);
  assert.deepEqual(checkPublicEnv({ ...ok, VITE_SITE_URL: 'https://x.github.io/Linguo' }), []);
});
