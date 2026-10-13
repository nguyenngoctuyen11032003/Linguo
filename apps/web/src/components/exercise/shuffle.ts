/** FNV-1a 32-bit hash of a string, used as the PRNG seed. */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: small deterministic PRNG returning floats in [0, 1). */
function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates shuffle with a seed, so an exercise keeps the same option order across renders and reloads. */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const out = [...items];
  const rand = mulberry32(hash(seed));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Seeded shuffle that never returns the authored order (when there are at least two items): word_bank tokens are
 * written in answer order, so showing them unshuffled would give the answer away.
 */
export function seededShuffleAway<T>(items: readonly T[], seed: string): T[] {
  if (items.length < 2) return [...items];
  for (let attempt = 0; attempt < 8; attempt++) {
    const out = seededShuffle(items, attempt === 0 ? seed : `${seed}#${attempt}`);
    if (out.some((item, i) => item !== items[i])) return out;
  }
  return [...items].reverse();
}
