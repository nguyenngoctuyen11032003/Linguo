import { clearOfflineMedia } from '@/features/offline-media';
import { getContentStore, releaseContentStore } from './content-store';
import { DB_PREFIX, deleteOfflineDb } from './idb';

/** Names of every offline database on this device (user ids), where the browser can list them. */
async function knownUserIds(extra?: string | null): Promise<string[]> {
  const ids = new Set<string>();
  if (extra) ids.add(extra);
  try {
    const dbs = await (indexedDB as IDBFactory & { databases?: () => Promise<Array<{ name?: string }>> }).databases?.();
    for (const db of dbs ?? []) if (db.name?.startsWith(DB_PREFIX)) ids.add(db.name.slice(DB_PREFIX.length));
  } catch {
    // Not supported or blocked: only the given user can be handled.
  }
  return [...ids];
}

/**
 * Sign-out: the lesson text and the runs stay (so unsynced offline work is not lost and the next sign-in is instant),
 * but the answer keys of EVERY user on this device are wiped: the device may be handed to someone else and a key must
 * never outlive the session it was issued for. The keys are downloaded again at the next sign-in.
 * Account deletion: the user's whole database and the downloaded media go. Never throws.
 */
export async function wipeOfflineContent(userId: string | null | undefined, mode: 'sign-out' | 'delete'): Promise<void> {
  try {
    if (mode === 'delete') {
      if (userId) {
        await releaseContentStore(userId);
        await deleteOfflineDb(userId);
      }
      await clearOfflineMedia();
      return;
    }
    for (const id of await knownUserIds(userId)) {
      try {
        await (await getContentStore(id)).wipeKeys();
      } catch {
        // Keep wiping the others.
      }
    }
  } catch {
    // Never block sign-out or deletion.
  }
}
