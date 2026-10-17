import { offlinePackSchema, type LocalRun, type OfflineKey, type OfflinePack } from '@linguo/shared';
import type { ZodType } from 'zod';
import { openOfflineDb, type BatchOp, type OfflineDb } from './idb';

/** What the manifest said about a pack when it was downloaded: any difference later means the pack is stale. */
export interface ManifestHashes {
  contentHash: string;
  exerciseVersionsHash: string;
  itemsHash: string;
}

/** Small per-lesson record, kept apart from the (large) pack so listing what is downloaded never loads the packs. */
export interface PackMeta extends ManifestHashes {
  lessonId: string;
  /** The path the pack was fetched for (authorisation scope). */
  pathId: string;
  language: string;
  contentVersion: number;
  /** Epoch ms. */
  savedAt: number;
  /** UTF-8 size of the stored pack and keys. */
  bytes: number;
  /** False after sign-out wiped the keys: the lesson text is there but answers cannot be graded until it is refreshed. */
  hasKeys: boolean;
  /** Epoch ms of the last time the lesson was opened from this pack (eviction hint). */
  lastOpenedAt?: number;
}

export type StoredPackPublic = Omit<OfflinePack, 'keys'>;

/** A lesson run made on the device (offline) or adopted from the server when the network dropped mid-lesson. */
export interface StoredRun {
  run: LocalRun;
  /** 'device': the server does not know it yet (its start is queued); 'server': it already exists there. */
  origin: 'device' | 'server';
  /** Epoch ms of the last change. */
  updatedAt: number;
  /**
   * Epoch ms when the server confirmed the completion. The run only lingers so the lesson list keeps showing the lesson
   * as completed until it has been refetched; it no longer counts as the lesson's live run.
   */
  confirmedAt?: number;
}

export interface SavePacksInfo {
  pathId: string;
  hashes: ReadonlyMap<string, ManifestHashes>;
  now?: number;
}

const encoder = new TextEncoder();
const byteSize = (value: unknown): number => encoder.encode(JSON.stringify(value)).length;

function validRun(value: unknown): value is StoredRun {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<StoredRun>;
  const r = v.run;
  return (
    !!r &&
    typeof r.id === 'string' &&
    typeof r.lesson_id === 'string' &&
    typeof r.path_id === 'string' &&
    Array.isArray(r.queue) &&
    Array.isArray(r.attempts) &&
    (r.status === 'in_progress' || r.status === 'completed') &&
    (v.origin === 'device' || v.origin === 'server')
  );
}

/** The IndexedDB-backed content store of one user (see idb.ts for the object stores). */
export class ContentStore {
  constructor(private readonly db: OfflineDb) {}

  get persistent(): boolean {
    return this.db.persistent;
  }

  // ---- packs -------------------------------------------------------------------------------------------------

  async listMeta(): Promise<PackMeta[]> {
    return this.db.getAll<PackMeta>('meta');
  }

  async getMeta(lessonId: string): Promise<PackMeta | null> {
    return (await this.db.get<PackMeta>('meta', lessonId)) ?? null;
  }

  /** The pack with its keys (`keys` is [] when they were wiped), or null when absent or unreadable. */
  async getPack(lessonId: string): Promise<{ meta: PackMeta; pack: OfflinePack } | null> {
    const [meta, pub, keys] = await Promise.all([
      this.db.get<PackMeta>('meta', lessonId),
      this.db.get<StoredPackPublic>('packs', lessonId),
      this.db.get<OfflineKey[]>('keys', lessonId),
    ]);
    if (!meta || !pub) return null;
    const parsed = offlinePackSchema.safeParse({ ...pub, keys: meta.hasKeys ? (keys ?? []) : [] });
    if (!parsed.success) return null;
    return { meta, pack: parsed.data };
  }

  /**
   * Stores whole packs: for each lesson the public payload, its keys and its meta commit together (one transaction for
   * all of them), so a full disk never leaves a pack without keys. Throws the QuotaExceededError of the transaction.
   */
  async savePacks(packs: readonly OfflinePack[], info: SavePacksInfo): Promise<PackMeta[]> {
    const now = info.now ?? Date.now();
    const ops: BatchOp[] = [];
    const metas: PackMeta[] = [];
    for (const pack of packs) {
      const { keys, ...pub } = pack;
      const hashes = info.hashes.get(pack.lesson.id);
      const meta: PackMeta = {
        lessonId: pack.lesson.id,
        pathId: info.pathId,
        language: pack.lesson.language_code,
        contentVersion: pack.content_version,
        // Unknown hashes (the lesson changed between the manifest and the pack): the next diff refreshes it once.
        contentHash: hashes?.contentHash ?? '',
        exerciseVersionsHash: hashes?.exerciseVersionsHash ?? '',
        itemsHash: hashes?.itemsHash ?? '',
        savedAt: now,
        bytes: byteSize(pack),
        hasKeys: true,
      };
      metas.push(meta);
      ops.push(
        { store: 'packs', op: 'put', key: meta.lessonId, value: pub },
        { store: 'keys', op: 'put', key: meta.lessonId, value: keys },
        { store: 'meta', op: 'put', key: meta.lessonId, value: meta },
      );
    }
    await this.db.batch(ops);
    return metas;
  }

