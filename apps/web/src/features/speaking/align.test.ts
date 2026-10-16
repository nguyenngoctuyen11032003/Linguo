import { describe, expect, it } from 'vitest';
import { alignToTarget, isNearMatch, joinUnits, practiceTargets, units, type Alignment } from './align';
import { tokenize } from './overlap';

/** Compact view: "word" matched, "~word(heard)" near, "?word(heard)" mis-heard, "-word" missed. */
function marks(a: Alignment | null): string[] {
  return (a?.target ?? []).map((m) =>
    m.kind === 'match' ? m.text : m.kind === 'near' ? `~${m.text}(${m.heard})` : m.kind === 'misheard' ? `?${m.text}(${m.heard})` : `-${m.text}`,
  );
}

describe('units', () => {
  it('keeps the written form and compares lowercase, without punctuation', () => {
    expect(units('Good morning, how are you?')).toEqual([
      { text: 'Good', norm: 'good', cjk: false },
      { text: 'morning', norm: 'morning', cjk: false },
      { text: 'how', norm: 'how', cjk: false },
      { text: 'are', norm: 'are', cjk: false },
      { text: 'you', norm: 'you', cjk: false },
    ]);
  });
  it('agrees with tokenize for space-separated text', () => {
    for (const s of ["I’m fine, it's OK.", '안녕하세요? 저는 민아입니다.', "rock 'n' roll"]) {
      expect(units(s).map((u) => u.norm)).toEqual(tokenize(s));
    }
  });
  it('splits kana and Han into characters but keeps Latin and digits together', () => {
    expect(units('私はTomです。').map((u) => [u.text, u.cjk])).toEqual([
      ['私', true],
      ['は', true],
      ['Tom', false],
      ['で', true],
      ['す', true],
    ]);
  });
  it('keeps Hangul as whole words', () => {
    expect(units('학교에 가요').map((u) => u.cjk)).toEqual([false, false]);
  });
});

describe('isNearMatch', () => {
  it('treats Korean words with the same stem and another particle or ending as near', () => {
    expect(isNearMatch('저는', '저도')).toBe(true);
    expect(isNearMatch('학교에', '학교에서')).toBe(true);
    expect(isNearMatch('안녕하세요', '안녕하십니까')).toBe(true);
  });
  it('treats a one-syllable or small jamo slip in Korean as near', () => {
    expect(isNearMatch('갔어요', '갓어요')).toBe(true);
    expect(isNearMatch('감사합니다', '감사함니다')).toBe(true);
  });
  it('does not treat different Korean words as near', () => {
    expect(isNearMatch('먹어요', '마셔요')).toBe(false);
    expect(isNearMatch('가', '나')).toBe(false);
    expect(isNearMatch('물', '물')).toBe(false);
  });
  it('treats short English endings and one-letter slips in long words as near', () => {
    expect(isNearMatch('cup', 'cups')).toBe(true);
    expect(isNearMatch('walk', 'walked')).toBe(true);
    expect(isNearMatch('morning', 'mourning')).toBe(true);
  });
  it('does not treat different English words as near', () => {
    expect(isNearMatch('a', 'an')).toBe(false);
    expect(isNearMatch('tea', 'tee')).toBe(false);
    expect(isNearMatch('coffee', 'water')).toBe(false);
    expect(isNearMatch('cup', 'cupboard')).toBe(false);
  });
  it('never mixes scripts', () => {
    expect(isNearMatch('cup', '컵')).toBe(false);
  });
});

