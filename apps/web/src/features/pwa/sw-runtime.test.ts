import { describe, expect, it } from 'vitest';
import indexHtml from '../../../index.html?raw';
import { OFFLINE_MEDIA_CACHE } from '../offline-media/constants';
import {
  extractFontUrls,
  FONT_FILE_RE,
  FONTS_MAX_ENTRIES,
  isWarmFontsMessage,
  MEDIA_MAX_AGE_SECONDS,
  MEDIA_MAX_ENTRIES,
  PRETENDARD_CSS_URL,
  staleRuntimeCaches,
  SW_MESSAGE_WARM_FONTS,
} from './sw-helpers';
import { CONTENT_AUDIO_CACHE_NAME, CONTENT_AUDIO_MAX_AGE_SECONDS, CONTENT_AUDIO_MAX_ENTRIES } from '../audio/sw-audio';

describe('runtime cache limits (offline learning)', () => {
  it('are generous enough for downloaded lessons', () => {
    expect(CONTENT_AUDIO_MAX_ENTRIES).toBe(400);
    expect(CONTENT_AUDIO_MAX_AGE_SECONDS).toBe(90 * 24 * 60 * 60);
    expect(MEDIA_MAX_ENTRIES).toBe(300);
    expect(MEDIA_MAX_AGE_SECONDS).toBe(30 * 24 * 60 * 60);
    // ~90 Pretendard subsets plus headroom.
    expect(FONTS_MAX_ENTRIES).toBeGreaterThanOrEqual(150);
  });

  it('keeps the downloaded-media cache name stable and distinct from the evicting caches', () => {
    expect(OFFLINE_MEDIA_CACHE).toBe('linguo-offline-media-v1');
    expect(OFFLINE_MEDIA_CACHE).not.toBe(CONTENT_AUDIO_CACHE_NAME);
  });
});

describe('FONT_FILE_RE', () => {
  it('matches font extensions only after a literal dot', () => {
    for (const p of ['/fonts/a.woff2', '/x/b.WOFF', '/c.ttf', '/d.otf']) expect(FONT_FILE_RE.test(p), p).toBe(true);
    for (const p of ['/fonts/awoff2', '/notawoff2', '/x.woff2.map', '/style.css']) expect(FONT_FILE_RE.test(p), p).toBe(false);
  });
});

describe('staleRuntimeCaches', () => {
  const current = ['linguo-media-v1', 'linguo-content-audio-v1', OFFLINE_MEDIA_CACHE];

  it('sweeps only old versioned linguo caches', () => {
    const existing = [
      'linguo-media-v1',
      'linguo-media-v0',
      'linguo-content-audio-v1',
      'linguo-audio-v2',
      'linguo-fonts',
      'linguo-font-css',
      'workbox-precache-v2-https://x/',
      OFFLINE_MEDIA_CACHE,
      'linguo-offline-media-v2',
      'someone-else-v1',
    ];
    expect(staleRuntimeCaches(existing, current)).toEqual(['linguo-media-v0', 'linguo-audio-v2']);
  });

  it('never deletes the current names, whatever their version', () => {
    expect(staleRuntimeCaches(['linguo-media-v2'], ['linguo-media-v2'])).toEqual([]);
    expect(staleRuntimeCaches([], current)).toEqual([]);
  });
});

describe('extractFontUrls', () => {
  it('resolves url() values against the stylesheet, https font files only, deduplicated', () => {
    const css = `
      @font-face { src: url(./split/a.woff2) format("woff2"); }
      @font-face { src: url("./split/b.woff2") format('woff2'), url('./split/b.woff') format('woff'); }
      @font-face { src: url( /abs/c.woff2 ); }
      @font-face { src: url(./split/a.woff2); }
      .x { background: url(./img.png); }
      .y { src: url(data:font/woff2;base64,AAAA); }
      .z { src: url(http://insecure.example/d.woff2); }
    `;
    expect(extractFontUrls(css, 'https://cdn.jsdelivr.net/gh/o/p@v1/dist/web/x.css')).toEqual([
      'https://cdn.jsdelivr.net/gh/o/p@v1/dist/web/split/a.woff2',
      'https://cdn.jsdelivr.net/gh/o/p@v1/dist/web/split/b.woff2',
      'https://cdn.jsdelivr.net/gh/o/p@v1/dist/web/split/b.woff',
      'https://cdn.jsdelivr.net/abs/c.woff2',
    ]);
  });

  it('survives garbage', () => {
    expect(extractFontUrls('url(', PRETENDARD_CSS_URL)).toEqual([]);
    expect(extractFontUrls('', PRETENDARD_CSS_URL)).toEqual([]);
  });
});

describe('warm fonts message', () => {
  it('is recognised by type only', () => {
    expect(isWarmFontsMessage({ type: SW_MESSAGE_WARM_FONTS })).toBe(true);
    expect(isWarmFontsMessage({ type: 'other' })).toBe(false);
    expect(isWarmFontsMessage(null)).toBe(false);
  });

  it('PRETENDARD_CSS_URL is the stylesheet index.html loads (the page and the worker must agree)', () => {
    expect(indexHtml).toContain(`font.href = '${PRETENDARD_CSS_URL}'`);
  });
});
