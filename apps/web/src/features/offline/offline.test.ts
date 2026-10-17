import type { OfflineManifestRow, PathLesson } from '@linguo/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EX1, EX2, LESSON_ID, PATH_ID, offlinePack, pathLesson, run as serverRun } from '../lesson-player/lesson-fixtures';
import { getContentStore, releaseContentStore, type StoredRun } from './content-store';
import { dropMemoryDb } from './idb';
import { overlayLocalRuns } from './local-runs';
import { nextUnfinished } from './policy';
import { diffManifest, downloadPacks, estimateBytes, packIsComplete } from './pack-service';
import { readCachedPathLessons, writeCachedPathLessons } from './swr';
import { wipeOfflineContent } from './account-wipe';
import { localRunToPayload, startLocalRun } from '@linguo/shared';

let n = 0;
const newUser = () => `0000000${++n}-0000-4000-8000-000000000000`;
const created: string[] = [];
async function store() {
  const id = newUser();
  created.push(id);
  return { id, store: await getContentStore(id) };
}
afterEach(async () => {
  for (const id of created.splice(0)) {
    await releaseContentStore(id);
    dropMemoryDb(id);
  }
});

const row = (overrides: Partial<OfflineManifestRow> = {}): OfflineManifestRow => ({
  lesson_id: LESSON_ID,
  content_version: 1,
  content_hash: 'h1',
  exercise_versions_hash: 'e1',
  items_hash: 'i1',
  ...overrides,
});
const hashes = new Map([[LESSON_ID, { contentHash: 'h1', exerciseVersionsHash: 'e1', itemsHash: 'i1' }]]);

describe('ContentStore (in-memory fallback)', () => {
  it('stores a pack with its keys and meta, and reads it back whole', async () => {
    const { store: s } = await store();
    expect(s.persistent).toBe(false);
    const [meta] = await s.savePacks([offlinePack()], { pathId: PATH_ID, hashes, now: 1000 });
    expect(meta).toMatchObject({ lessonId: LESSON_ID, pathId: PATH_ID, contentVersion: 1, contentHash: 'h1', hasKeys: true, savedAt: 1000 });
    expect(meta!.bytes).toBeGreaterThan(100);
    const read = await s.getPack(LESSON_ID);
    expect(read?.pack).toEqual(offlinePack());
    expect((await s.listMeta()).map((m) => m.lessonId)).toEqual([LESSON_ID]);
    expect(await s.packBytes()).toBe(meta!.bytes);
  });

  it('wipeKeys keeps the lesson text but makes the pack ungradable; removePacks deletes everything', async () => {
    const { store: s } = await store();
    await s.savePacks([offlinePack()], { pathId: PATH_ID, hashes });
    await s.wipeKeys();
    const read = await s.getPack(LESSON_ID);
    expect(read?.meta.hasKeys).toBe(false);
    expect(read?.pack.keys).toEqual([]);
    expect(read?.pack.lesson.id).toBe(LESSON_ID);
    expect(packIsComplete(read!.pack)).toBe(false);
    await s.removePacks([LESSON_ID]);
    expect(await s.getPack(LESSON_ID)).toBeNull();
    expect(await s.listMeta()).toEqual([]);
  });

  it('ignores a corrupt pack record', async () => {
    const { store: s } = await store();
    await s.savePacks([offlinePack()], { pathId: PATH_ID, hashes });
    // @ts-expect-error reaching into the private db to simulate an old/garbled record
    await s.db.put('packs', LESSON_ID, { lesson: 'nope' });
    expect(await s.getPack(LESSON_ID)).toBeNull();
  });

  it('keeps runs: finds the open one first, remaps ids, hides confirmed ones', async () => {
    const { store: s } = await store();
    const pack = offlinePack();
    const r1 = startLocalRun({ id: serverRun().id, pathId: PATH_ID, pack, now: '2026-10-17T08:00:00.000Z' });
    const stored: StoredRun = { run: r1, origin: 'device', updatedAt: 1 };
    await s.saveRun(stored);
    expect((await s.findRun(LESSON_ID, PATH_ID))?.run.id).toBe(r1.id);
    expect(await s.findRun(LESSON_ID, 'other-path')).toBeNull();
    const to = '40000000-0000-4000-8000-0000000000ff';
    await s.remapRun(r1.id, to);
    expect(await s.getRun(r1.id)).toBeNull();
    expect(await s.getRun(to)).toMatchObject({ origin: 'server', run: { id: to } });
    await s.saveRun({ ...(await s.getRun(to))!, confirmedAt: 5 });
    expect(await s.findRun(LESSON_ID, PATH_ID)).toBeNull();
    expect(await s.listRuns()).toHaveLength(1);
  });

  it('lists are validated on read', async () => {
    const { id } = await store();
    await writeCachedPathLessons(id, PATH_ID, [pathLesson()]);
    expect((await readCachedPathLessons(id, PATH_ID))?.data).toEqual([pathLesson()]);
    await writeCachedPathLessons(id, 'p2', []);
    expect(await readCachedPathLessons(id, 'p2')).toBeNull();
    const s = await getContentStore(id);
    await s.putList(`path_lessons:${PATH_ID}`, [{ wrong: true }]);
    expect(await readCachedPathLessons(id, PATH_ID)).toBeNull();
  });

  it('sign-out wipes the keys of every known user, account deletion removes the user entirely', async () => {
    const { id, store: s } = await store();
    await s.savePacks([offlinePack()], { pathId: PATH_ID, hashes });
    await wipeOfflineContent(id, 'sign-out');
    expect((await s.getPack(LESSON_ID))?.meta.hasKeys).toBe(false);
    await wipeOfflineContent(id, 'delete');
    const fresh = await getContentStore(id);
    expect(await fresh.listMeta()).toEqual([]);
  });
});

