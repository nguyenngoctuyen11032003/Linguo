#!/usr/bin/env node
// Post-deploy production smoke check (docs/RUNBOOK.md → "Kiểm tra sau deploy (smoke)").
// Zero dependencies, Node 22. Read-only: never calls anything that spends AI quota, sends a notification or
// returns user data, and never prints response bodies or secrets.
//
//   SITE_URL=https://<owner>.github.io/<repo> SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_PUBLISHABLE_KEY=sb_publishable_… node scripts/smoke.mjs [--json]
//
// Exit codes: 0 all checks passed, 1 at least one check failed, 2 missing configuration.
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scanText } from './check-bundle-secrets.mjs';

/** Results are `{ id, ok, detail }`. */
const pass = (id, detail) => ({ id, ok: true, detail });
const fail = (id, detail) => ({ id, ok: false, detail });

// ---------------------------------------------------------------------------------------------------------------
// Pure helpers (unit-tested in smoke.test.mjs)
// ---------------------------------------------------------------------------------------------------------------

/** Value of an attribute in a tag's attribute string, or null. */
function attr(attrs, name) {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(attrs);
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null;
}

/**
 * Assets referenced by an HTML document: module scripts, modulepreload links and stylesheets.
 * URLs are resolved against `pageUrl`; `external` is true when the origin differs from the page's.
 */
export function extractAssets(html, pageUrl) {
  const origin = new URL(pageUrl).origin;
  const found = [];
  const add = (kind, ref) => {
    if (!ref) return;
    let url;
    try {
      url = new URL(ref, pageUrl);
    } catch {
      return;
    }
    if (!/^https?:$/.test(url.protocol)) return;
    if (found.some((a) => a.url === url.href)) return;
    found.push({ kind, url: url.href, external: url.origin !== origin });
  };
  for (const m of html.matchAll(/<script\b([^>]*)>/gi)) {
    if ((attr(m[1], 'type') ?? '').toLowerCase() === 'module') add('script', attr(m[1], 'src'));
  }
  for (const m of html.matchAll(/<link\b([^>]*)>/gi)) {
    const rel = (attr(m[1], 'rel') ?? '').toLowerCase().split(/\s+/);
    if (rel.includes('modulepreload')) add('modulepreload', attr(m[1], 'href'));
    else if (rel.includes('stylesheet')) add('stylesheet', attr(m[1], 'href'));
  }
  return found;
}

/** `<meta key=value>` content, or null. */
function metaContent(html, key, value) {
  for (const m of html.matchAll(/<meta\b([^>]*)>/gi)) {
    if ((attr(m[1], key) ?? '').toLowerCase() === value.toLowerCase()) return attr(m[1], 'content');
  }
  return null;
}

/** Problems with the page's CSP meta (empty list = fine). */
export function cspProblems(html) {
  const csp = metaContent(html, 'http-equiv', 'Content-Security-Policy');
  if (csp === null) return ['thiếu <meta http-equiv="Content-Security-Policy">'];
  const problems = [];
  const script = csp
    .split(';')
    .map((d) => d.trim())
    .find((d) => d.toLowerCase().startsWith('script-src '));
  if (!script) return ['CSP không có script-src'];
  const sources = script.split(/\s+/).slice(1);
  if (!sources.includes("'self'")) problems.push("script-src thiếu 'self'");
  if (sources.includes("'unsafe-inline'")) problems.push("script-src có 'unsafe-inline'");
  if (sources.includes("'unsafe-eval'")) problems.push("script-src có 'unsafe-eval'");
  return problems;
}

