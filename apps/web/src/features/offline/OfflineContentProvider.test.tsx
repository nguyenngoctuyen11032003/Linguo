import { act, renderHook, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startLocalRun } from '@linguo/shared';
import { AuthContext, type AuthState } from '@/features/auth/AuthProvider';
import { LearningPathsContext, type LearningPathsContextValue } from '@/features/learning-paths/LearningPathsProvider';
import type { LessonRunEvent } from '@/features/lesson-player/lesson-sync';
import { LESSON_ID, PATH_ID, offlinePack } from '@/features/lesson-player/lesson-fixtures';
import { OutboxSyncContext, type OutboxSyncContextValue } from '@/features/lesson-player/OutboxSyncProvider';
import { getContentStore, releaseContentStore } from './content-store';
import { dropMemoryDb } from './idb';
import { OfflineContentProvider } from './OfflineContentProvider';
import { useOfflineContent } from './useOfflineContent';

const USER = '11111111-1111-4111-8111-111111111111';
const RUN = '40000000-0000-4000-8000-000000000001';
const mocks = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client, requireSupabase: () => mocks.client }));
vi.mock('@/features/offline-media', () => ({
  requestPersistence: vi.fn().mockResolvedValue('persisted'),
  precacheLessonAssets: vi.fn().mockResolvedValue({ cached: 0, skipped: 0, failed: 0, bytes: 0 }),
  lessonAssetUrls: () => [],
  uncacheAssets: vi.fn().mockResolvedValue(0),
  clearOfflineMedia: vi.fn().mockResolvedValue(undefined),
}));

const handlers: Array<(event: LessonRunEvent) => void> = [];
const outbox = {
  subscribeRunEvents: (handler: (event: LessonRunEvent) => void) => {
    handlers.push(handler);
    return () => {
      handlers.splice(handlers.indexOf(handler), 1);
    };
  },
} as unknown as OutboxSyncContextValue;

function wrapper({ children }: { children: ReactNode }) {
  const auth: AuthState = { status: 'signed-in', session: null, user: { id: USER } as User };
  const paths = { status: 'ready', error: null, paths: [], currentId: PATH_ID, current: null, reload: vi.fn(), setCurrent: vi.fn(), upsertPath: vi.fn() } as LearningPathsContextValue;
  return (
    <MemoryRouter initialEntries={['/app/hoc-tap']}>
      <AuthContext.Provider value={auth}>
        <OutboxSyncContext.Provider value={outbox}>
          <LearningPathsContext.Provider value={paths}>
            <OfflineContentProvider>{children}</OfflineContentProvider>
          </LearningPathsContext.Provider>
        </OutboxSyncContext.Provider>
      </AuthContext.Provider>
    </MemoryRouter>
  );
}

function fakeClient() {
  const rpc = vi.fn((name: string) => {
    const row = { lesson_id: LESSON_ID, content_version: 1, content_hash: 'h', exercise_versions_hash: 'e', items_hash: 'i' };
    if (name === 'offline_lesson_manifest') return Promise.resolve({ data: [row], error: null });
    if (name === 'offline_lesson_packs') return Promise.resolve({ data: { packs: [offlinePack()], missing: [] }, error: null });
    return Promise.resolve({ data: [], error: null });
  });
  mocks.client = { rpc };
  return rpc;
}

const localRun = () => startLocalRun({ id: RUN, pathId: PATH_ID, pack: offlinePack(), now: '2026-10-17T08:00:00Z' });

afterEach(async () => {
  localStorage.clear();
  handlers.length = 0;
  await releaseContentStore(USER);
  dropMemoryDb(USER);
});

describe('OfflineContentProvider', () => {
  it('downloads lessons on request, tracks the job and lists what is stored', async () => {
    const rpc = fakeClient();
    const { result } = renderHook(() => useOfflineContent(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.isDownloaded(LESSON_ID)).toBe(false);
    let out;
    await act(async () => {
      out = await result.current.download({ kind: 'unit', scope: 'unit:x', lessonIds: [LESSON_ID] });
    });
    expect(out).toMatchObject({ saved: [LESSON_ID] });
    expect(rpc).toHaveBeenCalledWith('offline_lesson_packs', { p_path_id: PATH_ID, p_lesson_ids: [LESSON_ID] });
    await waitFor(() => expect(result.current.isDownloaded(LESSON_ID)).toBe(true));
    expect(result.current.job).toMatchObject({ scope: 'unit:x', running: false, outcome: 'done', done: 1 });
    expect(result.current.usageBytes).toBeGreaterThan(0);
  });

  it('never removes a pack whose lesson has a run the server has not absorbed', async () => {
    fakeClient();
    const store = await getContentStore(USER);
    await store.savePacks([offlinePack()], { pathId: PATH_ID, hashes: new Map() });
    await store.saveRun({ origin: 'device', updatedAt: 1, run: localRun() });
    const { result } = renderHook(() => useOfflineContent(), { wrapper });
    await waitFor(() => expect(result.current.isDownloaded(LESSON_ID)).toBe(true));
    let removed = -1;
    await act(async () => {
      removed = await result.current.remove([LESSON_ID]);
    });
    expect(removed).toBe(0);
    expect(result.current.isDownloaded(LESSON_ID)).toBe(true);
    await act(async () => {
      await result.current.removeAll();
    });
    expect(result.current.isDownloaded(LESSON_ID)).toBe(true);
    await store.deleteRun(RUN);
    await act(async () => {
      removed = await result.current.remove([LESSON_ID]);
    });
    expect(removed).toBe(1);
    expect(result.current.isDownloaded(LESSON_ID)).toBe(false);
  });

  it('follows the replay: a remapped start re-keys the run, a confirmed completion keeps it for the overlay, a dropped run goes', async () => {
    fakeClient();
    const store = await getContentStore(USER);
    await store.saveRun({ origin: 'device', updatedAt: 1, run: localRun() });
    renderHook(() => useOfflineContent(), { wrapper });
    await waitFor(() => expect(handlers).toHaveLength(1));
    const to = '40000000-0000-4000-8000-0000000000ee';
    await act(async () => handlers[0]!({ type: 'remapped', from: RUN, to }));
    await waitFor(async () => expect(await store.getRun(to)).not.toBeNull());
    expect(await store.getRun(RUN)).toBeNull();
    await act(async () => handlers[0]!({ type: 'completed', runId: to, result: {} as never }));
    await waitFor(async () => expect((await store.getRun(to))?.confirmedAt).toBeTypeOf('number'));
    await act(async () => handlers[0]!({ type: 'dropped', runId: to, reason: 'run_not_active' }));
    await waitFor(async () => expect(await store.getRun(to)).toBeNull());
  });

  it('remembers the automatic-download switch per user', async () => {
    fakeClient();
    const first = renderHook(() => useOfflineContent(), { wrapper });
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    expect(first.result.current.autoDownload).toBe(true);
    act(() => first.result.current.setAutoDownload(false));
    expect(first.result.current.autoDownload).toBe(false);
    first.unmount();
    const second = renderHook(() => useOfflineContent(), { wrapper });
    await waitFor(() => expect(second.result.current.ready).toBe(true));
    await waitFor(() => expect(second.result.current.autoDownload).toBe(false));
  });
});
