import {
  offlineManifestRowSchema,
  offlinePacksResultSchema,
  type OfflineManifestRow,
  type OfflinePack,
} from '@linguo/shared';
import { lessonAssetUrls, precacheLessonAssets } from '@/features/offline-media';
import { callRpc, parse } from '@/features/lesson-player/service';
import type { AppSupabaseClient } from '@/lib/supabase';
import type { ContentStore, ManifestHashes, PackMeta } from './content-store';
import { isQuotaError } from './idb';

/** offline_lesson_packs takes at most 20 ids per call; 15 keeps one response around a few hundred kilobytes. */
export const PACK_BATCH_SIZE = 15;
/** Used to quote a download before anything is stored: the average pack (payload + keys) of a language is ~25 KB. */
export const DEFAULT_PACK_BYTES = 25 * 1024;

export async function fetchManifest(client: AppSupabaseClient, pathId: string): Promise<OfflineManifestRow[]> {
  const data = await callRpc(client, 'offline_lesson_manifest', { p_path_id: pathId });
  return parse(offlineManifestRowSchema.array(), data ?? []);
}

export async function fetchPacks(client: AppSupabaseClient, pathId: string, lessonIds: readonly string[]) {
  return parse(offlinePacksResultSchema, await callRpc(client, 'offline_lesson_packs', { p_path_id: pathId, p_lesson_ids: [...lessonIds] }));
}

export const hashesOf = (row: OfflineManifestRow): ManifestHashes => ({
  contentHash: row.content_hash,
  exerciseVersionsHash: row.exercise_versions_hash,
  itemsHash: row.items_hash,
});

export function isFresh(meta: PackMeta, row: OfflineManifestRow): boolean {
  return (
    meta.hasKeys &&
    meta.contentVersion === row.content_version &&
    meta.contentHash === row.content_hash &&
    meta.exerciseVersionsHash === row.exercise_versions_hash &&
    meta.itemsHash === row.items_hash
  );
}

export interface ManifestDiff {
  /** Stored and identical to the server's. */
  upToDate: string[];
  /** Stored but changed on the server (or stored without keys): to be downloaded again. */
  stale: string[];
  /** In the manifest, not stored. */
  missing: string[];
  /** Stored for this path but no longer in its lesson list. */
  orphaned: string[];
}

/** Compares a path's manifest with what this device stores. Orphans are only those stored for the same path. */
export function diffManifest(pathId: string, rows: readonly OfflineManifestRow[], metas: readonly PackMeta[]): ManifestDiff {
  const stored = new Map(metas.map((m) => [m.lessonId, m]));
  const inManifest = new Set(rows.map((r) => r.lesson_id));
  const diff: ManifestDiff = { upToDate: [], stale: [], missing: [], orphaned: [] };
  for (const row of rows) {
    const meta = stored.get(row.lesson_id);
    if (!meta) diff.missing.push(row.lesson_id);
    else if (isFresh(meta, row)) diff.upToDate.push(row.lesson_id);
    else diff.stale.push(row.lesson_id);
  }
  // An empty manifest is indistinguishable from a deleted path or a failed call: never conclude "everything is gone".
  if (rows.length > 0) for (const meta of metas) if (meta.pathId === pathId && !inManifest.has(meta.lessonId)) diff.orphaned.push(meta.lessonId);
  return diff;
}

/** Every published exercise of a pack must come with the key of its own version, else it could not be graded offline. */
export function packIsComplete(pack: OfflinePack): boolean {
  const keys = new Map(pack.keys.map((k) => [k.exercise_id, k.version]));
  return pack.exercises.every((e) => keys.get(e.id) === e.version);
}

export function estimateBytes(count: number, metas: readonly PackMeta[]): number {
  const average = metas.length > 0 ? metas.reduce((sum, m) => sum + m.bytes, 0) / metas.length : DEFAULT_PACK_BYTES;
  return Math.round(count * average);
}

export interface DownloadProgress {
  total: number;
  done: number;
  failed: number;
  bytes: number;
}

export interface DownloadOptions {
  client: AppSupabaseClient;
  store: ContentStore;
  pathId: string;
  lessonIds: readonly string[];
  /** Already fetched manifest of the path (saves a call); fetched here when absent. */
  manifest?: readonly OfflineManifestRow[];
  signal?: AbortSignal;
  onProgress?: (progress: DownloadProgress) => void;
  batchSize?: number;
  /** Ids of packs that may be deleted, oldest first, when the disk is full (lessons the learner has already completed). */
  evictable?: () => Promise<string[]>;
  /** Download recorded audio too (listen clips). Default true; never throws. */
  media?: boolean;
}