/** Problems with the app shell HTML: root element, CSP, referrer policy, at least one module script. */
export function shellProblems(html) {
  const problems = [];
  if (!/\bid\s*=\s*["']?root["']?[\s>]/i.test(html)) problems.push('thiếu phần tử #root');
  problems.push(...cspProblems(html));
  if (!metaContent(html, 'name', 'referrer')) problems.push('thiếu <meta name="referrer">');
  if (!extractAssets(html, 'https://x.invalid/').some((a) => a.kind === 'script')) {
    problems.push('thiếu <script type="module" src>');
  }
  return problems;
}

/** True when a body looks like an HTML document (SPA fallback served where a file was expected). */
export function looksLikeHtml(body) {
  return /^\s*(?:<!doctype\s+html|<html[\s>])/i.test(body);
}

/** Problems with a parsed web manifest, relative to the site root URL (`https://host/base`). */
export function manifestProblems(manifest, siteUrl) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return ['manifest không phải object JSON'];
  const problems = [];
  if (typeof manifest.name !== 'string' || !manifest.name.trim()) problems.push('thiếu name');
  const base = new URL(`${siteUrl.replace(/\/+$/, '')}/`);
  if (typeof manifest.start_url !== 'string' || !manifest.start_url) {
    problems.push('thiếu start_url');
  } else {
    const scope = new URL(typeof manifest.scope === 'string' && manifest.scope ? manifest.scope : '.', base);
    const start = new URL(manifest.start_url, base);
    if (start.origin !== scope.origin || !start.pathname.startsWith(scope.pathname)) {
      problems.push('start_url nằm ngoài scope');
    }
    if (start.origin !== base.origin || !start.pathname.startsWith(base.pathname)) {
      problems.push('start_url nằm ngoài site');
    }
  }
  if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) problems.push('thiếu icons');
  else if (manifest.icons.some((i) => !i || typeof i.src !== 'string' || !i.src)) problems.push('icon thiếu src');
  return problems;
}

/** Absolute URLs of the manifest's icons. */
export function manifestIconUrls(manifest, siteUrl) {
  const base = new URL(`${siteUrl.replace(/\/+$/, '')}/`);
  return (Array.isArray(manifest?.icons) ? manifest.icons : [])
    .filter((i) => i && typeof i.src === 'string' && i.src)
    .map((i) => new URL(i.src, base).href);
}

/** Secret / source-map findings of served text; same rules as check-bundle-secrets.mjs. Samples are dropped. */
export function secretFindings(text, file = '') {
  return scanText(text, file).map(({ file: f, rule, message }) => ({ file: f, rule, message }));
}

export function isJsContentType(ct) {
  return /^(?:application|text)\/(?:x-)?(?:javascript|ecmascript)\b/i.test(ct ?? '');
}

export function isCssContentType(ct) {
  return /^text\/css\b/i.test(ct ?? '');
}

/** A single status line per result, plus a summary line. */
export function formatResults(results) {
  const lines = results.map((r) => `${r.ok ? 'PASS' : 'FAIL'}  ${r.id}  ${r.detail}`);
  const failed = results.filter((r) => !r.ok).length;
  lines.push(
    failed === 0
      ? `Smoke OK: ${results.length}/${results.length} kiểm tra đạt.`
      : `Smoke FAIL: ${failed}/${results.length} kiểm tra lỗi.`,
  );
  return lines.join('\n');
}

export function formatJson(results) {
  const failed = results.filter((r) => !r.ok).length;
  return JSON.stringify({ ok: failed === 0, total: results.length, failed, results }, null, 2);
}

// ---------------------------------------------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------------------------------------------

/** fetch with a timeout and retries (network errors, 429 and 5xx). Never throws: returns `{ error }` instead. */
export async function request(
  url,
  { method = 'GET', headers = {}, body, timeoutMs = 15_000, retries = 2, retryDelayMs = 1_500 } = {},
) {
  let last = { error: 'không có phản hồi' };
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, retryDelayMs * attempt));
    try {
      const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
      const buf = Buffer.from(await res.arrayBuffer());
      last = {
        status: res.status,
        contentType: res.headers.get('content-type') ?? '',
        bytes: buf.length,
        text: () => buf.toString('utf8'),
        latin1: () => buf.toString('latin1'),
      };
      if (res.status !== 429 && res.status < 500) return last;
    } catch (e) {
      last = { error: e?.name === 'TimeoutError' ? `quá ${timeoutMs}ms` : (e?.cause?.code ?? e?.message ?? 'lỗi mạng') };
    }
  }
  return last;
}

const describe = (res) => (res.error ? `lỗi mạng: ${res.error}` : `HTTP ${res.status}`);

