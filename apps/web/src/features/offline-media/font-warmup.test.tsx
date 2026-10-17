import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LearningPathsContext, type LearningPathsContextValue } from '@/features/learning-paths/LearningPathsProvider';
import { SW_MESSAGE_WARM_FONTS } from '@/features/pwa/sw-helpers';
import { requestPretendardWarmup, shouldWarmFonts } from './font-warmup';
import { OfflineMediaWarmup } from './OfflineMediaWarmup';

let online = true;
let worker: { postMessage: ReturnType<typeof vi.fn> } | null;
let connection: Record<string, unknown> | undefined;

beforeEach(() => {
  online = true;
  connection = undefined;
  worker = { postMessage: vi.fn() };
  localStorage.clear();
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
  vi.stubGlobal('navigator', {
    get onLine() {
      return online;
    },
    get connection() {
      return connection;
    },
    serviceWorker: { getRegistration: vi.fn(async () => (worker ? { active: worker } : undefined)) },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('requestPretendardWarmup', () => {
  it('asks the active worker once, then not again for two weeks', async () => {
    const t0 = 1_000_000_000_000;
    expect(await requestPretendardWarmup(t0)).toBe(true);
    expect(worker!.postMessage).toHaveBeenCalledWith({ type: SW_MESSAGE_WARM_FONTS });
    expect(await requestPretendardWarmup(t0 + 3 * 24 * 3600_000)).toBe(false);
    expect(await requestPretendardWarmup(t0 + 15 * 24 * 3600_000)).toBe(true);
    expect(worker!.postMessage).toHaveBeenCalledTimes(2);
  });

  it('stays off offline, on data saver and on cellular', async () => {
    online = false;
    expect(shouldWarmFonts()).toBe(false);
    online = true;
    connection = { saveData: true };
    expect(shouldWarmFonts()).toBe(false);
    connection = { type: 'cellular' };
    expect(shouldWarmFonts()).toBe(false);
    expect(await requestPretendardWarmup()).toBe(false);
    expect(worker!.postMessage).not.toHaveBeenCalled();
  });

  it('does nothing (and records nothing) without an active worker', async () => {
    worker = null;
    expect(await requestPretendardWarmup()).toBe(false);
    expect(localStorage.getItem('linguo-font-warm-v1')).toBeNull();
  });
});

function pathsValue(languages: string[]): LearningPathsContextValue {
  const paths = languages.map((language, i) => ({ id: `p${i}`, language })) as unknown as LearningPathsContextValue['paths'];
  return { status: 'ready', error: null, paths, currentId: paths[0]?.id ?? null, current: paths[0] ?? null, reload: () => {}, setCurrent: async () => {}, upsertPath: () => {} };
}

describe('OfflineMediaWarmup', () => {
  it('warms for Korean learners only, when idle', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestIdleCallback', undefined);
    const { unmount } = render(
      <LearningPathsContext.Provider value={pathsValue(['en'])}>
        <OfflineMediaWarmup />
      </LearningPathsContext.Provider>,
    );
    await vi.advanceTimersByTimeAsync(20_000);
    expect(worker!.postMessage).not.toHaveBeenCalled();
    unmount();

    render(
      <LearningPathsContext.Provider value={pathsValue(['en', 'ko'])}>
        <OfflineMediaWarmup />
      </LearningPathsContext.Provider>,
    );
    await vi.advanceTimersByTimeAsync(20_000);
    expect(worker!.postMessage).toHaveBeenCalledTimes(1);
  });
});
