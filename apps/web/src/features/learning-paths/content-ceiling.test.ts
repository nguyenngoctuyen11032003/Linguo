import { describe, expect, it } from 'vitest';
import { contentCeilingMessage, noTargetsMessage } from './content-ceiling';

describe('content ceiling copy', () => {
  it('names the highest level with lessons', () => {
    expect(contentCeilingMessage('ja')).toBe('Linguo hiện có bài học tới JLPT N1, các cấp cao hơn sẽ có sau.');
  });

  it('falls back to the reached message when the scale has no level above its content', () => {
    expect(noTargetsMessage('ja', 'n1', 'reached')).toBe('reached');
    expect(noTargetsMessage('ja', 'n3', 'reached')).toBe('reached');
    expect(noTargetsMessage('ko', 'topik6', 'reached')).toBe('reached');
  });
});
