import { describe, expect, it } from 'vitest';
import { appPathFrom } from './app-path';

const ORIGIN = 'https://nam.github.io';

describe('appPathFrom', () => {
  it.each([
    ['https://nam.github.io/Linguo/app/on-tap?x=1#top', '/Linguo/', '/app/on-tap?x=1#top'],
    ['https://nam.github.io/Linguo/app', '/Linguo/', '/app'],
    ['/Linguo/app/phien-hoc', '/Linguo/', '/app/phien-hoc'],
    ['https://nam.github.io/app/on-tap', '/', '/app/on-tap'],
    ['https://nam.github.io/Linguo/app/x', 'https://nam.github.io/Linguo/', '/app/x'],
    ['https://nam.github.io/Linguo/app/x', '/Linguo', '/app/x'],
  ])('%s with base %s -> %s', (url, base, expected) => {
    expect(appPathFrom(url, ORIGIN, base)).toBe(expected);
  });

  it.each([
    ['other origin', 'https://evil.example/Linguo/app/x', '/Linguo/'],
    ['outside base', 'https://nam.github.io/Other/app/x', '/Linguo/'],
    ['outside /app', 'https://nam.github.io/Linguo/dang-nhap', '/Linguo/'],
    ['site root', 'https://nam.github.io/Linguo/', '/Linguo/'],
    ['look-alike prefix', 'https://nam.github.io/Linguo/application/x', '/Linguo/'],
    ['javascript url', 'javascript:alert(1)', '/Linguo/'],
    ['scheme-relative to another host', '//evil.example/Linguo/app', '/Linguo/'],
    ['http downgrade', 'http://nam.github.io/Linguo/app/x', '/Linguo/'],
  ])('falls back to /app for %s', (_n, url, base) => {
    expect(appPathFrom(url, ORIGIN, base)).toBe('/app');
  });

  it('falls back on an unparseable origin-relative url', () => {
    expect(appPathFrom('http://', ORIGIN, '/Linguo/')).toBe('/app');
  });

  it('does not let dot segments escape the base', () => {
    expect(appPathFrom('https://nam.github.io/Linguo/app/../../Other', ORIGIN, '/Linguo/')).toBe('/app');
  });
});
