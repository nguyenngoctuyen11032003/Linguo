// A tiny promise wrapper over IndexedDB for the offline content store, with an in-memory fallback.
//
// Why not localStorage: a language's lesson packs are ~4.4 MB raw (payload + answer keys), the whole localStorage
// quota is ~5 MB. Why not a library: the store needs five key/value object stores and one atomic multi-store batch.
//
// The memory fallback (no IndexedDB: private mode in some browsers, blocked storage, happy-dom in tests) keeps the
// same semantics for the session. `persistent` tells the UI that nothing survives a reload.

/** packs: public lesson payloads; keys: answer keys (wiped on sign-out); runs: runs made on the device; meta: PackMeta; lists: cached RPC lists. */
export const STORE_NAMES = ['packs', 'keys', 'runs', 'meta', 'lists'] as const;
export type StoreName = (typeof STORE_NAMES)[number];

export const DB_PREFIX = 'linguo-offline-v1:';
const DB_VERSION = 1;

export const dbNameFor = (userId: string): string => `${DB_PREFIX}${userId}`;

export type BatchOp = { store: StoreName; op: 'put'; key: string; value: unknown } | { store: StoreName; op: 'delete'; key: string };

export interface OfflineDb {
  /** False when the data lives in memory only (nothing survives a reload). */
  readonly persistent: boolean;
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  getAll<T>(store: StoreName): Promise<T[]>;
  keys(store: StoreName): Promise<string[]>;
  /** Applies every op in ONE transaction: all or nothing (a QuotaExceededError aborts the whole batch). */
  batch(ops: readonly BatchOp[]): Promise<void>;
  put(store: StoreName, key: string, value: unknown): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  clear(store: StoreName): Promise<void>;
  close(): void;
}

// ---- in-memory ------------------------------------------------------------------------------------------------

const clone = <T>(value: T): T => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

type MemoryTables = Record<StoreName, Map<string, unknown>>;
const memoryTables = new Map<string, MemoryTables>();

const newTables = (): MemoryTables => ({ packs: new Map(), keys: new Map(), runs: new Map(), meta: new Map(), lists: new Map() });

/** Test hook and sign-out helper: forgets a user's in-memory tables. */
export function dropMemoryDb(userId: string): void {
  memoryTables.delete(dbNameFor(userId));
}

function openMemory(name: string): OfflineDb {
  let tables = memoryTables.get(name);
  if (!tables) {
    tables = newTables();
    memoryTables.set(name, tables);
  }
  const t = tables;
  return {
    persistent: false,
    get: async (store, key) => {
      const v = t[store].get(key);
      return v === undefined ? undefined : (clone(v) as never);
    },
    getAll: async (store) => [...t[store].values()].map((v) => clone(v) as never),
    keys: async (store) => [...t[store].keys()],
    batch: async (ops) => {
      for (const o of ops) {
        if (o.op === 'put') t[o.store].set(o.key, clone(o.value));
        else t[o.store].delete(o.key);
      }
    },
    put: async (store, key, value) => {
      t[store].set(key, clone(value));
    },
    delete: async (store, key) => {
      t[store].delete(key);
    },
    clear: async (store) => {
      t[store].clear();
    },
    close: () => undefined,
  };
}

// ---- IndexedDB ------------------------------------------------------------------------------------------------

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('indexeddb_request_failed'));
  });
}

/** Resolves when the transaction COMMITS (not when the last request succeeds), rejects with its error on abort. */
function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('indexeddb_transaction_aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('indexeddb_transaction_failed'));
  });
}

function wrapIdb(db: IDBDatabase): OfflineDb {
  return {
    persistent: true,
    get: async (store, key) => {
      const tx = db.transaction(store, 'readonly');
      const value = await requestResult(tx.objectStore(store).get(key));
      return value as never;
    },
    getAll: async (store) => {
      const tx = db.transaction(store, 'readonly');
      return (await requestResult(tx.objectStore(store).getAll())) as never;
    },
    keys: async (store) => {
      const tx = db.transaction(store, 'readonly');
      const all = await requestResult(tx.objectStore(store).getAllKeys());
      return all.map(String);
    },
    batch: async (ops) => {
      if (ops.length === 0) return;
      const stores = [...new Set(ops.map((o) => o.store))];
      const tx = db.transaction(stores, 'readwrite');
      const done = transactionDone(tx);
      try {
        for (const o of ops) {
          const objectStore = tx.objectStore(o.store);
          if (o.op === 'put') objectStore.put(o.value, o.key);
          else objectStore.delete(o.key);
        }
      } catch (error) {
        // A synchronous failure (e.g. DataCloneError): nothing may be half written.
        try {
          tx.abort();
        } catch {
          // already finished
        }
        await done.catch(() => undefined);
        throw error;
      }
      await done;
    },
    put: async (store, key, value) => {
      const tx = db.transaction(store, 'readwrite');
      const done = transactionDone(tx);
      tx.objectStore(store).put(value, key);
      await done;
    },
    delete: async (store, key) => {
      const tx = db.transaction(store, 'readwrite');
      const done = transactionDone(tx);
      tx.objectStore(store).delete(key);
      await done;
    },
    clear: async (store) => {
      const tx = db.transaction(store, 'readwrite');
      const done = transactionDone(tx);
      tx.objectStore(store).clear();
      await done;
    },
    close: () => db.close(),
  };
}

function idbFactory(): IDBFactory | null {
  try {
    return typeof indexedDB === 'undefined' ? null : indexedDB;
  } catch {
    // Accessing indexedDB can throw SecurityError when storage is blocked.
    return null;
  }
}

function openIdb(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(name, DB_VERSION);
    } catch (error) {
      reject(error);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of STORE_NAMES) if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
    };
    request.onsuccess = () => {
      const db = request.result;
      // Another tab upgrading or deleting the database (account deletion): close so it is not blocked.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('indexeddb_open_failed'));
    request.onblocked = () => reject(new Error('indexeddb_open_blocked'));
  });
}

/** Opens the user's database; falls back to memory when IndexedDB is unavailable or fails to open. */
export async function openOfflineDb(userId: string, factory: IDBFactory | null = idbFactory()): Promise<OfflineDb> {
  const name = dbNameFor(userId);
  if (factory) {
    try {
      return wrapIdb(await openIdb(factory, name));
    } catch {
      // Fall through: the app keeps working with what it can hold for this session.
    }
  }
  return openMemory(name);
}

/** Deletes the user's whole database (account deletion). Never throws. */
export async function deleteOfflineDb(userId: string, factory: IDBFactory | null = idbFactory()): Promise<void> {
  dropMemoryDb(userId);
  if (!factory) return;
  await new Promise<void>((resolve) => {
    try {
      const request = factory.deleteDatabase(dbNameFor(userId));
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** True for the error IndexedDB/Cache raise when the origin's storage is full. */
export function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { name?: unknown; code?: unknown };
  return e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014;
}
