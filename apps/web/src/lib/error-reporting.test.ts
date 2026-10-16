import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ track: vi.fn(), flush: vi.fn(() => Promise.resolve()) }));
vi.mock('@/features/analytics/client', () => ({ track: mocks.track, flushAnalytics: mocks.flush }));

import { errorReportingSink } from './error-reporting-sink';
import {
  connectErrorReporting,
  ERROR_DEDUPE_WINDOW_MS,
  errorCode,
  installErrorReporting,
  isChunkLoadError,
  reportClientError,
  reportRenderError,
  resetErrorReportingForTests,
  templatePath,
} from './error-reporting';

beforeEach(() => {
  vi.useFakeTimers();
  resetErrorReportingForTests();
  connectErrorReporting(errorReportingSink);
  mocks.track.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('templatePath', () => {
  it('replaces ids, drops query and hash', () => {
    expect(templatePath('/app/hoc-tap/bai/3f2b8c1e-1a2b-4c3d-8e9f-0123456789ab?token=x#y')).toBe('/app/hoc-tap/bai/:id');
    expect(templatePath('/app/hoc-tap/bai/42')).toBe('/app/hoc-tap/bai/:id');
    expect(templatePath('/')).toBe('/');
  });
});

describe('errorCode', () => {
  it('uses the error name, never the message', () => {
    expect(errorCode(new TypeError('secret user text'))).toBe('TypeError');
    expect(errorCode('some string with text')).toBe('NonError');
    const odd = new Error('x');
    odd.name = 'has spaces and text';
    expect(errorCode(odd)).toBe('Error');
  });
  it('recognises chunk load failures', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/a.js?t=1'))).toBe(true);
    expect(errorCode(new TypeError('Failed to fetch dynamically imported module: https://x/a.js'))).toBe('ChunkLoadError');
  });
});

describe('reportClientError', () => {
  it('sends only whitelisted props and a route template', () => {
    expect(reportClientError({ kind: 'render_error', error: new RangeError('boom'), pathname: '/app/hoc-tap/bai/123' })).toBe(true);
    expect(mocks.track).toHaveBeenCalledWith('client_error', { kind: 'render_error', code: 'RangeError', online: true }, { route: '/app/hoc-tap/bai/:id' });
    expect(mocks.flush).toHaveBeenCalled();
  });

  it('dedupes kind+route+code for 10 minutes', () => {
    const r = () => reportClientError({ kind: 'window_error', error: new Error('a'), pathname: '/app' });
    expect(r()).toBe(true);
    expect(r()).toBe(false);
    expect(reportClientError({ kind: 'window_error', error: new Error('a'), pathname: '/app/ho-so' })).toBe(true);
    vi.advanceTimersByTime(ERROR_DEDUPE_WINDOW_MS + 1);
    expect(r()).toBe(true);
    expect(mocks.track).toHaveBeenCalledTimes(3);
  });

  it('never throws', () => {
    mocks.track.mockImplementation(() => {
      throw new Error('queue broken');
    });
    expect(() => reportClientError({ kind: 'render_error', error: new Error('x') })).not.toThrow();
    expect(reportClientError({ kind: 'nope' as never })).toBe(false);
    mocks.track.mockReset();
  });

  it('reportRenderError maps chunk failures to their own kind', () => {
    reportRenderError(new TypeError('error loading dynamically imported module'));
    expect(mocks.track.mock.calls[0]?.[1]).toMatchObject({ kind: 'chunk_load_error', code: 'ChunkLoadError' });
  });
});

describe('installErrorReporting', () => {
  it('reports window errors, rejections and preload errors once installed (installs once)', () => {
    installErrorReporting();
    installErrorReporting();
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('x'), message: 'x' }));
    const rej = new Event('unhandledrejection') as Event & { reason: unknown };
    rej.reason = new SyntaxError('y');
    window.dispatchEvent(rej);
    window.dispatchEvent(new Event('vite:preloadError'));
    window.dispatchEvent(new ErrorEvent('error', {})); // resource error: ignored
    const kinds = mocks.track.mock.calls.map((c) => (c[1] as { kind: string }).kind);
    expect(kinds).toEqual(['window_error', 'unhandled_rejection', 'chunk_load_error']);
  });
});
