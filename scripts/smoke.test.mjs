// Unit tests for the pure parts of scripts/smoke.mjs: no network.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cspProblems,
  extractAssets,
  formatJson,
  formatResults,
  isJsContentType,
  looksLikeHtml,
  manifestIconUrls,
  manifestProblems,
  runSmoke,
  secretFindings,
  shellProblems,
} from './smoke.mjs';

const CSP = "default-src 'self'; script-src 'self' 'sha256-abc'; object-src 'none'";
const SHELL = `<!doctype html><html><head>
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<link rel="manifest" href="/Linguo/manifest.webmanifest">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=X">
<script type="module" crossorigin src="/Linguo/assets/index-1.js"></script>
<link rel="modulepreload" crossorigin href="/Linguo/assets/vendor-2.js">
<link rel="stylesheet" crossorigin href="/Linguo/assets/index-3.css">
</head><body><div id="root"></div><script>inline()</script></body></html>`;

test('extractAssets finds module scripts, modulepreloads and stylesheets, flags external ones', () => {
  const assets = extractAssets(SHELL, 'https://o.github.io/Linguo/');
  assert.deepEqual(
    assets.map((a) => [a.kind, new URL(a.url).pathname, a.external]),
    [
      ['script', '/Linguo/assets/index-1.js', false],
      ['stylesheet', '/css2', true],
      ['modulepreload', '/Linguo/assets/vendor-2.js', false],
      ['stylesheet', '/Linguo/assets/index-3.css', false],
    ],
  );
});

test('extractAssets ignores classic scripts and de-duplicates', () => {
  const html = '<script src="/a.js"></script><script type="module" src="a.js"></script><script type=module src=a.js></script>';
  assert.equal(extractAssets(html, 'https://h/').length, 1);
});

test('cspProblems accepts a strict CSP and rejects missing or unsafe ones', () => {
  assert.deepEqual(cspProblems(SHELL), []);
  assert.match(cspProblems('<html></html>')[0], /Content-Security-Policy/);
  const unsafe = SHELL.replace("'sha256-abc'", "'unsafe-inline' 'unsafe-eval'");
  assert.deepEqual(cspProblems(unsafe), ["script-src có 'unsafe-inline'", "script-src có 'unsafe-eval'"]);
  const noScript = SHELL.replace(/script-src[^;]*; /, '');
  assert.deepEqual(cspProblems(noScript), ['CSP không có script-src']);
});

test('shellProblems checks root, referrer and module script', () => {
  assert.deepEqual(shellProblems(SHELL), []);
  const bad = shellProblems('<html><body>404 Not Found</body></html>');
  assert.ok(bad.includes('thiếu phần tử #root'));
  assert.ok(bad.includes('thiếu <meta name="referrer">'));
  assert.ok(bad.includes('thiếu <script type="module" src>'));
});

const SITE = 'https://o.github.io/Linguo';
const MANIFEST = {
  name: 'Linguo',
  start_url: './',
  scope: './',
  icons: [{ src: 'icons/icon-192.png' }, { src: 'icons/icon-512.png' }],
};

test('manifestProblems validates name, start_url inside scope and icons', () => {
  assert.deepEqual(manifestProblems(MANIFEST, SITE), []);
  assert.deepEqual(manifestProblems(MANIFEST, `${SITE}/`), []);
  assert.deepEqual(manifestProblems({ ...MANIFEST, name: '' }, SITE), ['thiếu name']);
  assert.ok(manifestProblems({ ...MANIFEST, start_url: '/' }, SITE).includes('start_url nằm ngoài site'));
  assert.ok(manifestProblems({ ...MANIFEST, start_url: '../x' }, SITE).includes('start_url nằm ngoài scope'));
  assert.deepEqual(manifestProblems({ ...MANIFEST, icons: [] }, SITE), ['thiếu icons']);
  assert.deepEqual(manifestProblems([], SITE), ['manifest không phải object JSON']);
});

test('manifestIconUrls resolves against the site base path', () => {
  assert.deepEqual(manifestIconUrls(MANIFEST, SITE), [`${SITE}/icons/icon-192.png`, `${SITE}/icons/icon-512.png`]);
});

