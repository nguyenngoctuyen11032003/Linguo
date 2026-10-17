import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { z } from 'zod';
import type { PathLesson } from '@linguo/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { OutboxSyncContext } from '@/features/lesson-player/OutboxSyncProvider';
import { pendingEntriesForRun } from '@/features/lesson-player/offline-queue';
import { fetchPathLessons } from '@/features/lesson-player/service';
import { clearOfflineMedia, lessonAssetUrls, requestPersistence, uncacheAssets } from '@/features/offline-media';
import { getSupabase } from '@/lib/supabase';
import { useOnline } from '@/lib/useOnline';
import { getContentStore, type ContentStore, type PackMeta } from './content-store';
import { confirmLocalRun, LOCAL_RUNS_EVENT, overlayLocalRuns, remapLocalRun, removeLocalRun } from './local-runs';
import {
  OfflineContentContext,
  type DownloadJob,
  type DownloadOutcome,
  type DownloadRequest,
  type OfflineContentValue,
} from './offline-context';
import { outcomeOf } from './outcome';
import { diffManifest, downloadPacks, estimateBytes, fetchManifest, type DownloadResult } from './pack-service';
import {
  AUTO_CACHE_LESSONS,
  AUTO_MIN_GAP_MS,
  connectionBlocksAuto,
  IDLE_DELAY_MS,
  MANIFEST_CHECK_INTERVAL_MS,
  nextUnfinished,
  PREF_AUTO,
  PREF_WIFI,
  readPref,
  wifiOnlySupported,
  writePref,
} from './policy';
import { readCachedPathLessons, readList, writeCachedPathLessons, writeList } from './swr';

const maintenanceSchema = z.object({ manifestAt: z.number().default(0), autoAt: z.number().default(0) });

const IN_LESSON = /^\/app\/hoc-tap\/bai\//;

/**
 * Keeps lesson packs on the device: what the learner downloaded on purpose ("Tải về học offline"), plus the current and
 * next unfinished lessons cached in the background (online, idle, unmetered, not inside a lesson). Also reacts to the
 * outbox replay so the device's runs follow what the server decided (start remapped, completion confirmed, run dropped).
 */
