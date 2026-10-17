import { readString, writeString } from '@/lib/storage';

/**
 * "Sẵn sàng dùng ngoại tuyến": raised once per device, when the service worker finishes its FIRST install (the app
 * shell is precached and controls the page). Updates never raise it, and a device that has seen it is not told again.
 */
export const OFFLINE_READY_KEY = 'linguo-offline-ready-v1';

type Listener = () => void;

class OfflineReadyStore {
  private visible = false;
  private snapshot = { offlineReady: false };
  private readonly listeners = new Set<Listener>();

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): { offlineReady: boolean } => this.snapshot;

  /** Called by register.ts when the first service worker activated. */
  markReady(): void {
    if (readString(OFFLINE_READY_KEY)) return;
    writeString(OFFLINE_READY_KEY, '1');
    this.set(true);
  }

  dismiss = (): void => this.set(false);

  /** Test hook. */
  reset(): void {
    this.set(false);
  }

  private set(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    this.snapshot = { offlineReady: visible };
    this.listeners.forEach((l) => l());
  }
}

export const offlineReadyStore = new OfflineReadyStore();