export interface DownloadResult {
  saved: string[];
  /** Packs the server sent without a key for every exercise, or that could not be stored. */
  failed: string[];
  /** Not (or no longer) in the path's lesson list. */
  missing: string[];
  bytes: number;
  aborted: boolean;
  quotaExceeded: boolean;
  /** The call that stopped the download (offline, rate limited, ...); the next run resumes with what is not stored. */
  error?: unknown;
}

const chunk = <T,>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/**
 * Downloads packs in batches, resumable: whatever is stored stays stored, so a dropped connection only costs the
 * batch in flight. A full disk first evicts packs of already completed lessons (`evictable`), then stops with
 * `quotaExceeded`. Never throws.
 */
export async function downloadPacks(options: DownloadOptions): Promise<DownloadResult> {
  const { client, store, pathId, signal } = options;
  const result: DownloadResult = { saved: [], failed: [], missing: [], bytes: 0, aborted: false, quotaExceeded: false };
  const progress: DownloadProgress = { total: options.lessonIds.length, done: 0, failed: 0, bytes: 0 };
  const report = () => options.onProgress?.({ ...progress });
  report();

  let manifest: readonly OfflineManifestRow[];
  try {
    manifest = options.manifest ?? (await fetchManifest(client, pathId));
  } catch (error) {
    result.error = error;
    return result;
  }
  const rows = new Map(manifest.map((r) => [r.lesson_id, r]));
  const wanted = [...new Set(options.lessonIds)];
  const known = wanted.filter((id) => rows.has(id));
  result.missing = wanted.filter((id) => !rows.has(id));
  progress.total = wanted.length;
  progress.done = result.missing.length;
  report();

  for (const ids of chunk(known, options.batchSize ?? PACK_BATCH_SIZE)) {
    if (signal?.aborted) {
      result.aborted = true;
      break;
    }
    let packs: OfflinePack[];
    try {
      const fetched = await fetchPacks(client, pathId, ids);
      packs = fetched.packs;
      for (const id of fetched.missing) if (!result.missing.includes(id)) result.missing.push(id);
    } catch (error) {
      result.error = error;
      break;
    }
    const complete = packs.filter(packIsComplete);
    for (const pack of packs) if (!packIsComplete(pack)) result.failed.push(pack.lesson.id);
    const hashes = new Map<string, ManifestHashes>();
    for (const pack of complete) {
      const row = rows.get(pack.lesson.id);
      // A pack newer than the manifest (the lesson changed in between) is stored without hashes and refreshed next diff.
      if (row && row.content_version === pack.content_version) hashes.set(pack.lesson.id, hashesOf(row));
    }

    let stored = false;
    for (let attempt = 0; attempt < 4 && !stored; attempt++) {
      try {
        const metas = await store.savePacks(complete, { pathId, hashes });
        result.saved.push(...metas.map((m) => m.lessonId));
        result.bytes += metas.reduce((sum, m) => sum + m.bytes, 0);
        stored = true;
      } catch (error) {
        if (!isQuotaError(error)) {
          result.failed.push(...complete.map((p) => p.lesson.id));
          result.error = error;
          stored = true;
          break;
        }
        const protectedIds = new Set(complete.map((p) => p.lesson.id));
        const victims = ((await options.evictable?.().catch(() => [])) ?? []).filter((id) => !protectedIds.has(id)).slice(0, 10);
        if (victims.length === 0) break;
        await store.removePacks(victims).catch(() => undefined);
      }
    }
    if (!stored) {
      result.quotaExceeded = true;
      result.failed.push(...complete.map((p) => p.lesson.id));
      progress.failed += ids.length;
      report();
      break;
    }

    progress.done += ids.length;
    progress.failed = result.failed.length;
    progress.bytes = result.bytes;
    report();

    if (options.media !== false) {
      const urls = [...new Set(complete.flatMap((pack) => lessonAssetUrls(pack)))];
      if (urls.length > 0) await precacheLessonAssets(urls, { signal }).catch(() => undefined);
    }
    if (result.error) break;
  }
  if (signal?.aborted) result.aborted = true;
  return result;
}
