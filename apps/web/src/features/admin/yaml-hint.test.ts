import { describe, expect, it } from 'vitest';
import { examQuestionDetailFixture, exerciseDetailFixture, lessonDetailFixture } from './content-fixtures';
import { authoringObject, toYaml, yamlHint } from './yaml-hint';

describe('toYaml', () => {
  it('quotes only what plain YAML would misread', () => {
    expect(toYaml({ a: 'plain text', b: 'yes', c: '12', d: 'a: b', e: '- x', f: '', g: null, h: true, i: 3 })).toBe(
      'a: plain text\nb: "yes"\nc: "12"\nd: "a: b"\ne: "- x"\nf: ""\ng: null\nh: true\ni: 3\n',
    );
  });

  it('emits nested blocks and list entries', () => {
    expect(toYaml([{ key: 'k', options: [{ id: 'a', text: 'am' }], tags: [] }])).toBe('- key: k\n  options:\n    - id: a\n      text: am\n  tags: []\n');
  });
});

describe('authoringObject', () => {
  it('drops bookkeeping, renames columns and merges the private answer', () => {
    const obj = authoringObject(exerciseDetailFixture());
    expect(Object.keys(obj).slice(0, 2)).toEqual(['key', 'type']);
    expect(obj).toMatchObject({ type: 'mcq', answer: { correct_option_id: 'f8e' }, display_answer: 'is' });
    for (const dropped of ['id', 'source_id', 'lesson_id', 'content_hash', 'status', 'exercise_type', 'answer_key', 'known_wrong', 'rubric']) {
      expect(obj).not.toHaveProperty(dropped);
    }
  });

  it('keeps an exam question script under prompt', () => {
    const obj = authoringObject(examQuestionDetailFixture());
    expect(obj.prompt).toMatchObject({ stem: 'What time will they see the film?', script: 'Woman: Shall we…' });
    expect(obj.answer).toBe('c');
  });
});

describe('yamlHint', () => {
  it('points at the file and key, with the row as a list entry', () => {
    const hint = yamlHint(exerciseDetailFixture());
    expect(hint.path).toBe('content/en/programs/foundation/units/01-greetings/lessons/02-i-am.yaml');
    expect(hint.key).toBe('en:exercise:i-am-mcq-is');
    expect(hint.snippet).toMatch(/^# content\/en\/.*02-i-am\.yaml — mục key: en:exercise:i-am-mcq-is\n# Trạng thái hiện tại trong DB: approved, version 3\n- key: en:exercise:i-am-mcq-is\n {2}type: mcq\n/);
  });

  it('prefixes content/ and says when the file is unknown', () => {
    expect(yamlHint(exerciseDetailFixture({ repo_path: 'en/items/x.yaml' })).path).toBe('content/en/items/x.yaml');
    const lesson = yamlHint(lessonDetailFixture());
    expect(lesson.path).toBeNull();
    expect(lesson.snippet).toMatch(/^# Không xác định được file — mục key: en:lesson:i-am\n/);
    expect(lesson.snippet).toContain('\nkey: en:lesson:i-am\n');
    expect(lesson.snippet).toContain('\nlevel: pre_a1\n');
  });
});
