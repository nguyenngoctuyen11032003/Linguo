import { describe, expect, it } from 'vitest';
import { fakeClient } from '../../../tests/unit/fake-supabase';
import {
  DEFAULT_CONTENT_FILTERS,
  canChangeStatus,
  canForcePublish,
  contentDetailPath,
  filtersFromParams,
  filtersToParams,
  formatAdminDate,
  getContent,
  listContent,
  nextStatuses,
  reportTargetKind,
  reportsPath,
  safeUrl,
  setContentStatus,
  transitionLabel,
} from './content';
import { EXERCISE_ID, contentListFixture, exerciseDetailFixture } from './content-fixtures';

describe('list filters in the URL', () => {
  it('round-trips filters and leaves defaults out', () => {
    const filters = { kind: 'exercise' as const, language: 'ko' as const, status: 'in_review' as const, search: ' hello ', page: 3 };
    const params = filtersToParams(filters);
    expect(params.toString()).toBe('loai=exercise&ngon-ngu=ko&trang-thai=in_review&q=hello&trang=3');
    expect(filtersFromParams(params)).toEqual({ ...filters, search: 'hello' });
    expect(filtersToParams(DEFAULT_CONTENT_FILTERS).toString()).toBe('');
  });

  it('falls back to defaults for unknown values', () => {
    expect(filtersFromParams(new URLSearchParams('loai=user&ngon-ngu=fr&trang-thai=done&trang=-2'))).toEqual(DEFAULT_CONTENT_FILTERS);
  });
});

describe('content RPCs', () => {
  it('lists content with paging and a null empty search', async () => {
    const client = fakeClient({}, { admin_list_content: { data: contentListFixture(2, 40) } });
    const list = await listContent(client, { kind: 'lesson', language: 'en', status: null, search: '  ', page: 2 });
    expect(list.total).toBe(40);
    expect(client.rpcCalls).toEqual([
      ['admin_list_content', { p_kind: 'lesson', p_language: 'en', p_status: null, p_search: null, p_limit: 25, p_offset: 25 }],
    ]);
  });

  it('reads one row and rejects a malformed payload', async () => {
    const ok = fakeClient({}, { admin_get_content: { data: exerciseDetailFixture() } });
    await expect(getContent(ok, 'exercise', EXERCISE_ID)).resolves.toMatchObject({ id: EXERCISE_ID, kind: 'exercise' });
    expect(ok.rpcCalls).toEqual([['admin_get_content', { p_kind: 'exercise', p_id: EXERCISE_ID }]]);
    await expect(getContent(fakeClient({}, { admin_get_content: { data: { id: 'x' } } }), 'exercise', EXERCISE_ID)).rejects.toThrow('invalid_payload');
  });

  it('sets a status with a trimmed note and the force flag', async () => {
    const client = fakeClient({}, { admin_set_status: { data: { status: 'published' } } });
    await expect(setContentStatus(client, { kind: 'exercise', id: EXERCISE_ID, status: 'published', note: '  ok  ', force: true })).resolves.toBe('published');
    await setContentStatus(client, { kind: 'exercise', id: EXERCISE_ID, status: 'published', note: '   ', force: false });
    expect(client.rpcCalls).toEqual([
      ['admin_set_status', { p_kind: 'exercise', p_id: EXERCISE_ID, p_status: 'published', p_note: 'ok', p_force: true }],
      ['admin_set_status', { p_kind: 'exercise', p_id: EXERCISE_ID, p_status: 'published', p_note: null, p_force: false }],
    ]);
  });
});

describe('status workflow', () => {
  it('offers only valid next statuses', () => {
    expect(nextStatuses('lesson', 'draft')).toEqual(['in_review']);
    expect(nextStatuses('lesson', 'approved')).toEqual(['published', 'in_review']);
    expect(nextStatuses('exam_question', 'published')).toEqual(['archived']);
    expect(nextStatuses('lesson', 'weird')).toEqual([]);
  });

  it('gates status changes by role', () => {
    expect(canChangeStatus('editor')).toBe(false);
    expect(canChangeStatus('reviewer')).toBe(true);
    expect(canChangeStatus(null)).toBe(false);
    expect(canForcePublish('reviewer')).toBe(false);
    expect(canForcePublish('admin')).toBe(true);
  });

  it('labels transitions', () => {
    expect(transitionLabel('draft', 'in_review')).toBe('Gửi duyệt');
    expect(transitionLabel('published', 'in_review')).toBe('Trả về chờ duyệt');
    expect(transitionLabel('archived', 'draft')).toBe('Khôi phục thành bản nháp');
  });
});

describe('helpers', () => {
  it('builds paths and formats dates', () => {
    expect(contentDetailPath('exercise', EXERCISE_ID)).toBe(`/quan-tri/noi-dung/exercise/${EXERCISE_ID}`);
    expect(reportsPath('learning_item')).toBe('/quan-tri/bao-loi?loai=learning_item');
    expect(reportTargetKind('unit')).toBeNull();
    expect(reportTargetKind('exam_question')).toBe('exam_question');
    expect(formatAdminDate('2026-10-10T08:05:00Z')).toBe('10/10/2026');
    expect(formatAdminDate(null)).toBe('—');
  });

  it('safeUrl keeps only http(s) urls', () => {
    expect(safeUrl('https://tatoeba.org/vi')).toBe('https://tatoeba.org/vi');
    expect(safeUrl('http://example.com')).toBe('http://example.com/');
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html,x')).toBeNull();
    expect(safeUrl('not a url')).toBeNull();
    expect(safeUrl(null)).toBeNull();
  });
});