describe('diffManifest', () => {
  const meta = async (overrides: Record<string, unknown> = {}) => {
    const { store: s } = await store();
    await s.savePacks([offlinePack()], { pathId: PATH_ID, hashes });
    return (await s.listMeta()).map((m) => ({ ...m, ...overrides }));
  };

  it('splits lessons into up to date, stale, missing and orphaned', async () => {
    const other = '20000000-0000-4000-8000-000000000009';
    expect(diffManifest(PATH_ID, [row()], await meta())).toEqual({ upToDate: [LESSON_ID], stale: [], missing: [], orphaned: [] });
    expect(diffManifest(PATH_ID, [row({ exercise_versions_hash: 'e2' })], await meta()).stale).toEqual([LESSON_ID]);
    expect(diffManifest(PATH_ID, [row({ content_version: 2 })], await meta()).stale).toEqual([LESSON_ID]);
    expect(diffManifest(PATH_ID, [row(), row({ lesson_id: other })], await meta()).missing).toEqual([other]);
    // A pack stored without keys (after sign-out) is stale.
    expect(diffManifest(PATH_ID, [row()], await meta({ hasKeys: false })).stale).toEqual([LESSON_ID]);
    // Stored for this path but gone from its list.
    expect(diffManifest(PATH_ID, [row({ lesson_id: other })], await meta()).orphaned).toEqual([LESSON_ID]);
    // Another path's pack is never an orphan here, and an empty manifest never deletes anything.
    expect(diffManifest('other-path', [row({ lesson_id: other })], await meta()).orphaned).toEqual([]);
    expect(diffManifest(PATH_ID, [], await meta()).orphaned).toEqual([]);
  });

  it('quotes sizes from what is already stored', async () => {
    expect(estimateBytes(4, [])).toBe(4 * 25 * 1024);
    expect(estimateBytes(2, await meta({ bytes: 1000 }))).toBe(2000);
  });
});

