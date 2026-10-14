import { describe, expect, it } from 'vitest';
import raw from '../../../public/manifest.webmanifest?raw';

interface Manifest {
  start_url: string;
  scope: string;
  icons: { src: string }[];
  shortcuts: { name: string; url: string; icons?: { src: string }[] }[];
}

describe('manifest.webmanifest', () => {
  const manifest = JSON.parse(raw) as Manifest;

  it('keeps start_url, scope and icons relative to the manifest (BASE_URL on GitHub Pages)', () => {
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
    for (const icon of manifest.icons) expect(icon.src).not.toMatch(/^\//);
  });

  it('has the "Ôn tập" and "Học tiếp" shortcuts with relative app URLs', () => {
    expect(manifest.shortcuts.map((s) => [s.name, s.url])).toEqual([
      ['Ôn tập', 'app/on-tap'],
      ['Học tiếp', 'app/hoc-tap'],
    ]);
  });
});
