// Spec 7 §3: Content-Security-Policy as a <meta http-equiv> (GitHub Pages cannot set response headers).
// Injected at build time so the Supabase origin comes from VITE_SUPABASE_URL. A meta CSP cannot carry
// frame-ancestors, report-uri or sandbox (browsers ignore them there); see docs/RUNBOOK.md.
import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

const GOOGLE_FONTS_CSS = 'https://fonts.googleapis.com';
const GOOGLE_FONTS_FILES = 'https://fonts.gstatic.com';
/** Pretendard (Korean) stylesheet and its woff2 subsets. */
const JSDELIVR = 'https://cdn.jsdelivr.net';

export interface CspOptions {
  /** VITE_SUPABASE_URL: REST, Auth, Edge Functions (and Storage audio, if used). */
  supabaseUrl?: string;
  /** VITE_HERO_VIDEO_URL: optional landing video. */
  heroVideoUrl?: string;
  /** sha256 hashes ('sha256-…') of the inline <script> elements of the page. */
  scriptHashes?: string[];
}

/** `https://host[:port]` of an absolute http(s) URL, or null. */
export function originOf(url: string | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const u = new URL(url.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : null;
  } catch {
    return null;
  }
}

export function buildCsp(o: CspOptions = {}): string {
  const supabase = originOf(o.supabaseUrl);
  const video = originOf(o.heroVideoUrl);
  const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))];
  const directives: [string, string[]][] = [
    ['default-src', ["'self'"]],
    ['script-src', uniq(["'self'", ...(o.scriptHashes ?? []).map((h) => `'${h}'`)])],
    ['style-src', ["'self'", GOOGLE_FONTS_CSS, JSDELIVR]],
    ['font-src', ["'self'", GOOGLE_FONTS_FILES, JSDELIVR]],
    ['img-src', ["'self'"]],
    // blob: lets the speaking practice replay a recording held in memory (never uploaded; see features/speaking).
    ['media-src', uniq(["'self'", 'blob:', supabase, video])],
    // No Realtime channels in the app, so no wss:// origin.
    ['connect-src', uniq(["'self'", supabase])],
    ['manifest-src', ["'self'"]],
    ['worker-src', ["'self'"]],
    ['frame-src', ["'none'"]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
  ];
  return directives.map(([name, values]) => `${name} ${values.join(' ')}`).join('; ');
}

/** sha256 CSP hashes of every inline (no `src`) classic <script> in an HTML document. */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1] ?? '';
    const body = m[2] ?? '';
    if (/\ssrc\s*=/i.test(attrs) || body.length === 0) continue;
    hashes.push(`sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}`);
  }
  return hashes;
}

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/** Build-only: adds the CSP and referrer metas right after <meta charset> (dev keeps Vite's inline HMR styles). */
export function cspPlugin(o: Omit<CspOptions, 'scriptHashes'>): Plugin {
  return {
    name: 'linguo-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        if (/http-equiv=["']?content-security-policy/i.test(html)) {
          throw new Error('index.html already has a CSP meta; it is injected at build time by build/csp.ts');
        }
        const csp = buildCsp({ ...o, scriptHashes: inlineScriptHashes(html) });
        const metas =
          `\n    <meta http-equiv="Content-Security-Policy" content="${escapeAttr(csp)}" />` +
          `\n    <meta name="referrer" content="strict-origin-when-cross-origin" />`;
        const charset = /<meta\s+charset=[^>]*>/i.exec(html);
        if (!charset) throw new Error('index.html needs <meta charset> before the CSP meta');
        const at = charset.index + charset[0].length;
        return html.slice(0, at) + metas + html.slice(at);
      },
    },
  };
}
