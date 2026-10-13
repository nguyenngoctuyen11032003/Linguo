import { describe, expect, it } from 'vitest';
import { routePattern } from './route-pattern';

const LESSON = '40000000-0000-4000-8000-000000000001';

describe('routePattern', () => {
  it('keeps static routes', () => {
    expect(routePattern({ pathname: '/app/tien-do', params: {} })).toBe('/app/tien-do');
    expect(routePattern({ pathname: '/', params: {} })).toBe('/');
    expect(routePattern({ pathname: '/app/tien-do/', params: {} })).toBe('/app/tien-do');
  });

  it('replaces parameter values with their names', () => {
    expect(routePattern({ pathname: `/app/hoc-tap/bai/${LESSON}`, params: { lessonId: LESSON } })).toBe('/app/hoc-tap/bai/:lessonId');
    expect(routePattern({ pathname: '/app/lo-trinh/abc/bai/xyz', params: { pathId: 'abc', lessonId: 'xyz' } })).toBe(
      '/app/lo-trinh/:pathId/bai/:lessonId',
    );
  });

  it('matches encoded segments', () => {
    expect(routePattern({ pathname: '/app/tu/xin%20ch%C3%A0o', params: { word: 'xin chào' } })).toBe('/app/tu/:word');
  });

  it('collapses splat tails', () => {
    expect(routePattern({ pathname: '/app/khong-co/a/b', params: { '*': 'a/b' } })).toBe('/app/khong-co/*');
  });

  it('never exceeds 80 characters', () => {
    expect(routePattern({ pathname: `/${'a'.repeat(120)}`, params: {} })).toHaveLength(80);
  });
});
