import { describe, expect, it } from 'vitest';
import { audioUrl, parseTemplate } from './exercise-utils';

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
