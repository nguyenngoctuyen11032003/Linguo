import type { NotificationPrefs } from '@linguo/shared';
import { env } from '@/lib/env';
import type { AppSupabaseClient } from '@/lib/supabase';
import { deletePushSubscription, savePushSubscription, setNotificationPrefs } from './service';

// Spec 10 §5: device notifications. Permission is only ever requested from enablePush(), which the UI calls from a
// click handler; the subscription goes through the service worker registered by features/pwa.

export type PushState = 'unsupported' | 'default' | 'denied' | 'granted-subscribed' | 'granted-unsubscribed';

/** Why push is 'unsupported': the browser lacks the APIs, or this build has no VITE_VAPID_PUBLIC_KEY. */
export type PushSupport = 'supported' | 'browser' | 'not_configured';

/** How long enablePush waits for `navigator.serviceWorker.ready` before giving up. */
export const SW_READY_TIMEOUT_MS = 10_000;

export function getPushSupport(): PushSupport {
  if (
    typeof window === 'undefined' ||
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    return 'browser';
  }
  return env.vapidPublicKey ? 'supported' : 'not_configured';
}

/** The registration that controls this page, without waiting for one that may never come. */
async function currentRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  try {
    return await navigator.serviceWorker.getRegistration();
  } catch {
    return undefined;
  }
}

async function readyRegistration(): Promise<ServiceWorkerRegistration> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('push_sw_unavailable')), SW_READY_TIMEOUT_MS);
  });
  try {
    return await Promise.race([navigator.serviceWorker.ready, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function getPushState(): Promise<PushState> {
  if (getPushSupport() !== 'supported') return 'unsupported';
  const permission = Notification.permission;
  if (permission === 'denied') return 'denied';
  if (permission !== 'granted') return 'default';
  const registration = await currentRegistration();
  const subscription = registration ? await registration.pushManager.getSubscription().catch(() => null) : null;
  return subscription ? 'granted-subscribed' : 'granted-unsubscribed';
}

/** VAPID public key (base64url) → the BufferSource PushManager.subscribe expects. */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function subscriptionKeys(subscription: PushSubscription) {
  const json = subscription.toJSON();
  return {
    endpoint: json.endpoint ?? subscription.endpoint,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
    userAgent: typeof navigator.userAgent === 'string' ? navigator.userAgent : '',
  };
}

export interface PushResult {
  state: PushState;
  /** The saved prefs when push_enabled changed. */
  prefs: NotificationPrefs | null;
}

/**
 * Must be called from a user gesture (click). Requests permission first (before any await, so the browser still
 * sees the gesture), then subscribes, stores the subscription and sets push_enabled. Throws a coded Error
 * (see error-map PUSH_MESSAGES) or an RPC error on failure.
 */
export async function enablePush(client: AppSupabaseClient): Promise<PushResult> {
  const support = getPushSupport();
  if (support === 'browser') throw new Error('push_unsupported');
  if (support === 'not_configured') throw new Error('push_not_configured');
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission === 'denied') return { state: 'denied', prefs: null };
  if (permission !== 'granted') return { state: 'default', prefs: null };

  const registration = await readyRegistration();
  let subscription: PushSubscription;
  try {
    subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(env.vapidPublicKey ?? ''),
      }));
  } catch {
    throw new Error('push_subscribe_failed');
  }
  await savePushSubscription(client, subscriptionKeys(subscription));
  const prefs = await setNotificationPrefs(client, { push_enabled: true });
  return { state: 'granted-subscribed', prefs };
}

/** How long signing out waits for the browser and the network to release this device's push subscription. */
export const SIGN_OUT_PUSH_TIMEOUT_MS = 2_500;

/**
 * Called just before auth.signOut(): a device that signs out must stop receiving that learner's reminders. Best
 * effort and never blocking: unsubscribes this browser's push subscription, then asks the server to forget the
 * endpoint (while the session still allows it). It leaves push_enabled alone (a preference of the account, not of
 * the device), swallows every error (offline, no service worker, RPC failure: a dead endpoint is deleted by the
 * dispatcher on its first 404/410) and gives up after `timeoutMs`. Never throws.
 */
export async function releasePushOnSignOut(client: AppSupabaseClient, timeoutMs: number = SIGN_OUT_PUSH_TIMEOUT_MS): Promise<void> {
  const work = (async () => {
    if (getPushSupport() !== 'supported') return;
    const registration = await currentRegistration();
    const subscription = registration ? await registration.pushManager.getSubscription().catch(() => null) : null;
    if (!subscription) return;
    const { endpoint } = subscription;
    await subscription.unsubscribe().catch(() => false);
    await deletePushSubscription(client, endpoint).catch(() => undefined);
  })().catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  try {
    await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Unsubscribes this device, forgets it server-side and turns push_enabled off. */
export async function disablePush(client: AppSupabaseClient): Promise<PushResult> {
  if (getPushSupport() === 'supported') {
    const registration = await currentRegistration();
    const subscription = registration ? await registration.pushManager.getSubscription().catch(() => null) : null;
    if (subscription) {
      const { endpoint } = subscription;
      await subscription.unsubscribe().catch(() => false);
      await deletePushSubscription(client, endpoint);
    }
  }
  const prefs = await setNotificationPrefs(client, { push_enabled: false });
  return { state: await getPushState(), prefs };
}