describe('alignToTarget', () => {
  it('marks every word as heard when the transcript matches, ignoring case and punctuation', () => {
    const a = alignToTarget('Good morning, how are you today?', 'good morning how are you today');
    expect(a?.unit).toBe('word');
    expect(marks(a)).toEqual(['Good', 'morning', 'how', 'are', 'you', 'today']);
    expect(a?.extra).toEqual([]);
  });

  it('marks words that were not heard, in order', () => {
    expect(marks(alignToTarget('I would like a cup of tea', 'i would like cup tea'))).toEqual([
      'I',
      'would',
      'like',
      '-a',
      'cup',
      '-of',
      'tea',
    ]);
  });

  it('marks a word heard as another word, with what was heard', () => {
    expect(marks(alignToTarget('I would like a cup of tea', 'i would like a cup of key'))).toEqual([
      'I',
      'would',
      'like',
      'a',
      'cup',
      'of',
      '?tea(key)',
    ]);
  });

  it('marks near words and lists extra words', () => {
    const a = alignToTarget('I would like a cup of tea', 'um i would like two cups of tea please');
    expect(marks(a)).toEqual(['I', 'would', 'like', '?a(two)', '~cup(cups)', 'of', 'tea']);
    expect(a?.extra).toEqual(['um', 'please']);
  });

  it('respects word order: a word heard in the wrong place is not a match there', () => {
    const a = alignToTarget('nice to meet you', 'you nice to meet');
    expect(marks(a)).toEqual(['nice', 'to', 'meet', '-you']);
    expect(a?.extra).toEqual(['you']);
  });

  it('keeps repeated words apart', () => {
    expect(marks(alignToTarget('the cat and the dog', 'the cat and dog'))).toEqual(['the', 'cat', 'and', '-the', 'dog']);
  });

  it('shows Korean particle and ending differences as near, not wrong', () => {
    const a = alignToTarget('저는 학교에 가요.', '저도 학교에서 가요');
    expect(marks(a)).toEqual(['~저는(저도)', '~학교에(학교에서)', '가요']);
    expect(marks(alignToTarget('저는 학교에 가요.', '저는 가요'))).toEqual(['저는', '-학교에', '가요']);
  });

  it('falls back to characters for Japanese written without spaces', () => {
    const a = alignToTarget('私は学生です。', 'わたしは学生です');
    expect(a?.unit).toBe('char');
    // Kana heard in place of a kanji stay together as what was heard.
    expect(marks(a)).toEqual(['?私(わたし)', 'は', '学', '生', 'で', 'す']);
    expect(a?.extra).toEqual([]);
    expect(alignToTarget('学生です', '学x生です')?.extra).toEqual(['x']);
    expect(marks(alignToTarget('私は学生です', '私は先生です'))).toEqual(['私', 'は', '?学(先)', '生', 'で', 'す']);
  });

  it('returns null when there is nothing to compare', () => {
    expect(alignToTarget('hello', '  ...  ')).toBeNull();
    expect(alignToTarget('!?', 'hello')).toBeNull();
  });

  it('carries no numeric score', () => {
    const a = alignToTarget('a b', 'a')!;
    expect(Object.keys(a).sort()).toEqual(['extra', 'target', 'unit']);
    for (const m of a.target) expect(Object.values(m).some((v) => typeof v === 'number')).toBe(false);
  });
});

describe('joinUnits', () => {
  it('puts spaces between words but not between kana/Han characters', () => {
    expect(joinUnits(units('cup of tea'))).toBe('cup of tea');
    expect(joinUnits(units('私はTomです'))).toBe('私は Tom です');
  });
});

describe('practiceTargets', () => {
  it('lists up to three missed or mis-heard words in order, without repeats or near words', () => {
    const a = alignToTarget('the big dog saw the big cat and a cups', 'the dog saw cat cup')!;
    expect(practiceTargets(a)).toEqual(['big', 'the', 'and']);
    expect(practiceTargets(a, 1)).toEqual(['big']);
  });
  it('is empty when everything was heard or near', () => {
    expect(practiceTargets(alignToTarget('저는 학교에 가요', '저도 학교에서 가요')!)).toEqual([]);
  });
  it('keeps neighbouring Japanese characters together as one phrase', () => {
    expect(practiceTargets(alignToTarget('私は学生です', '私はです')!)).toEqual(['学生']);
  });
});