async function frontendChecks(siteUrl, get) {
  const results = [];
  const site = siteUrl.replace(/\/+$/, '');
  const basePath = new URL(`${site}/`).pathname;
  const url = (path) => `${site}${path}`;

  // (a) pages
  let indexHtml = null;
  const home = await get(`${site}/`);
  if (home.error || home.status !== 200) {
    results.push(fail('page:/', describe(home)));
  } else {
    indexHtml = home.text();
    const p = shellProblems(indexHtml);
    results.push(p.length ? fail('page:/', p.join('; ')) : pass('page:/', 'HTTP 200, #root, CSP, referrer'));
  }
  // GitHub Pages serves unknown paths (every SPA route) from 404.html: status 404 with the shell body is the
  // expected, working behaviour (vite.config.ts spaFallback copies index.html to 404.html). 200 is fine too.
  for (const path of ['/dang-nhap', '/app']) {
    const res = await get(url(path));
    if (res.error || (res.status !== 200 && res.status !== 404)) {
      results.push(fail(`deeplink:${path}`, describe(res)));
      continue;
    }
    const p = shellProblems(res.text());
    results.push(
      p.length
        ? fail(`deeplink:${path}`, `HTTP ${res.status} nhưng không phải app shell: ${p.join('; ')}`)
        : pass(`deeplink:${path}`, `HTTP ${res.status}, trả app shell`),
    );
  }

  // (b) assets referenced by index.html
  const jsTexts = [];
  if (indexHtml) {
    const assets = extractAssets(indexHtml, `${site}/`);
    const own = assets.filter((a) => !a.external);
    if (!own.some((a) => a.kind === 'script')) {
      results.push(fail('assets', 'không có module script cùng origin trong index.html'));
    }
    const bad = [];
    for (const a of own) {
      const res = await get(a.url);
      const path = new URL(a.url).pathname.slice(basePath.length);
      const isCss = a.kind === 'stylesheet';
      if (res.error || res.status !== 200) bad.push(`${path}: ${describe(res)}`);
      else if (res.bytes === 0) bad.push(`${path}: body rỗng`);
      else if (isCss ? !isCssContentType(res.contentType) : !isJsContentType(res.contentType)) {
        bad.push(`${path}: content-type "${res.contentType}"`);
      } else if (!isCss) jsTexts.push({ file: path, text: res.latin1() });
    }
    results.push(
      bad.length
        ? fail('assets', bad.join(' | '))
        : pass('assets', `${own.length} file (script/modulepreload/css) HTTP 200, đúng content-type`),
    );
    const ext = assets.length - own.length;
    if (ext) results.push(pass('assets:external', `${ext} tài nguyên ngoài (Google Fonts…) không kiểm tra`));
  }

  // (c) manifest
  const mres = await get(url('/manifest.webmanifest'));
  if (mres.error || mres.status !== 200) {
    results.push(fail('manifest', describe(mres)));
  } else {
    let manifest = null;
    try {
      manifest = JSON.parse(mres.text());
    } catch {
      /* reported below */
    }
    const problems = manifest === null ? ['không phải JSON hợp lệ'] : manifestProblems(manifest, site);
    if (problems.length) {
      results.push(fail('manifest', problems.join('; ')));
    } else {
      const badIcons = [];
      for (const iconUrl of manifestIconUrls(manifest, site)) {
        const r = await get(iconUrl);
        if (r.error || r.status !== 200 || r.bytes === 0 || !/^image\//i.test(r.contentType)) {
          badIcons.push(`${new URL(iconUrl).pathname}: ${r.error ? describe(r) : `HTTP ${r.status} ${r.contentType}`}`);
        }
      }
      results.push(
        badIcons.length
          ? fail('manifest', `icon không tải được: ${badIcons.join(' | ')}`)
          : pass('manifest', 'JSON hợp lệ, start_url trong scope, icon tải được'),
      );
    }
  }

  // (d) service worker
  const sw = await get(url('/sw.js'));
  if (sw.error || sw.status !== 200) results.push(fail('sw.js', describe(sw)));
  else if (!isJsContentType(sw.contentType)) results.push(fail('sw.js', `content-type "${sw.contentType}"`));
  else if (sw.bytes === 0 || looksLikeHtml(sw.text())) results.push(fail('sw.js', 'body rỗng hoặc là HTML (SPA fallback)'));
  else {
    results.push(pass('sw.js', 'HTTP 200, JavaScript'));
    jsTexts.push({ file: 'sw.js', text: sw.latin1() });
  }

  // (f) secrets and source maps in served JS
  if (jsTexts.length) {
    const findings = jsTexts.flatMap((j) => secretFindings(j.text, j.file));
    const maps = [];
    for (const j of jsTexts) {
      const r = await get(url(`/${j.file}.map`));
      if (!r.error && r.status === 200 && !looksLikeHtml(r.text())) maps.push(`${j.file}.map`);
    }
    const msgs = [...findings.map((f) => `${f.file}: ${f.message}`), ...maps.map((m) => `${m}: source map được phục vụ`)];
    results.push(
      msgs.length
        ? fail('bundle-secrets', msgs.join(' | '))
        : pass('bundle-secrets', `${jsTexts.length} file JS: không secret, không source map`),
    );
  } else {
    results.push(fail('bundle-secrets', 'không có JS nào để quét'));
  }
  return results;
}

