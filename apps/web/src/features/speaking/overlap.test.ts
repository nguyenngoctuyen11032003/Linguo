import { describe, expect, it } from 'vitest';
import { compareToTarget, tokenize } from './overlap';

describe('tokenize', () => {
  it('lowercases and drops punctuation', () => {
    expect(tokenize("Hello, World! It's me.")).toEqual(['hello', 'world', "it's", 'me']);
  });
  it('keeps Hangul syllables and drops Korean punctuation', () => {
    expect(tokenize('안녕하세요? 저는 민아입니다.')).toEqual(['안녕하세요', '저는', '민아입니다']);
  });
  it('normalises curly apostrophes', () => {
    expect(tokenize('I’m fine')).toEqual(["i'm", 'fine']);
  });
});

describe('compareToTarget', () => {
  it('lists target words not found in the transcript, in order', () => {
    const r = compareToTarget('I would like a cup of tea', 'i would like cup tea');
    expect(r?.missing).toEqual(['a', 'of']);
    expect(r?.level).toBe('partial');
  });
  it('is "close" when everything is found, ignoring case and extra words', () => {
    expect(compareToTarget('Nice to meet you', 'nice to meet you too')?.level).toBe('close');
    expect(compareToTarget('Nice to meet you', 'nice to meet you')?.missing).toEqual([]);
  });
  it('is "partial" for about half and "far" for little overlap', () => {
    expect(compareToTarget('one two three four', 'one two')?.level).toBe('partial');
    expect(compareToTarget('one two three four', 'nothing here')?.level).toBe('far');
  });
  it('returns null for an empty transcript or target', () => {
    expect(compareToTarget('hello', '   ')).toBeNull();
    expect(compareToTarget('', 'hello')).toBeNull();
  });
  it('does not expose any numeric score', () => {
    expect(Object.keys(compareToTarget('a b', 'a')!).sort()).toEqual(['level', 'missing']);
  });
});