test('secretFindings reports rules without printing the match', () => {
  const key = `AIza${'a'.repeat(35)}`;
  const f = secretFindings(`var k="${key}"; //# sourceMappingURL=x.map`, 'a.js');
  assert.deepEqual(f.map((x) => x.rule).sort(), ['google-api-key', 'source-map-comment']);
  assert.ok(f.every((x) => !('sample' in x) && !JSON.stringify(x).includes(key)));
  assert.deepEqual(secretFindings('console.log(1)'), []);
});

test('content-type and HTML helpers', () => {
  assert.ok(isJsContentType('text/javascript; charset=utf-8'));
  assert.ok(isJsContentType('application/javascript'));
  assert.ok(!isJsContentType('text/html'));
  assert.ok(looksLikeHtml('  <!DOCTYPE html><html>'));
  assert.ok(!looksLikeHtml('self.addEventListener("install",()=>{})'));
});

test('formatResults and formatJson', () => {
  const ok = [{ id: 'a', ok: true, detail: 'fine' }];
  const mixed = [...ok, { id: 'b', ok: false, detail: 'broken' }];
  assert.equal(formatResults(ok), 'PASS  a  fine\nSmoke OK: 1/1 kiểm tra đạt.');
  assert.equal(formatResults(mixed), 'PASS  a  fine\nFAIL  b  broken\nSmoke FAIL: 1/2 kiểm tra lỗi.');
  assert.deepEqual(JSON.parse(formatJson(mixed)), { ok: false, total: 2, failed: 1, results: mixed });
});

test('runSmoke with mocked responses: healthy site passes, a broken one fails the right checks', async () => {
  const res = (status, contentType, body = 'x') => ({
    status,
    contentType,
    bytes: body.length,
    text: () => body,
    latin1: () => body,
  });
  const healthy = async (url) => {
    const { pathname } = new URL(url);
    if (url.startsWith('https://sb.test')) {
      if (pathname === '/auth/v1/health') return res(200, 'application/json', '{}');
      if (pathname.startsWith('/functions/')) return res(204, '', '');
      if (pathname.includes('/rpc/')) return res(401, 'application/json', '{}');
      return res(200, 'application/json', '[]');
    }
    if (pathname.endsWith('.map')) return res(404, 'text/html', SHELL);
    if (['/Linguo/', '/Linguo/app', '/Linguo/dang-nhap'].includes(pathname)) {
      return res(pathname === '/Linguo/' ? 200 : 404, 'text/html', SHELL);
    }
    if (pathname === '/Linguo/manifest.webmanifest') return res(200, 'application/manifest+json', JSON.stringify(MANIFEST));
    if (pathname.startsWith('/Linguo/icons/')) return res(200, 'image/png', 'png');
    if (pathname === '/Linguo/sw.js') return res(200, 'text/javascript', 'self.skip()');
    if (pathname.endsWith('.js')) return res(200, 'text/javascript', 'console.log(1)');
    if (pathname.endsWith('.css')) return res(200, 'text/css', 'a{}');
    return res(404, 'text/html', SHELL);
  };
  const cfg = { siteUrl: SITE, supabaseUrl: 'https://sb.test', publishableKey: 'k' };
  const good = await runSmoke({ ...cfg, get: healthy });
  assert.deepEqual(good.filter((r) => !r.ok), []);

  // sw.js falls through to the SPA fallback, a protected table leaks rows, a function is not deployed.
  const broken = async (url, opts) => {
    const { pathname } = new URL(url);
    if (pathname === '/Linguo/sw.js') return res(200, 'text/html', SHELL);
    if (pathname.startsWith('/rest/v1/profiles')) return res(200, 'application/json', '[{"id":"1"}]');
    if (pathname === '/functions/v1/ai-tutor') return res(404, 'application/json', '{}');
    return healthy(url, opts);
  };
  const bad = (await runSmoke({ ...cfg, get: broken })).filter((r) => !r.ok).map((r) => r.id);
  assert.deepEqual(bad.sort(), ['supabase:function:ai-tutor', 'supabase:table-anon', 'sw.js']);
});