  async removePacks(lessonIds: readonly string[]): Promise<void> {
    const ops: BatchOp[] = lessonIds.flatMap((id) => [
      { store: 'packs' as const, op: 'delete' as const, key: id },
      { store: 'keys' as const, op: 'delete' as const, key: id },
      { store: 'meta' as const, op: 'delete' as const, key: id },
    ]);
    await this.db.batch(ops);
  }

  async touchPack(lessonId: string, now: number = Date.now()): Promise<void> {
    const meta = await this.getMeta(lessonId);
    if (meta) await this.db.put('meta', lessonId, { ...meta, lastOpenedAt: now });
  }

  /** Sign-out: the next person on this device must not be able to read answer keys. Lesson text stays. */
  async wipeKeys(): Promise<void> {
    const metas = await this.listMeta();
    await this.db.clear('keys');
    await this.db.batch(metas.map((m): BatchOp => ({ store: 'meta', op: 'put', key: m.lessonId, value: { ...m, hasKeys: false } })));
  }

  // ---- runs --------------------------------------------------------------------------------------------------

  async saveRun(stored: StoredRun): Promise<void> {
    await this.db.put('runs', stored.run.id, stored);
  }

  async getRun(runId: string): Promise<StoredRun | null> {
    const value = await this.db.get<unknown>('runs', runId);
    return validRun(value) ? value : null;
  }

  async deleteRun(runId: string): Promise<void> {
    await this.db.delete('runs', runId);
  }

  async listRuns(): Promise<StoredRun[]> {
    return (await this.db.getAll<unknown>('runs')).filter(validRun);
  }

  /** The open local run of a lesson on a path, else the most recently updated completed one not yet synced. */
  async findRun(lessonId: string, pathId: string): Promise<StoredRun | null> {
    const runs = (await this.listRuns()).filter((r) => r.run.lesson_id === lessonId && r.run.path_id === pathId && r.confirmedAt === undefined);
    runs.sort((a, b) => Number(b.run.status === 'in_progress') - Number(a.run.status === 'in_progress') || b.updatedAt - a.updatedAt);
    return runs[0] ?? null;
  }

  /** Re-keys a run after the server answered a start with another open run for the same lesson. */
  async remapRun(from: string, to: string): Promise<void> {
    const stored = await this.getRun(from);
    if (!stored) return;
    await this.db.batch([
      { store: 'runs', op: 'delete', key: from },
      { store: 'runs', op: 'put', key: to, value: { ...stored, run: { ...stored.run, id: to }, origin: 'server', updatedAt: Date.now() } },
    ]);
  }

  // ---- cached lists (stale-while-revalidate) -----------------------------------------------------------------

  async getList<T>(name: string, schema: ZodType<T>): Promise<{ data: T; savedAt: number } | null> {
    const value = await this.db.get<{ data?: unknown; savedAt?: unknown }>('lists', name);
    if (!value || typeof value.savedAt !== 'number') return null;
    const parsed = schema.safeParse(value.data);
    return parsed.success ? { data: parsed.data, savedAt: value.savedAt } : null;
  }

  async putList(name: string, data: unknown, now: number = Date.now()): Promise<void> {
    await this.db.put('lists', name, { data, savedAt: now });
  }

  // ---- whole store -------------------------------------------------------------------------------------------

  /** Total stored bytes of the packs (from their meta). */
  async packBytes(): Promise<number> {
    return (await this.listMeta()).reduce((sum, m) => sum + m.bytes, 0);
  }

  async clearAll(): Promise<void> {
    await Promise.all((['packs', 'keys', 'runs', 'meta', 'lists'] as const).map((s) => this.db.clear(s)));
  }

  close(): void {
    this.db.close();
  }
}

// One store per user for the page's lifetime: a second tab opens its own connection to the same database.
const stores = new Map<string, Promise<ContentStore>>();

export function getContentStore(userId: string): Promise<ContentStore> {
  let store = stores.get(userId);
  if (!store) {
    store = openOfflineDb(userId).then((db) => new ContentStore(db));
    stores.set(userId, store);
  }
  return store;
}

/** Closes and forgets the user's store (account deletion, tests). */
export async function releaseContentStore(userId: string): Promise<void> {
  const store = stores.get(userId);
  stores.delete(userId);
  if (store) (await store).close();
}