describe('downloadPacks', () => {
  const l2 = '20000000-0000-4000-8000-000000000002';
  const pack2 = () => {
    const p = offlinePack();
    return { ...p, lesson: { ...p.lesson, id: l2 }, keys: p.keys };
  };

  function client(handlers: Record<string, (args: Record<string, unknown>) => { data?: unknown; error?: unknown }>) {
    const calls: Array<[string, Record<string, unknown>]> = [];
    const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
      calls.push([name, args]);
      const { data = null, error = null } = handlers[name]?.(args) ?? { error: { message: 'no fake', code: 'X' } };
      return Promise.resolve({ data, error });
    });
    return { client: { rpc } as never, calls };
  }

  it('fetches the manifest, downloads in batches, stores packs with the manifest hashes and reports progress', async () => {
    const { store: s } = await store();
    const { client: c, calls } = client({
      offline_lesson_manifest: () => ({ data: [row(), row({ lesson_id: l2 })] }),
      offline_lesson_packs: (args) => ({ data: { packs: (args.p_lesson_ids as string[]).map((id) => (id === l2 ? pack2() : offlinePack())), missing: [] } }),
    });
    const progress: number[] = [];
    const out = await downloadPacks({ client: c, store: s, pathId: PATH_ID, lessonIds: [LESSON_ID, l2], batchSize: 1, media: false, onProgress: (p) => progress.push(p.done) });
    expect(out).toMatchObject({ saved: [LESSON_ID, l2], failed: [], missing: [], aborted: false, quotaExceeded: false });
    expect(calls.filter(([name]) => name === 'offline_lesson_packs')).toHaveLength(2);
    expect(progress.at(-1)).toBe(2);
    const metas = await s.listMeta();
    expect(metas.map((m) => m.contentHash)).toEqual(['h1', 'h1']);
  });

  it('reports lessons that are no longer in the path as missing and refuses a pack without a key for every exercise', async () => {
    const { store: s } = await store();
    const broken = { ...offlinePack(), keys: offlinePack().keys.slice(0, 1) };
    const { client: c } = client({
      offline_lesson_manifest: () => ({ data: [row()] }),
      offline_lesson_packs: () => ({ data: { packs: [broken], missing: [] } }),
    });
    const out = await downloadPacks({ client: c, store: s, pathId: PATH_ID, lessonIds: [LESSON_ID, l2], media: false });
    expect(out.missing).toEqual([l2]);
    expect(out.failed).toEqual([LESSON_ID]);
    expect(out.saved).toEqual([]);
    expect(await s.listMeta()).toEqual([]);
    expect(packIsComplete(broken)).toBe(false);
    expect(broken.keys.some((k) => k.exercise_id === EX2)).toBe(false);
  });

  it('stops on a network error and keeps what is stored (resumable)', async () => {
    const { store: s } = await store();
    let call = 0;
    const { client: c } = client({
      offline_lesson_manifest: () => ({ data: [row(), row({ lesson_id: l2 })] }),
      offline_lesson_packs: () => (++call === 1 ? { data: { packs: [offlinePack()], missing: [] } } : { error: { message: 'TypeError: Failed to fetch', code: '' } }),
    });
    const out = await downloadPacks({ client: c, store: s, pathId: PATH_ID, lessonIds: [LESSON_ID, l2], batchSize: 1, media: false });
    expect(out.saved).toEqual([LESSON_ID]);
    expect(out.error).toBeTruthy();
    expect((await s.listMeta()).map((m) => m.lessonId)).toEqual([LESSON_ID]);
  });

  it('on a full disk evicts packs of completed lessons, retries, and gives up when there is nothing to evict', async () => {
    const { store: s } = await store();
    const old = '20000000-0000-4000-8000-0000000000aa';
    await s.savePacks([{ ...offlinePack(), lesson: { ...offlinePack().lesson, id: old } }], { pathId: PATH_ID, hashes: new Map() });
    const quota = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    const realSave = s.savePacks.bind(s);
    let full = true;
    vi.spyOn(s, 'savePacks').mockImplementation(async (...args) => {
      if (full) throw quota;
      return realSave(...args);
    });
    const removeSpy = vi.spyOn(s, 'removePacks').mockImplementation(async () => {
      full = false;
    });
    const { client: c } = client({
      offline_lesson_manifest: () => ({ data: [row()] }),
      offline_lesson_packs: () => ({ data: { packs: [offlinePack()], missing: [] } }),
    });
    const out = await downloadPacks({ client: c, store: s, pathId: PATH_ID, lessonIds: [LESSON_ID], media: false, evictable: async () => [old] });
    expect(removeSpy).toHaveBeenCalledWith([old]);
    expect(out.saved).toEqual([LESSON_ID]);

    full = true;
    const none = await downloadPacks({ client: c, store: s, pathId: PATH_ID, lessonIds: [LESSON_ID], media: false, evictable: async () => [] });
    expect(none.quotaExceeded).toBe(true);
    expect(none.failed).toEqual([LESSON_ID]);
  });

  it('honours an aborted signal before the first batch', async () => {
    const { store: s } = await store();
    const { client: c, calls } = client({ offline_lesson_manifest: () => ({ data: [row()] }) });
    const controller = new AbortController();
    controller.abort();
    const out = await downloadPacks({ client: c, store: s, pathId: PATH_ID, lessonIds: [LESSON_ID], media: false, signal: controller.signal });
    expect(out.aborted).toBe(true);
    expect(calls.filter(([name]) => name === 'offline_lesson_packs')).toEqual([]);
  });
});

