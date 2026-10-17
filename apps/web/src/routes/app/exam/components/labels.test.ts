import { describe, expect, it } from 'vitest';
import { FAMILY_LABELS, charCount, familyLanguage, formatScore, isAnswered, levelRangeLabel, questionTypeLabel } from './labels';

describe('questionTypeLabel', () => {
  it('uses the curated Vietnamese name for known tags', () => {
    expect(questionTypeLabel('cefr_read_gist')).toBe('Đọc — ý chính');
    expect(questionTypeLabel('topik_ii_write_51')).toBe('Viết — điền câu (kiểu câu 51)');
    expect(questionTypeLabel('jlpt_read_kanji_reading')).toBe('Đọc — cách đọc kanji');
    expect(questionTypeLabel('jlpt_listen_task')).toBe('Nghe — hiểu nhiệm vụ');
  });

  it('keeps unknown tags readable', () => {
    expect(questionTypeLabel('topik_i_read_mystery_9')).toBe('Đọc — mystery câu 9');
    expect(questionTypeLabel('topik_ii_listen_detail_extra')).toBe('Nghe — chi tiết extra');
    expect(questionTypeLabel('cefr_write_77')).toBe('Viết — câu 77');
    expect(questionTypeLabel('foo_bar')).toBe('foo bar');
    expect(questionTypeLabel('topik_i_listen')).toBe('Nghe');
  });
});

describe('goethe labels', () => {
  it('has curated Vietnamese names for the Lesen / Hören / Schreiben tags', () => {
    expect(questionTypeLabel('goethe_listen_short')).toBe('Nghe — hội thoại, thông báo ngắn');
    expect(questionTypeLabel('goethe_read_match')).toBe('Đọc — ghép thông tin');
    expect(questionTypeLabel('goethe_read_truefalse')).toBe('Đọc — đúng/sai');
    expect(questionTypeLabel('goethe_write_email')).toBe('Viết — email, thư');
    expect(questionTypeLabel('goethe_write_essay')).toBe('Viết — nêu ý kiến');
  });

  it('keeps uncurated goethe tags readable (family prefix dropped, section and words translated)', () => {
    expect(questionTypeLabel('goethe_read_sign_extra')).toBe('Đọc — biển báo extra');
    expect(questionTypeLabel('goethe_listen_conversation_long')).toBe('Nghe — hội thoại long');
    expect(questionTypeLabel('goethe_write')).toBe('Viết');
  });

  it('names the family and reads, hears and writes German', () => {
    expect(FAMILY_LABELS.goethe).toBe('Goethe');
    expect(familyLanguage('goethe')).toBe('de');
    expect(familyLanguage('cefr')).toBe('en');
    expect(familyLanguage('jlpt')).toBe('ja');
    expect(familyLanguage('topik_i')).toBe('ko');
    expect(familyLanguage('topik_ii')).toBe('ko');
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