async function backendChecks(supabaseUrl, key, get) {
  const results = [];
  const base = supabaseUrl.replace(/\/+$/, '');
  const apikey = { apikey: key };

  // (g) reachability
  const health = await get(`${base}/auth/v1/health`, { headers: apikey });
  results.push(
    !health.error && health.status === 200
      ? pass('supabase:auth-health', 'HTTP 200')
      : fail('supabase:auth-health', describe(health)),
  );

  // OPTIONS never runs the function body; 404 = not deployed.
  for (const fn of ['ai-tutor', 'notify-dispatch']) {
    const res = await get(`${base}/functions/v1/${fn}`, {
      method: 'OPTIONS',
      headers: { ...apikey, origin: 'https://smoke.invalid', 'access-control-request-method': 'POST' },
    });
    const ok = !res.error && [200, 204, 400, 401, 403, 405].includes(res.status);
    results.push(
      ok
        ? pass(`supabase:function:${fn}`, `đã deploy (HTTP ${res.status})`)
        : fail(`supabase:function:${fn}`, `${describe(res)}${res.status === 404 ? ' (chưa deploy)' : ''}`),
    );
  }

  // (h) exposure: anonymous callers must be refused
  const rpc = await get(`${base}/rest/v1/rpc/export_my_data`, {
    method: 'POST',
    headers: { ...apikey, 'content-type': 'application/json' },
    body: '{}',
  });
  results.push(
    !rpc.error && (rpc.status === 401 || rpc.status === 403)
      ? pass('supabase:rpc-anon', `export_my_data bị từ chối khi ẩn danh (HTTP ${rpc.status})`)
      : fail('supabase:rpc-anon', `export_my_data ẩn danh phải 401/403, nhận ${describe(rpc)}`),
  );
  const prof = await get(`${base}/rest/v1/profiles?select=id&limit=1`, { headers: apikey });
  if (prof.error) results.push(fail('supabase:table-anon', describe(prof)));
  else if (prof.status === 401 || prof.status === 403) {
    results.push(pass('supabase:table-anon', `profiles bị từ chối khi ẩn danh (HTTP ${prof.status})`));
  } else if (prof.status === 200) {
    let rows = null;
    try {
      const parsed = JSON.parse(prof.text());
      rows = Array.isArray(parsed) ? parsed.length : null;
    } catch {
      /* rows stays null */
    }
    results.push(
      rows === 0
        ? pass('supabase:table-anon', 'profiles ẩn danh trả 0 dòng')
        : fail('supabase:table-anon', rows === null ? 'phản hồi 200 không đọc được' : `profiles ẩn danh trả ${rows} dòng (lộ dữ liệu)`),
    );
  } else results.push(fail('supabase:table-anon', describe(prof)));
  return results;
}

export async function runSmoke({ siteUrl, supabaseUrl, publishableKey, get = request }) {
  return [...(await frontendChecks(siteUrl, get)), ...(await backendChecks(supabaseUrl, publishableKey, get))];
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
  const json = process.argv.includes('--json');
  const siteUrl = process.env.SITE_URL?.trim();
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  const missing = [
    ['SITE_URL', siteUrl],
    ['SUPABASE_URL', supabaseUrl],
    ['SUPABASE_PUBLISHABLE_KEY', publishableKey],
  ]
    .filter(([, v]) => !v)
    .map(([n]) => n);
  if (missing.length) {
    console.error(`Thiếu biến môi trường: ${missing.join(', ')}`);
    process.exit(2);
  }
  const results = await runSmoke({ siteUrl, supabaseUrl, publishableKey });
  console.log(json ? formatJson(results) : formatResults(results));
  process.exit(results.some((r) => !r.ok) ? 1 : 0);
}
