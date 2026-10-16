import { describe, expect, it } from 'vitest';
import { audioUrl, isShortCjk, parseTemplate } from './exercise-utils';

describe('parseTemplate', () => {
  it('splits text and blanks in order', () => {
    expect(parseTemplate('{{a}} am {{b_2}}.')).toEqual([
      { kind: 'blank', id: 'a' },
      { kind: 'text', text: ' am ' },
      { kind: 'blank', id: 'b_2' },
      { kind: 'text', text: '.' },
    ]);
  });
});

describe('audioUrl', () => {
  it('keeps absolute URLs and resolves ids under public/audio', () => {
    expect(audioUrl('https://cdn.example/a.mp3')).toBe('https://cdn.example/a.mp3');
    expect(audioUrl('ko/hello.mp3')).toMatch(/audio\/ko\/hello\.mp3$/);
  });
});

describe('isShortCjk', () => {
  it('flags a lone Korean/Japanese letter, syllable or short word', () => {
    for (const t of ['ㅓ', '아', ' です ', '학교']) expect(isShortCjk(t)).toBe(true);
  });
  it('leaves Latin, mixed and longer text at the normal size', () => {
    for (const t of ['', 'a', 'Tạm biệt', '학교에 가요', 'ㅓ a']) expect(isShortCjk(t)).toBe(false);
  });
});
