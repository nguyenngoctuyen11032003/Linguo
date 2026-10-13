import { describe, expect, it } from 'vitest';
import { charCount, formatScore, isAnswered, levelRangeLabel, questionTypeLabel } from './labels';

describe('questionTypeLabel', () => {
  it('uses the curated Vietnamese name for known tags', () => {
    expect(questionTypeLabel('cefr_read_gist')).toBe('Đọc — ý chính');
    expect(questionTypeLabel('topik_ii_write_51')).toBe('Viết — điền câu (kiểu câu 51)');
  });

  it('keeps unknown tags readable', () => {
    expect(questionTypeLabel('topik_i_read_mystery_9')).toBe('Đọc — mystery câu 9');
    expect(questionTypeLabel('topik_ii_listen_detail_extra')).toBe('Nghe — chi tiết extra');
    expect(questionTypeLabel('cefr_write_77')).toBe('Viết — câu 77');
    expect(questionTypeLabel('foo_bar')).toBe('foo bar');
    expect(questionTypeLabel('topik_i_listen')).toBe('Nghe');
  });
});

describe('helpers', () => {
  it('labels level ranges', () => {
    expect(levelRangeLabel('topik1', 'topik2')).toBe('TOPIK 1–TOPIK 2');
    expect(levelRangeLabel('a2', 'a2')).toBe('A2');
    expect(levelRangeLabel('x9', 'a2')).toBe('x9–A2');
  });

  it('counts characters as code points', () => {
    expect(charCount('안녕하세요')).toBe(5);
    expect(charCount('a😀b')).toBe(3);
  });

  it('formats fractional scores with one decimal', () => {
    expect(formatScore(92)).toBe('92');
    expect(formatScore(92.54)).toBe('92,5');
  });

  it('treats blank answers as unanswered', () => {
    expect(isAnswered(null)).toBe(false);
    expect(isAnswered('  ')).toBe(false);
    expect(isAnswered('a')).toBe(true);
  });
});
