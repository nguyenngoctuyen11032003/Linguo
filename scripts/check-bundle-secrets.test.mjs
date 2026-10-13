import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanDir, scanText } from './check-bundle-secrets.mjs';

// Fake secrets are assembled at runtime so no key-shaped literal is ever committed (gitleaks).
const googleKey = 'AIza' + 'Sy0_-'.padEnd(35, 'x');
const sbSecret = 'sb_' + 'secret_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P';
const jwt = (payload) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;
const rules = (text) => scanText(text).map((f) => f.rule);

test('clean bundle code passes', () => {
  assert.deepEqual(scanText('const k="sb_publishable_abc";fetch("https://abc.supabase.co/rest/v1/x")'), []);
  // The anon key is a public JWT.
  assert.deepEqual(scanText(`const k="${jwt({ role: 'anon' })}"`), []);
  // supabase-js ships the bare prefix in a key-type check.
  assert.deepEqual(scanText('e.startsWith(`sb_publishable_`)||e.startsWith(`sb_' + 'secret_`)'), []);
  // "AIza" with too few characters is not a key.
  assert.deepEqual(scanText('AIzaShort'), []);
});

test('flags a Google API key', () => {
  assert.deepEqual(rules(`x="${googleKey}"`), ['google-api-key']);
});

test('flags a Supabase secret key', () => {
  assert.deepEqual(rules(`x="${sbSecret}"`), ['supabase-secret-key']);
});

test('flags a service_role JWT even though the word is only base64 inside it', () => {
  const token = jwt({ role: 'service' + '_role', iss: 'supabase' });
  assert.ok(!token.includes('service_role'));
  assert.deepEqual(rules(`x="${token}"`), ['service-role-jwt']);
});

test('flags the plain string service_role', () => {
  assert.deepEqual(rules('rpc({role:"service' + '_role"})'), ['service-role']);
});

test('flags sourceMappingURL comments', () => {
  assert.deepEqual(rules('console.log(1)\n//# sourceMappingURL=index.js.map'), ['source-map-comment']);
});

test('findings are redacted', () => {
  const [f] = scanText(`x="${googleKey}"`);
  assert.ok(!f.sample.includes(googleKey));
  assert.match(f.sample, /^AIzaSy0_…\(39 ký tự\)$/);
});

test('scanDir walks nested files and flags .map files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-secrets-'));
  try {
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<script src="/assets/index.js"></script>');
    writeFileSync(join(dir, 'assets', 'index.js'), `const a="${googleKey}";`);
    writeFileSync(join(dir, 'assets', 'index.js.map'), '{}');
    const findings = scanDir(dir);
    assert.deepEqual(
      findings.map((f) => [f.file, f.rule]).sort(),
      [
        ['assets/index.js', 'google-api-key'],
        ['assets/index.js.map', 'source-map-file'],
      ],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a clean directory has no findings', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-secrets-'));
  try {
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Linguo</title>');
    assert.deepEqual(scanDir(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
