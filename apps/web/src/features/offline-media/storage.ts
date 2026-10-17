// Thin wrappers over the Storage API (navigator.storage) used by the offline settings. Every call is feature-detected
// and never throws: browsers without it (older Safari, insecure context, happy-dom) just report "unsupported".
export { OFFLINE_MEDIA_CACHE } from './constants';

export type PersistenceResult = 'persisted' | 'denied' | 'unsupported';

function storageManager(): StorageManager | null {
  try {
    return typeof navigator !== 'undefined' && navigator.storage ? navigator.storage : null;
  } catch {
    return null;
  }
}

/**
 * Asks the browser not to evict our data under storage pressure. Chrome decides from engagement (installed PWA ⇒
 * usually granted without a prompt), Firefox prompts, Safari grants for installed apps. Safe to call repeatedly.
 */
export async function requestPersistence(): Promise<PersistenceResult> {
  const storage = storageManager();
  if (!storage || typeof storage.persist !== 'function') return 'unsupported';
  try {
    if (typeof storage.persisted === 'function' && (await storage.persisted())) return 'persisted';
    return (await storage.persist()) ? 'persisted' : 'denied';
  } catch {
    return 'denied';
  }
}

/** True when the origin's storage is already marked persistent (false when unknown/unsupported). */
export async function isPersisted(): Promise<boolean> {
  const storage = storageManager();
  if (!storage || typeof storage.persisted !== 'function') return false;
  try {
    return await storage.persisted();
  } catch {
    return false;
  }
}

/** Bytes used / available for this origin, or null when the browser cannot say. Estimates are approximate. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  const storage = storageManager();
  if (!storage || typeof storage.estimate !== 'function') return null;
  try {
    const { usage, quota } = await storage.estimate();
    if (typeof usage !== 'number' || typeof quota !== 'number' || !Number.isFinite(usage) || !Number.isFinite(quota)) return null;
    return { usage, quota };
  } catch {
    return null;
  }
}

/** True for the error a full disk / exhausted quota throws from cache.put, IndexedDB and localStorage. */
export function isQuotaExceededError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { name?: unknown; code?: unknown };
  return e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014;
}