describe('overlayLocalRuns', () => {
  const A = pathLesson({ lesson_id: 'a', lesson_order: 1 });
  const B = pathLesson({ lesson_id: 'b', lesson_order: 2, prerequisite_ids: ['a'], prerequisites_met: false });
  const C = pathLesson({ lesson_id: 'c', lesson_order: 3, prerequisite_ids: ['b'], prerequisites_met: false });
  const stored = (lessonId: string, status: 'in_progress' | 'completed', pathId = PATH_ID): StoredRun => ({
    origin: 'device',
    updatedAt: 1,
    run: { ...startLocalRun({ id: `run-${lessonId}`, pathId, pack: { lesson: { ...offlinePack().lesson, id: lessonId }, exercises: [] }, now: '2026-10-17T08:00:00Z' }), status },
  });

  it('shows a lesson finished on the device as completed and unlocks the next one', () => {
    const out = overlayLocalRuns([A, B, C], [stored('a', 'completed')], PATH_ID);
    expect(out.map((l) => [l.run_status, l.prerequisites_met])).toEqual([
      ['completed', true],
      ['not_started', true],
      ['not_started', false],
    ]);
  });

  it('marks a started lesson in progress, never downgrades the server, ignores other paths', () => {
    expect(overlayLocalRuns([A], [stored('a', 'in_progress')], PATH_ID)[0]!.run_status).toBe('in_progress');
    const done: PathLesson = { ...A, run_status: 'completed' };
    expect(overlayLocalRuns([done], [stored('a', 'in_progress')], PATH_ID)[0]).toBe(done);
    expect(overlayLocalRuns([A], [stored('a', 'completed', 'x')], PATH_ID)).toEqual([A]);
  });

  it('returns the same list when there is nothing to overlay', () => {
    const lessons = [A, B];
    expect(overlayLocalRuns(lessons, [], PATH_ID)).toBe(lessons);
  });
});

describe('nextUnfinished', () => {
  it('takes the in-progress lessons first, then the not-started ones, in path order, skipping completed', () => {
    const l = (id: string, order: number, run_status: PathLesson['run_status']) => pathLesson({ lesson_id: id, lesson_order: order, run_status });
    const out = nextUnfinished([l('d', 4, 'not_started'), l('a', 1, 'completed'), l('b', 2, 'not_started'), l('c', 3, 'in_progress'), l('e', 5, 'not_started')], 3);
    expect(out.map((x) => x.lesson_id)).toEqual(['c', 'b', 'd']);
  });
});

describe('localRunToPayload round trip', () => {
  it('keeps the pack identical to a server payload for the player', () => {
    const pack = offlinePack();
    const r = startLocalRun({ id: serverRun().id, pathId: PATH_ID, pack, now: '2026-10-17T08:00:00.000Z' });
    const payload = localRunToPayload(pack, r);
    expect(payload.exercises.map((e) => e.id)).toEqual([EX1, EX2]);
    expect(payload.run?.queue).toEqual([EX1, EX2]);
  });
});
