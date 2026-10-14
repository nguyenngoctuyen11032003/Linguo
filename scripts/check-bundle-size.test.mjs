import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUDGETS, checkGraph, htmlEntries, initialGraph, staticImports } from './check-bundle-size.mjs';

const HTML = `<!doctype html><html><head>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=X">
<script type="module" crossorigin src="/linguo/assets/index-AAA.js"></script>
<link rel="modulepreload" crossorigin href="/linguo/assets/v-react-BBB.js">
<link rel="stylesheet" crossorigin href="/linguo/assets/index-CCC.css">
</head><body><script>var inline=1</script></body></html>`;

/** Incompressible text so gzip size ~ raw size. */
const noise = (n) => Array.from({ length: n }, (_, i) => ((i * 2654435761) >>> 0).toString(36)).join('');

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-size-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), HTML);
  for (const [name, code] of Object.entries(files)) writeFileSync(join(dir, 'assets', name), code);
  return dir;
}

test('htmlEntries lists module scripts and modulepreloads, not stylesheets or inline scripts', () => {
  assert.deepEqual(htmlEntries(HTML), ['/linguo/assets/index-AAA.js', '/linguo/assets/v-react-BBB.js']);
});

test('staticImports follows from/import specifiers but not dynamic imports', () => {
  const code = 'import{a as b}from"./v-react-BBB.js";import"./side-DDD.js";export{x}from"./re-EEE.js";const l=()=>import("./Lesson-FFF.js");';
  assert.deepEqual(staticImports(code).sort(), ['./re-EEE.js', './side-DDD.js', './v-react-BBB.js']);
});

test('initialGraph walks static imports transitively and ignores lazy chunks', () => {
  const dir = fixture({
    'index-AAA.js': 'import{r}from"./v-react-BBB.js";import("./LessonPage-ZZZ.js");',
    'v-react-BBB.js': 'import"./runtime-CCC.js";export const r=1;',
    'runtime-CCC.js': 'export const x=1;',
    'LessonPage-ZZZ.js': 'import"./only-lazy-YYY.js";',
    'only-lazy-YYY.js': 'export const y=1;',
  });
  try {
    const graph = initialGraph(dir);
    assert.equal(graph.entryFile, 'assets/index-AAA.js');
    assert.deepEqual(graph.chunks.map((c) => c.file).sort(), ['assets/index-AAA.js', 'assets/runtime-CCC.js', 'assets/v-react-BBB.js']);
    assert.deepEqual(checkGraph(graph), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('flags a chunk that must stay lazy once it is imported statically', () => {
  const dir = fixture({
    'index-AAA.js': 'import"./v-react-BBB.js";import"./admin-routes-XXX.js";',
    'v-react-BBB.js': 'export const r=1;',
    'admin-routes-XXX.js': 'export const a=1;',
  });
  try {
    const problems = checkGraph(initialGraph(dir));
    assert.equal(problems.length, 1);
    assert.match(problems[0], /admin-routes-XXX\.js.*tải theo yêu cầu/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('flags an entry chunk and a total over budget', () => {
  const dir = fixture({
    'index-AAA.js': `import"./v-react-BBB.js";export const n="${noise(8000)}";`,
    'v-react-BBB.js': `export const n="${noise(8000)}";`,
  });
  try {
    const graph = initialGraph(dir);
    assert.deepEqual(checkGraph(graph, { entryChunkGzip: 1e6, initialJsGzip: 1e6 }), []);
    const entryOnly = checkGraph(graph, { entryChunkGzip: 100, initialJsGzip: 1e6 });
    assert.equal(entryOnly.length, 1);
    assert.match(entryOnly[0], /Chunk entry assets\/index-AAA\.js .*vượt ngân sách/);
    const both = checkGraph(graph, { entryChunkGzip: 100, initialJsGzip: 100 });
    assert.equal(both.length, 2);
    assert.match(both[1], /JS tải đầu tiên .*2 chunk/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the budgets are positive and the total allows for the entry chunk', () => {
  assert.ok(BUDGETS.entryChunkGzip > 0);
  assert.ok(BUDGETS.initialJsGzip > BUDGETS.entryChunkGzip);
});
