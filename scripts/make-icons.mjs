#!/usr/bin/env node
// Builds brand + PWA/iOS icons.  Run: pnpm icons
//
// design/brand/logo-source.png is 1024² RGBA but fully opaque: a grey/white
// checkerboard (≈#D6D6D6 / #F9F9F7) is painted into the pixels, and the logo's own
// outline is *also* near-white (≈#FFFFFF), so a plain "flood-fill the light pixels
// from the border" eats the outline and leaks into the white bubble interiors.
// Instead we work from the coloured pixels (the checkerboard is neutral):
//   1. colour mask  = pixels with real chroma or clearly dark;
//   2. outline      = near-white pixels within OUTLINE_MAX px of the colour mask that are
//                     connected to it through near-white pixels (checker light squares are
//                     ≈#F9F9F7, the outline ≈#FFFFFF, so a high level threshold separates them);
//   3. background   = everything not reachable from inside: flood-fill from the border over
//                     non-logo pixels; enclosed regions are white bubble interiors (kept),
//                     unless they hold checker grey (then they are enclosed backdrop gaps);
//   4. keep the largest connected component (drops the stray sparkle), feather 1px, trim.
// Small icons come from the hand-drawn apps/web/public/brand/logo-mark.svg, because
// the full logo (3 bubbles + EN/KO/VN text) is unreadable at 16–48px.
import sharp from 'sharp';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'design', 'brand', 'logo-source.png');
const PUB = join(root, 'apps', 'web', 'public');
const BRAND = join(PUB, 'brand');
const ICONS = join(PUB, 'icons');
const MARK_SVG = readFileSync(join(BRAND, 'logo-mark.svg'));
const NAVY = '#0B1420';
const CHROMA_MIN = 22; // max(r,g,b) - min(r,g,b) above this => coloured logo pixel
const DARK_MAX = 190; // min(r,g,b) below this => not backdrop (gold/dark antialiasing)
const OUTLINE_MAX = 9; // px: width of the logo's own white outline (≈7-8px in the source)
const HALO = 3; // px next to colour always kept (anti-aliased edge pixels)
const GREY_LEVEL = 238; // neutral pixels below this are checker grey squares, not outline
mkdirSync(ICONS, { recursive: true });

// ---- 1. Full logo cut-out -------------------------------------------------
const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const N = W * H;
const lo = (p) => Math.min(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]);
const spread = (p) => Math.max(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]) - lo(p);

const colour = new Uint8Array(N);
for (let p = 0; p < N; p++) if (spread(p) > CHROMA_MIN || lo(p) < DARK_MAX) colour[p] = 1;

// Distance (px) from every pixel to the nearest colour pixel, 8-neighbour relaxation capped at
// OUTLINE_MAX (anything farther stays 1e9).
const dist = new Float32Array(N).fill(1e9);
{
  let frontier = [];
  for (let p = 0; p < N; p++) if (colour[p]) { dist[p] = 0; frontier.push(p); }
  const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
  const COST = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];
  while (frontier.length) {
    const nextF = [];
    for (const p of frontier) {
      const x = p % W, y = (p / W) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = x + DX[k], ny = y + DY[k];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx, d = dist[p] + COST[k];
        if (d < dist[q] && d <= OUTLINE_MAX) { dist[q] = d; nextF.push(q); }
      }
    }
    frontier = nextF;
  }
}

// Logo = colour + the white outline: every pixel within OUTLINE_MAX of the colour that is not
// a grey checker square (plus a safety halo so anti-aliased edge pixels are never lost).
const logo = new Uint8Array(N);
for (let p = 0; p < N; p++) {
  if (colour[p] || dist[p] <= HALO || (dist[p] <= OUTLINE_MAX && lo(p) >= GREY_LEVEL)) logo[p] = 1;
}

// Background = flood from the border over non-logo pixels.
const bg = new Uint8Array(N);
{
  const stack = [];
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
  while (stack.length) {
    const p = stack.pop();
    if (bg[p] || logo[p]) continue;
    bg[p] = 1;
    const x = p % W, y = (p / W) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < W - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - W);
    if (y < H - 1) stack.push(p + W);
  }
}

// Enclosed non-logo, non-background regions: white bubble interiors (keep) or pockets of
// checkerboard trapped between bubbles (drop). Pockets contain checker grey squares.
{
  const seen = new Uint8Array(N);
  for (let s = 0; s < N; s++) {
    if (bg[s] || logo[s] || seen[s]) continue;
    const comp = [s];
    seen[s] = 1;
    let grey = 0;
    for (let i = 0; i < comp.length; i++) {
      const p = comp[i];
      if (lo(p) < GREY_LEVEL && spread(p) <= CHROMA_MIN) grey++;
      const x = p % W, y = (p / W) | 0;
      for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) {
        if (q >= 0 && !bg[q] && !logo[q] && !seen[q]) {
          seen[q] = 1;
          comp.push(q);
        }
      }
    }
    if (grey / comp.length > 0.02) for (const p of comp) bg[p] = 1;
  }
}