export function OfflineContentProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const paths = useLearningPaths();
  const pathId = paths.currentId;
  const online = useOnline();
  const location = useLocation();
  const inLesson = IN_LESSON.test(location.pathname);
  const outbox = useContext(OutboxSyncContext);
  const subscribeRunEvents = outbox?.subscribeRunEvents;

  const [store, setStore] = useState<{ userId: string; store: ContentStore } | null>(null);
  const [metas, setMetas] = useState<ReadonlyMap<string, PackMeta>>(() => new Map());
  const [metasOwner, setMetasOwner] = useState<string | null>(null);
  const [job, setJob] = useState<DownloadJob | null>(null);
  const [prefs, setPrefs] = useState<{ userId: string | null; auto: boolean; wifi: boolean }>({ userId: null, auto: true, wifi: false });

  const activeStore = store && store.userId === userId ? store.store : null;
  const activeMetas = metasOwner === userId ? metas : EMPTY_METAS;

  const jobSeq = useRef(0);
  const running = useRef<AbortController | null>(null);
  const latest = useRef({ client: getSupabase(), userId, pathId, online, inLesson, auto: prefs.auto, wifi: prefs.wifi, store: activeStore });
  useEffect(() => {
    latest.current = { client: getSupabase(), userId, pathId, online, inLesson, auto: prefs.auto, wifi: prefs.wifi, store: activeStore };
  });

  // ---- store + preferences ----------------------------------------------------------------------------------
  useEffect(() => {
    if (!userId) return;
    let live = true;
    setPrefs({ userId, auto: readPref(PREF_AUTO, userId, true), wifi: readPref(PREF_WIFI, userId, false) });
    getContentStore(userId)
      .then(async (s) => {
        if (!live) return;
        setStore({ userId, store: s });
        setMetas(new Map((await s.listMeta()).map((m) => [m.lessonId, m])));
        setMetasOwner(userId);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [userId]);

  const refresh = useCallback(async () => {
    const s = latest.current.store;
    const owner = latest.current.userId;
    if (!s || !owner) return;
    try {
      const list = await s.listMeta();
      setMetas(new Map(list.map((m) => [m.lessonId, m])));
      setMetasOwner(owner);
    } catch {
      // Keep what is shown.
    }
  }, []);

  // ---- the device's runs follow the replay ------------------------------------------------------------------
  useEffect(() => {
    if (!userId || !subscribeRunEvents) return;
    return subscribeRunEvents((event) => {
      if (event.type === 'remapped') void remapLocalRun(userId, event.from, event.to);
      else if (event.type === 'completed') void confirmLocalRun(userId, event.runId);
      else if (event.type === 'dropped') void removeLocalRun(userId, event.runId);
    });
  }, [userId, subscribeRunEvents]);

  // ---- evictable packs: lessons already completed, least recently used first -----------------------------------
  const evictableFor = useCallback(async (forPathId: string): Promise<string[]> => {
    const { store: s, userId: owner } = latest.current;
    if (!s || !owner) return [];
    const cached = await readCachedPathLessons(owner, forPathId);
    const runs = await s.listRuns();
    const done = new Set((cached?.data ?? []).filter((l) => l.run_status === 'completed').map((l) => l.lesson_id));
    const open = new Set(runs.map((r) => r.run.lesson_id));
    return (await s.listMeta())
      .filter((m) => done.has(m.lessonId) && !open.has(m.lessonId))
      .sort((a, b) => (a.lastOpenedAt ?? a.savedAt) - (b.lastOpenedAt ?? b.savedAt))
      .map((m) => m.lessonId);
  }, []);

  // ---- downloads ----------------------------------------------------------------------------------------------
  const runJob = useCallback(
    async (kind: DownloadRequest['kind'], auto: boolean, forPathId: string, lessonIds: readonly string[], manifest?: Parameters<typeof downloadPacks>[0]['manifest'], scope?: string): Promise<DownloadResult | null> => {
      const { client, store: s } = latest.current;
      if (!client || !s || running.current) return null;
      const controller = new AbortController();
      running.current = controller;
      const id = ++jobSeq.current;
      const base: DownloadJob = { id, kind, scope, auto, running: true, total: lessonIds.length, done: 0, failed: 0, bytes: 0 };
      setJob(base);
      let result: DownloadResult | null = null;
      try {
        result = await downloadPacks({
          client,
          store: s,
          pathId: forPathId,
          lessonIds,
          manifest,
          signal: controller.signal,
          evictable: () => evictableFor(forPathId),
          onProgress: (p) => setJob({ ...base, ...p }),
        });
      } finally {
        running.current = null;
      }
      const outcome: DownloadOutcome = outcomeOf(result, controller.signal.aborted);
      setJob((j) => ({
        ...(j ?? base),
        id,
        running: false,
        done: result ? result.saved.length + result.missing.length : 0,
        failed: result?.failed.length ?? 0,
        bytes: result?.bytes ?? 0,
        outcome,
      }));
      await refresh();
      return result;
    },
    [evictableFor, refresh],
  );

  const download = useCallback(
    async (request: DownloadRequest): Promise<DownloadResult | null> => {
      const target = request.pathId ?? latest.current.pathId;
      if (!target || request.lessonIds.length === 0) return null;
      void requestPersistence();
      // The learner's request wins over a background top-up that is still running.
      if (running.current) {
        running.current.abort();
        for (let waited = 0; running.current && waited < 40; waited++) await new Promise((r) => setTimeout(r, 50));
      }
      return runJob(request.kind, false, target, request.lessonIds, undefined, request.scope);
    },
    [runJob],
  );

  const cancel = useCallback(() => running.current?.abort(), []);

  const remove = useCallback(
    async (lessonIds: readonly string[]): Promise<number> => {
      const { store: s } = latest.current;
      if (!s) return 0;
      const guarded = new Set((await s.listRuns()).map((r) => r.run.lesson_id));
      const ids = lessonIds.filter((id) => !guarded.has(id));
      const urls: string[] = [];
      for (const id of ids) {
        const stored = await s.getPack(id).catch(() => null);
        if (stored) urls.push(...lessonAssetUrls(stored.pack));
      }
      await s.removePacks(ids);
      // Media shared with a lesson that stays is re-fetched on demand; only the removed lessons' clips go.
      if (urls.length > 0) await uncacheAssets([...new Set(urls)]).catch(() => undefined);
      await refresh();
      return ids.length;
    },
    [refresh],
  );

  const removeAll = useCallback(async () => {
    const { store: s } = latest.current;
    if (!s) return;
    const guarded = new Set((await s.listRuns()).map((r) => r.run.lesson_id));
    const ids = (await s.listMeta()).map((m) => m.lessonId).filter((id) => !guarded.has(id));
    await s.removePacks(ids);
    if (guarded.size === 0) await s.putList('maint', {}).catch(() => undefined);
    await clearOfflineMedia().catch(() => undefined);
    await refresh();
  }, [refresh]);

  // ---- maintenance: manifest diff + automatic caching ---------------------------------------------------------
  const maintain = useCallback(
    async (force: boolean) => {
      const { client, store: s, userId: owner, pathId: pid, online: isOnline, inLesson: busy, auto, wifi } = latest.current;
      if (!client || !s || !owner || !pid || !isOnline || running.current || busy) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const now = Date.now();
      const state = (await readList(owner, `maint:${pid}`, maintenanceSchema))?.data ?? { manifestAt: 0, autoAt: 0 };
      const manifestDue = force || now - state.manifestAt >= MANIFEST_CHECK_INTERVAL_MS;
      const autoDue = auto && now - state.autoAt >= (force ? 0 : AUTO_MIN_GAP_MS);
      if (!manifestDue && !autoDue) return;

      // Runs the server has fully absorbed (nothing queued, nothing open on screen) no longer need a device copy.
      for (const stored of await s.listRuns()) {
        if (stored.run.path_id === pid && stored.run.status === 'in_progress' && pendingEntriesForRun(owner, stored.run.id) === 0 && stored.origin === 'server') {
          await removeLocalRun(owner, stored.run.id);
        }
      }

      let manifest;
      try {
        manifest = await fetchManifest(client, pid);
      } catch {
        return;
      }
      const metaList = await s.listMeta();
      const diff = diffManifest(pid, manifest, metaList);
      if (diff.orphaned.length > 0) {
        const guarded = new Set((await s.listRuns()).map((r) => r.run.lesson_id));
        await s.removePacks(diff.orphaned.filter((id) => !guarded.has(id)));
        await refresh();
      }

      const mayDownload = auto && !connectionBlocksAuto(wifi) && s.persistent;
      let wanted: string[] = [];
      if (mayDownload) {
        wanted = [...diff.stale];
        if (autoDue) {
          let lessons: PathLesson[] | null;
          try {
            lessons = await fetchPathLessons(client, pid);
            void writeCachedPathLessons(owner, pid, lessons);
          } catch {
            lessons = (await readCachedPathLessons(owner, pid))?.data ?? null;
          }
          if (lessons) {
            const merged = overlayLocalRuns(lessons, await s.listRuns(), pid);
            const need = new Set([...diff.missing, ...diff.stale]);
            for (const l of nextUnfinished(merged, AUTO_CACHE_LESSONS)) if (need.has(l.lesson_id) && !wanted.includes(l.lesson_id)) wanted.push(l.lesson_id);
          }
        }
      }
      await writeList(owner, `maint:${pid}`, { manifestAt: manifestDue ? now : state.manifestAt, autoAt: autoDue ? now : state.autoAt });
      if (wanted.length > 0) await runJob('next', true, pid, wanted, manifest);
    },
    [refresh, runJob],
  );

  // On start (once the store is read), when the path changes, back online, back on screen and after a lesson.
  const maintainRef = useRef(maintain);
  useEffect(() => {
    maintainRef.current = maintain;
  }, [maintain]);
  const ready = !!activeStore && metasOwner === userId;
  useEffect(() => {
    if (!ready || !pathId || !online) return;
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void });
    let handle: number | undefined;
    let timer: number | undefined;
    const kick = () => void maintainRef.current(false).catch(() => undefined);
    if (idle.requestIdleCallback) handle = idle.requestIdleCallback(kick, { timeout: 10_000 });
    else timer = window.setTimeout(kick, IDLE_DELAY_MS);
    return () => {
      if (handle !== undefined) idle.cancelIdleCallback?.(handle);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [ready, pathId, online, inLesson]);

  useEffect(() => {
    if (!ready) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void maintainRef.current(false).catch(() => undefined);
    };
    const onRuns = () => void refresh();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(LOCAL_RUNS_EVENT, onRuns);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(LOCAL_RUNS_EVENT, onRuns);
    };
  }, [ready, refresh]);

  // ---- value --------------------------------------------------------------------------------------------------
  const usageBytes = useMemo(() => [...activeMetas.values()].reduce((sum, m) => sum + m.bytes, 0), [activeMetas]);
  const isDownloaded = useCallback((lessonId: string) => activeMetas.get(lessonId)?.hasKeys === true, [activeMetas]);
  const estimate = useCallback((count: number) => estimateBytes(count, [...activeMetas.values()]), [activeMetas]);
  const setAutoDownload = useCallback(
    (on: boolean) => {
      if (userId) writePref(PREF_AUTO, userId, on);
      setPrefs((p) => ({ ...p, userId, auto: on }));
    },
    [userId],
  );
  const setWifiOnly = useCallback(
    (on: boolean) => {
      if (userId) writePref(PREF_WIFI, userId, on);
      setPrefs((p) => ({ ...p, userId, wifi: on }));
    },
    [userId],
  );

  const prefsOwned = prefs.userId === userId;
  const value = useMemo<OfflineContentValue>(
    () => ({
      ready,
      persistent: activeStore?.persistent ?? false,
      downloaded: activeMetas,
      isDownloaded,
      usageBytes,
      estimateBytes: estimate,
      job,
      download,
      cancel,
      remove,
      removeAll,
      autoDownload: prefsOwned ? prefs.auto : true,
      setAutoDownload,
      wifiOnly: prefsOwned ? prefs.wifi : false,
      setWifiOnly,
      wifiOnlySupported: wifiOnlySupported(),
      refresh,
    }),
    [ready, activeStore, activeMetas, isDownloaded, usageBytes, estimate, job, download, cancel, remove, removeAll, prefsOwned, prefs.auto, prefs.wifi, setAutoDownload, setWifiOnly, refresh],
  );

  return <OfflineContentContext.Provider value={value}>{children}</OfflineContentContext.Provider>;
}

const EMPTY_METAS: ReadonlyMap<string, PackMeta> = new Map();

