import { describe, expect, it } from 'vitest';

// Vitest blanks `.css?raw`, and the web tsconfig has no Node types, hence the narrow local ones (as in
// features/notifications/forbidden-phrases.test.ts). Tests run with apps/web as the working directory.
const fsModule: string = 'node:fs';
const fs = (await import(/* @vite-ignore */ fsModule)) as { readFileSync: (path: string, encoding: 'utf8') => string };
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd();
const css = fs.readFileSync(`${cwd}/src/design/tokens.css`, 'utf8');

type Rgb = [number, number, number];

/** Value of a custom property inside the first block whose selector contains `selector`. */
function token(selector: string, name: string): string {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`selector ${selector} not found`);
  const block = css.slice(start, css.indexOf('}', start));
  const m = block.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`token --${name} not found in ${selector}`);
  return m[1]!.trim();
}

function parse(value: string, backdrop?: Rgb): Rgb {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1]!.slice(i, i + 2), 16)) as Rgb;
  const fn = value.match(/^rgb\((\d+) (\d+) (\d+)(?: \/ ([\d.]+))?\)$/);
  if (!fn) throw new Error(`unsupported colour ${value}`);
  const rgb = [Number(fn[1]), Number(fn[2]), Number(fn[3])] as Rgb;
  const a = fn[4] === undefined ? 1 : Number(fn[4]);
  if (a === 1 || !backdrop) return rgb;
  return rgb.map((v, i) => v * a + backdrop[i]! * (1 - a)) as Rgb;
}

function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('design token contrast', () => {
  for (const [label, selector, pageBg] of [
    ['light', "[data-theme='light']", 'bg'],
    ['dark', "[data-theme='dark']", 'bg'],
  ] as const) {
    describe(label, () => {
      const page = parse(token(selector, pageBg));
      const card = parse(token(selector, 'surface-solid'));
      const border = (backdrop: Rgb) => parse(token(selector, 'input-border'), backdrop);

      it('input border is at least 3:1 on the card and page surfaces (WCAG 1.4.11)', () => {
        expect(contrast(border(card), card)).toBeGreaterThanOrEqual(label === 'dark' ? 3.2 : 3);
        expect(contrast(border(page), page)).toBeGreaterThanOrEqual(3);
      });

      it('muted text is at least 4.5:1 on the neutral disabled surface (WCAG 1.4.3)', () => {
        expect(contrast(parse(token(selector, 'muted')), card)).toBeGreaterThanOrEqual(4.5);
      });
    });
  }
});
