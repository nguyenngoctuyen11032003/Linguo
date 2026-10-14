import { SW_MESSAGE_SKIP_WAITING } from './sw-helpers';
import { startNotificationClickListener } from './notification-click';

/** How often a visible tab asks the server for a newer service worker. */
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

type Listener = () => void;

/**
 * Waiting-worker state behind useSwUpdate(). A new worker only activates when applyUpdate() is called from
 * the "Tải lại" button; the page then reloads once, on controllerchange. Nothing ever reloads by itself.
 */
class SwUpdateStore {
  private waiting: ServiceWorker | null = null;
  private dismissed = false;
  private reloading = false;
  private listening = false;
  private readonly listeners = new Set<Listener>();
  private snapshot = { updateAvailable: false };

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): { updateAvailable: boolean } => this.snapshot;

  setWaiting(worker: ServiceWorker | null): void {
    if (worker === this.waiting) return;
    this.waiting = worker;
    this.dismissed = false;
    this.emit();
  }

  /** "Để sau": hide the toast until another new version arrives. */
  dismiss = (): void => {
    this.dismissed = true;
    this.emit();
  };

  /** Called from the user's tap only. */
  applyUpdate = (container: ServiceWorkerContainer | undefined = navigatorContainer(), reload: () => void = () => window.location.reload()): void => {
    const worker = this.waiting;
    if (!worker) return;
    if (container && !this.listening) {
      this.listening = true;
      container.addEventListener('controllerchange', () => {
        if (this.reloading) return;
        this.reloading = true;
        reload();
      });
    }
    worker.postMessage({ type: SW_MESSAGE_SKIP_WAITING });
  };

  /** Test hook: forget every waiting worker and listener state. */
  reset(): void {
    this.waiting = null;
    this.dismissed = false;
    this.reloading = false;
    this.listening = false;
    this.emit();
  }

  private emit(): void {
    const updateAvailable = this.waiting !== null && !this.dismissed;
    if (updateAvailable !== this.snapshot.updateAvailable) this.snapshot = { updateAvailable };
    this.listeners.forEach((l) => l());
  }
}

export const swUpdateStore = new SwUpdateStore();

function navigatorContainer(): ServiceWorkerContainer | undefined {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? navigator.serviceWorker : undefined;
}

/** Absolute path of BASE_URL ('/', '/Linguo/'); a relative base ('./') is taken from the site root. */
export function swBasePath(base: string): string {
  if (base.startsWith('/')) return base.endsWith('/') ? base : `${base}/`;
  if (/^https?:\/\//.test(base)) {
    const path = new URL(base).pathname;
    return path.endsWith('/') ? path : `${path}/`;
  }
  return '/';
}

export interface RegisterOptions {
  /** Defaults to production builds that are not running under Vitest. */
  enabled?: boolean;
  /** Defaults to import.meta.env.BASE_URL. */
  base?: string;
  /** Defaults to navigator.serviceWorker. */
  container?: ServiceWorkerContainer;
}

/**
 * Registers `<BASE_URL>sw.js` with scope BASE_URL. No-op (resolves null) in dev, in tests, when service
 * workers are unsupported or when registration fails (the app works fine without it). Call once at
 * startup, before rendering, so a notification-click message sent to a freshly opened window is buffered.
 */
export async function registerServiceWorker(options: RegisterOptions = {}): Promise<ServiceWorkerRegistration | null> {
  const enabled = options.enabled ?? (import.meta.env.PROD && import.meta.env.MODE !== 'test');
  const container = options.container ?? navigatorContainer();
  if (!enabled || !container) return null;

  startNotificationClickListener(container);
  const base = swBasePath(options.base ?? import.meta.env.BASE_URL);

  let registration: ServiceWorkerRegistration;
  try {
    registration = await container.register(`${base}sw.js`, { scope: base });
  } catch {
    return null;
  }

  // A worker that finished installing while a controller exists is an update waiting for the learner.
  if (registration.waiting && container.controller) swUpdateStore.setWaiting(registration.waiting);
  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed' && container.controller) swUpdateStore.setWaiting(installing);
    });
  });

  let lastCheck = Date.now();
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastCheck < UPDATE_CHECK_INTERVAL_MS) return;
      lastCheck = Date.now();
      registration.update().catch(() => undefined);
    });
  }
  return registration;
}
