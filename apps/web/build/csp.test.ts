import { createHash } from 'node:crypto';
import type { IndexHtmlTransformHook } from 'vite';
import { describe, expect, it } from 'vitest';
import { buildCsp, cspPlugin, inlineScriptHashes, originOf } from './csp';

const directive = (csp: string, name: string) => csp.split('; ').find((d) => d.startsWith(`${name} `));

describe('buildCsp', () => {
  it('locks scripts to self and allows the Supabase origin for fetch and media', () => {
    const csp = buildCsp({ supabaseUrl: 'https://abc.supabase.co/', scriptHashes: ['sha256-xyz='] });
    expect(directive(csp, 'default-src')).toBe("default-src 'self'");
    expect(directive(csp, 'script-src')).toBe("script-src 'self' 'sha256-xyz='");
    expect(directive(csp, 'connect-src')).toBe("connect-src 'self' https://abc.supabase.co");
    expect(directive(csp, 'media-src')).toBe("media-src 'self' blob: https://abc.supabase.co");
    expect(directive(csp, 'object-src')).toBe("object-src 'none'");
    expect(directive(csp, 'base-uri')).toBe("base-uri 'self'");
    expect(directive(csp, 'form-action')).toBe("form-action 'self'");
    // Spec 10 §4: the service worker (sw.js) and the web app manifest are same-origin files.
    expect(directive(csp, 'worker-src')).toBe("worker-src 'self'");
    expect(directive(csp, 'manifest-src')).toBe("manifest-src 'self'");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
  });

  it('adds the hero video origin to media-src and skips unusable URLs', () => {
    const csp = buildCsp({ supabaseUrl: 'not a url', heroVideoUrl: 'https://cdn.example.com/hero.mp4' });
    expect(directive(csp, 'connect-src')).toBe("connect-src 'self'");
    expect(directive(csp, 'media-src')).toBe("media-src 'self' blob: https://cdn.example.com");
  });

  it('allows recorded listening audio from the Storage bucket (fetched, then played as a blob: URL)', () => {
    const supabaseUrl = 'https://abc.supabase.co';
    const clip = `${supabaseUrl}/storage/v1/object/public/content-audio/ko/ko-${'a'.repeat(32)}.wav`;
    const csp = buildCsp({ supabaseUrl });
    const origin = new URL(clip).origin;
    expect(directive(csp, 'connect-src')?.split(' ')).toContain(origin);
    expect(directive(csp, 'media-src')?.split(' ')).toEqual(expect.arrayContaining([origin, 'blob:']));
  });

  it('allows profile avatars: Supabase Storage public objects and blob: previews in img-src', () => {
    const csp = buildCsp({ supabaseUrl: 'https://abc.supabase.co' });
    expect(directive(csp, 'img-src')).toBe("img-src 'self' blob: https://abc.supabase.co");
    expect(directive(buildCsp({ supabaseUrl: 'not a url' }), 'img-src')).toBe("img-src 'self' blob:");
  });

  it('originOf only accepts http(s) URLs', () => {
    expect(originOf('https://abc.supabase.co/rest/v1')).toBe('https://abc.supabase.co');
    expect(originOf('http://127.0.0.1:54321')).toBe('http://127.0.0.1:54321');
    expect(originOf('javascript:alert(1)')).toBeNull();
    expect(originOf('')).toBeNull();
    expect(originOf(undefined)).toBeNull();
  });
});

describe('inlineScriptHashes', () => {
  it('hashes inline scripts only, exactly as the browser does', () => {
    const body = "\n  (function () { document.documentElement.dataset.theme = 'dark'; })();\n";
    const html = `<script>${body}</script><script type="module" crossorigin src="/assets/index.js"></script>`;
    expect(inlineScriptHashes(html)).toEqual([`sha256-${createHash('sha256').update(body).digest('base64')}`]);
  });
});

describe('cspPlugin', () => {
  const transform = (html: string) => {
    const hook = cspPlugin({ supabaseUrl: 'https://abc.supabase.co' }).transformIndexHtml as { handler: IndexHtmlTransformHook };
    return hook.handler.call({} as never, html, { path: '/index.html', filename: 'index.html' }) as string;
  };

  it('puts the CSP and referrer metas right after <meta charset>, before any script', () => {
    const out = transform('<head>\n<meta charset="UTF-8" />\n<script>var a = 1;</script></head>');
    const csp = out.indexOf('http-equiv="Content-Security-Policy"');
    expect(csp).toBeGreaterThan(out.indexOf('charset'));
    expect(csp).toBeLessThan(out.indexOf('<script>'));
    expect(out).toContain('<meta name="referrer" content="strict-origin-when-cross-origin" />');
    expect(out).toContain(`'sha256-${createHash('sha256').update('var a = 1;').digest('base64')}'`);
    expect(out).toContain("connect-src 'self' https://abc.supabase.co;");
  });

  it('refuses a hand-written CSP meta', () => {
    expect(() => transform('<meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="x">')).toThrow();
  });
});
