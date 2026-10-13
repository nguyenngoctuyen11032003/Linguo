import { describe, expect, it } from 'vitest';
import { reveal } from './motion';

describe('reveal', () => {
  it('uses transforms when motion is allowed', () => {
    const v = reveal('slideLeft', false);
    expect(v.hidden).toMatchObject({ opacity: 0, x: -400 });
    expect(v.shown).toMatchObject({ opacity: 1, x: 0 });
  });

  it('collapses to opacity only when motion is reduced', () => {
    for (const kind of ['slideLeft', 'slideRight', 'blurUp', 'fadeUp', 'speed', 'pop', 'drop'] as const) {
      const v = reveal(kind, true);
      expect(Object.keys(v.hidden as object)).toEqual(['opacity']);
    }
  });
});
