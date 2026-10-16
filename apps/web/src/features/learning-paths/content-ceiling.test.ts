import { describe, expect, it } from 'vitest';
import { contentCeilingMessage, noTargetsMessage } from './content-ceiling';

describe('content ceiling copy', () => {
  it('names the highest level with lessons', () => {
    expect(contentCeilingMessage('ja')).toBe('Linguo hiện có bài học tới JLPT N3, các cấp cao hơn sẽ có sau.');
  });

  it('explains the ceiling only when the current level sits on it', () => {
    expect(noTargetsMessage('ja', 'n3', 'reached')).toBe(contentCeilingMessage('ja'));
    expect(noTargetsMessage('ja', 'n4', 'reached')).toBe('reached');
    expect(noTargetsMessage('ko', 'topik6', 'reached')).toBe('reached');
  });
});
