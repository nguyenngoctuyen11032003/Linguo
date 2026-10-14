// Spec 10 §3: one Web Push request (RFC 8030) with VAPID (RFC 8292) and aes128gcm payload encryption
// (RFC 8291). Encryption and signing come from @block65/webcrypto-web-push (pure WebCrypto, no node:crypto),
// the HTTP request goes through the injected fetch so tests never touch the network.
import { buildPushPayload } from '@block65/webcrypto-web-push';
import type { PushOutcome, PushPayload, PushSender, PushTarget, VapidConfig } from './handler.ts';

/** A reminder older than this is stale; the push service may drop it instead of delivering late. */
export const PUSH_TTL_SECONDS = 4 * 60 * 60;
const PUSH_TIMEOUT_MS = 10_000;

function fromBase64Url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  try {
    return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * True when the VAPID pair is usable: public key = 65-byte uncompressed P-256 point (base64url, as printed by
 * `npx web-push generate-vapid-keys`), private key = its 32-byte scalar, subject = mailto: or https: URL, and
 * a signature made with the private key verifies with the public key. WebCrypto in Deno accepts a garbage JWK
 * without complaint, so without this a typo would sign invalid JWTs, every push would get 401/403 and the
 * failure counter would end up deleting every subscription.
 */
export async function isValidVapid(vapid: VapidConfig): Promise<boolean> {
  if (!/^(mailto:\S+@\S+|https:\/\/\S+)$/.test(vapid.subject)) return false;
  const pub = fromBase64Url(vapid.publicKey);
  const priv = fromBase64Url(vapid.privateKey);
  if (!pub || pub.length !== 65 || pub[0] !== 4 || !priv || priv.length !== 32) return false;
  try {
    const alg = { name: 'ECDSA', namedCurve: 'P-256' };
    const signer = await crypto.subtle.importKey(
      'jwk',
      { kty: 'EC', crv: 'P-256', x: toBase64Url(pub.slice(1, 33)), y: toBase64Url(pub.slice(33)), d: vapid.privateKey },
      alg,
      false,
      ['sign'],
    );
    const verifier = await crypto.subtle.importKey('raw', pub as BufferSource, alg, false, ['verify']);
    const data = new TextEncoder().encode('linguo-vapid-check');
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signer, data);
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, verifier, sig, data);
  } catch {
    return false;
  }
}

export function createWebPushSender(
  fetchImpl: (input: string, init: RequestInit) => Promise<Response>,
  timeoutMs = PUSH_TIMEOUT_MS,
): PushSender {
  return async (target: PushTarget, payload: PushPayload, vapid: VapidConfig): Promise<PushOutcome> => {
    // Throws on a malformed VAPID key or subscription: the handler treats that as a local error and
    // leaves the subscription alone (it is not the push service's fault).
    const request = await buildPushPayload(
      { data: payload, options: { ttl: PUSH_TTL_SECONDS, urgency: 'normal' } },
      { endpoint: target.endpoint, expirationTime: null, keys: { p256dh: target.p256dh, auth: target.auth } },
      { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
    );
    try {
      const res = await fetchImpl(target.endpoint, {
        method: 'POST',
        headers: request.headers,
        body: request.body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      await res.body?.cancel().catch(() => {});
      return { status: res.status };
    } catch {
      // DNS, TLS, reset, timeout: transient from our point of view.
      return { status: null };
    }
  };
}
