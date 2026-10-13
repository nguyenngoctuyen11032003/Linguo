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
