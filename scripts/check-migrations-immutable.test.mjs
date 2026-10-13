import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'scripts', 'check-migrations-immutable.mjs');

const run = (args, dir) =>
  spawnSync(process.execPath, [script, ...args], {
    env: { ...process.env, MIGRATIONS_DIR: dir, MIGRATIONS_MANIFEST: join(dir, 'applied.json') },
    encoding: 'utf8',
  });

const withTmp = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'migrations-'));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const A = '20990101000100_a.sql';
const B = '20990101000200_b.sql';

test('passes without a manifest and with unchanged or new files', () => {
  withTmp((dir) => {
    writeFileSync(join(dir, A), 'create table a ();\n');
    assert.equal(run([], dir).status, 0);
    assert.equal(run(['--record', A], dir).status, 0);
    const manifest = JSON.parse(readFileSync(join(dir, 'applied.json'), 'utf8'));
    assert.deepEqual(Object.keys(manifest), [A]);
    assert.match(manifest[A], /^[0-9a-f]{64}$/);
    writeFileSync(join(dir, B), 'create table b ();\n');
    assert.equal(run([], dir).status, 0, 'a new migration is allowed');
  });
});

test('fails when a recorded migration is edited, renamed or deleted', () => {
  withTmp((dir) => {
    writeFileSync(join(dir, A), 'create table a ();\n');
    assert.equal(run(['--record', A], dir).status, 0);

    writeFileSync(join(dir, A), 'create table a (id int);\n');
    const edited = run([], dir);
    assert.equal(edited.status, 1);
    assert.match(edited.stderr, new RegExp(`${A}: .*sửa`));

    writeFileSync(join(dir, A), 'create table a ();\n');
    renameSync(join(dir, A), join(dir, B));
    const renamed = run([], dir);
    assert.equal(renamed.status, 1);
    assert.match(renamed.stderr, /xoá\/đổi tên/);
  });
});

test('ignores CRLF line endings', () => {
  withTmp((dir) => {
    writeFileSync(join(dir, A), 'select 1;\nselect 2;\n');
    assert.equal(run(['--record', A], dir).status, 0);
    writeFileSync(join(dir, A), 'select 1;\r\nselect 2;\r\n');
    assert.equal(run([], dir).status, 0);
  });
});

test('--record refuses to overwrite a different checksum or a non-migration file', () => {
  withTmp((dir) => {
    writeFileSync(join(dir, A), 'select 1;\n');
    assert.equal(run(['--record', A], dir).status, 0);
    writeFileSync(join(dir, A), 'select 2;\n');
    assert.equal(run(['--record', A], dir).status, 1);
    assert.equal(run(['--record', 'notes.txt'], dir).status, 1);
    assert.equal(run(['--record'], dir).status, 1);
  });
});

test('the repository manifest matches the committed migrations', () => {
  const res = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
});
