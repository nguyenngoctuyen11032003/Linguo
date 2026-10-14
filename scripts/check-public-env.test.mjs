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

test('rejects any VITE_ name containing SERVICE_ROLE or GEMINI (spec 2 §4.4)', () => {
  for (const name of ['VITE_SUPABASE_SERVICE_ROLE_KEY', 'VITE_service_role', 'VITE_GEMINI_MODEL', 'VITE_USE_GEMINI']) {
    const errors = checkPublicEnv({ ...ok, [name]: 'x' });
    assert.equal(errors.length, 1, name);
    assert.match(errors[0], new RegExp(name));
  }
  // Non-VITE_ server-side variables are not bundled and stay allowed.
  assert.deepEqual(checkPublicEnv({ ...ok, SUPABASE_SERVICE_ROLE_KEY: 'x', GEMINI_API_KEY: 'y', SUPABASE_ACCESS_TOKEN: 'z' }), []);
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

test('VITE_VAPID_PUBLIC_KEY (spec 10 §3): public key allowed, a pasted private key is rejected', () => {
  // 65-byte uncompressed P-256 point, base64url → 87 characters starting with "B".
  const publicKey = `B${'A'.repeat(86)}`;
  assert.deepEqual(checkPublicEnv({ ...ok, VITE_VAPID_PUBLIC_KEY: publicKey }), []);
  assert.deepEqual(checkPublicEnv({ ...ok, VITE_VAPID_PUBLIC_KEY: '' }), []);
  // The 32-byte private key is 43 characters: putting it in VITE_* would publish it.
  const errors = checkPublicEnv({ ...ok, VITE_VAPID_PUBLIC_KEY: 'x'.repeat(43) });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /VITE_VAPID_PUBLIC_KEY/);
  assert.match(checkPublicEnv({ ...ok, VITE_VAPID_PRIVATE_KEY: 'x' })[0], /VITE_VAPID_PRIVATE_KEY/);
});
