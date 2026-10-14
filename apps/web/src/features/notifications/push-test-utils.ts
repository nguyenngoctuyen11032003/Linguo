import { vi } from 'vitest';

// Browser push stand-ins for unit tests: Notification, PushManager and navigator.serviceWorker.

export interface FakeSubscription {
  endpoint: string;
  toJSON: () => { endpoint: string; keys: { p256dh: string; auth: string } };
  unsubscribe: ReturnType<typeof vi.fn>;
}

export function fakeSubscription(endpoint = 'https://push.example/sub-1'): FakeSubscription {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  };
}

export interface PushEnvOptions {
  permission?: NotificationPermission;
  /** What Notification.requestPermission resolves with. */
  answer?: NotificationPermission;
  subscription?: FakeSubscription | null;
  /** false: no service worker registration at all. */
  registered?: boolean;
}

export interface PushEnv {
  requestPermission: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  getSubscription: ReturnType<typeof vi.fn>;
  restore: () => void;
}

const KEYS = ['Notification', 'PushManager'] as const;

export function installPush({ permission = 'default', answer = 'granted', subscription = null, registered = true }: PushEnvOptions = {}): PushEnv {
  let current = subscription;
  const state = { permission };
  const requestPermission = vi.fn(async () => {
    state.permission = answer;
    return answer;
  });
  const created = fakeSubscription('https://push.example/new');
  const subscribe = vi.fn(async () => {
    current = created;
    return created;
  });
  const getSubscription = vi.fn(async () => current);
  const registration = { pushManager: { subscribe, getSubscription } };
  const NotificationStub = {
    get permission() {
      return state.permission;
    },
    requestPermission,
  };
  const target = window as unknown as Record<string, unknown>;
  const saved = KEYS.map((k) => [k, Object.getOwnPropertyDescriptor(target, k)] as const);
  Object.defineProperty(target, 'Notification', { value: NotificationStub, configurable: true, writable: true });
  Object.defineProperty(target, 'PushManager', { value: function PushManager() {}, configurable: true, writable: true });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: Promise.resolve(registration),
      getRegistration: vi.fn(async () => (registered ? registration : undefined)),
    },
  });
  return {
    requestPermission,
    subscribe,
    getSubscription,
    restore: () => {
      for (const [k, desc] of saved) {
        if (desc) Object.defineProperty(target, k, desc);
        else delete target[k];
      }
      delete (navigator as unknown as Record<string, unknown>).serviceWorker;
    },
  };
}

/** Removes every push API (an unsupported browser). */
export function removePush(): () => void {
  const target = window as unknown as Record<string, unknown>;
  const saved = KEYS.map((k) => [k, Object.getOwnPropertyDescriptor(target, k)] as const);
  for (const k of KEYS) delete target[k];
  delete (navigator as unknown as Record<string, unknown>).serviceWorker;
  return () => {
    for (const [k, desc] of saved) if (desc) Object.defineProperty(target, k, desc);
  };
}