// Heal pin-prick dents along the edge (bg pixels almost surrounded by logo).
for (let pass = 0; pass < 3; pass++) {
  const heal = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const p = y * W + x;
      if (!bg[p]) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && !bg[p + dy * W + dx]) n++;
      if (n >= 6) heal.push(p);
    }
  }
  for (const p of heal) bg[p] = 0;
}

// Keep only the largest connected non-background component (drops stray specks).
const label = new Int32Array(N).fill(-1);
let best = -1, bestSize = 0, next = 0;
for (let p = 0; p < N; p++) {
  if (bg[p] || label[p] !== -1) continue;
  const id = next++;
  let size = 0;
  const queue = [p];
  label[p] = id;
  while (queue.length) {
    const q = queue.pop();
    size++;
    const x = q % W, y = (q / W) | 0;
    for (const n of [x > 0 ? q - 1 : -1, x < W - 1 ? q + 1 : -1, y > 0 ? q - W : -1, y < H - 1 ? q + W : -1]) {
      if (n >= 0 && !bg[n] && label[n] === -1) {
        label[n] = id;
        queue.push(n);
      }
    }
  }
  if (size > bestSize) {
    bestSize = size;
    best = id;
  }
}

const keep = (p) => !bg[p] && label[p] === best;
const out = Buffer.from(data);
let x0 = W, y0 = H, x1 = 0, y1 = 0;
for (let p = 0; p < N; p++) {
  const i = p * 4;
  if (!keep(p)) {
    out[i + 3] = 0;
    continue;
  }
  const x = p % W, y = (p / W) | 0;
  const edge = (x > 0 && !keep(p - 1)) || (x < W - 1 && !keep(p + 1)) || (y > 0 && !keep(p - W)) || (y < H - 1 && !keep(p + W));
  out[i + 3] = edge ? 170 : 255; // 1px feather
  if (x < x0) x0 = x;
  if (x > x1) x1 = x;
  if (y < y0) y0 = y;
  if (y > y1) y1 = y;
}
const pad = 8;
const left = Math.max(0, x0 - pad), top = Math.max(0, y0 - pad);
const fullPng = await sharp(out, { raw: { width: W, height: H, channels: 4 } })
  .extract({ left, top, width: Math.min(W, x1 + pad + 1) - left, height: Math.min(H, y1 + pad + 1) - top })
  .png()
  .toBuffer();
writeFileSync(join(BRAND, 'logo-full.png'), await sharp(fullPng).resize({ height: 512 }).png({ compressionLevel: 9 }).toBuffer());
writeFileSync(join(BRAND, 'logo-full.webp'), await sharp(fullPng).resize({ height: 512 }).webp({ quality: 90 }).toBuffer());

// ---- 2. Icons from the mark ------------------------------------------------
const markAt = (size) => sharp(MARK_SVG, { density: 384 }).resize(size, size).png().toBuffer();
async function onTile(size, frac) {
  const inner = Math.round(size * frac);
  const mark = await markAt(inner);
  const off = Math.round((size - inner) / 2);
  return sharp({ create: { width: size, height: size, channels: 4, background: NAVY } })
    .composite([{ input: mark, left: off, top: off }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}
writeFileSync(join(ICONS, 'icon-192.png'), await markAt(192));
writeFileSync(join(ICONS, 'icon-512.png'), await markAt(512));
writeFileSync(join(ICONS, 'icon-maskable-192.png'), await onTile(192, 0.62)); // inside the 80% safe circle
writeFileSync(join(ICONS, 'icon-maskable-512.png'), await onTile(512, 0.62));
writeFileSync(join(ICONS, 'apple-touch-icon.png'), await onTile(180, 0.72)); // iOS needs an opaque square
const f16 = await markAt(16), f32 = await markAt(32), f48 = await markAt(48);
writeFileSync(join(ICONS, 'favicon-16.png'), f16);
writeFileSync(join(ICONS, 'favicon-32.png'), f32);

// favicon.ico holding PNG-encoded 16/32/48 entries.
const imgs = [[16, f16], [32, f32], [48, f48]];
const head = Buffer.alloc(6);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(imgs.length, 4);
const dir = Buffer.alloc(16 * imgs.length);
let offset = head.length + dir.length;
imgs.forEach(([s, b], k) => {
  const o = k * 16;
  dir[o] = s;
  dir[o + 1] = s;
  dir.writeUInt16LE(1, o + 4);
  dir.writeUInt16LE(32, o + 6);
  dir.writeUInt32LE(b.length, o + 8);
  dir.writeUInt32LE(offset, o + 12);
  offset += b.length;
});
writeFileSync(join(PUB, 'favicon.ico'), Buffer.concat([head, dir, ...imgs.map(([, b]) => b)]));
console.log('Brand assets written to apps/web/public/{brand,icons} and favicon.ico');
