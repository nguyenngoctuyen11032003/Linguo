import type { RouteObject } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appPathOf, installRoutePrefetch, prefetchRoute, resetPrefetchForTests } from './prefetch';

afterEach(() => resetPrefetchForTests());

describe('appPathOf', () => {
  it('strips the base path of in-app links and ignores other origins', () => {
    expect(appPathOf('https://x.dev/linguo/app/on-tap?a=1', 'https://x.dev', '/linguo')).toBe('/app/on-tap');
    expect(appPathOf('/app', 'https://x.dev', '/')).toBe('/app');
    expect(appPathOf('https://other.dev/app', 'https://x.dev', '/')).toBeNull();
    expect(appPathOf('https://x.dev/elsewhere', 'https://x.dev', '/linguo')).toBeNull();
  });
});

describe('prefetchRoute', () => {
  it('loads every lazy route matching the path, once', () => {
    const parent = vi.fn(async () => ({}));
    const child = vi.fn(async () => ({}));
    const other = vi.fn(async () => ({}));
    const routes: RouteObject[] = [
      { path: '/app', lazy: parent, children: [{ path: 'on-tap', lazy: child }, { path: 'tien-do', lazy: other }] },
    ];
    const cleanup = installRoutePrefetch(routes, '/');
    prefetchRoute('/app/on-tap?x=1');
    prefetchRoute('/app/on-tap');
    expect(parent).toHaveBeenCalledTimes(1);
    expect(child).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    cleanup();
  });

  it('prefetches on touch intent over an in-app link', () => {
    const lazy = vi.fn(async () => ({}));
    const cleanup = installRoutePrefetch([{ path: '/app/hoc-tap', lazy }], '/');
    const a = document.createElement('a');
    a.href = '/app/hoc-tap';
    a.innerHTML = '<span>Học tập</span>';
    document.body.append(a);
    a.firstElementChild!.dispatchEvent(new Event('touchstart', { bubbles: true }));
    expect(lazy).toHaveBeenCalledTimes(1);
    a.remove();
    cleanup();
  });
});
