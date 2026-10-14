// The real sender (pinned Web Push library + WebCrypto) against a fake fetch: no network. Decrypts the body
// as a browser would (RFC 8291 aes128gcm) to prove the payload is exactly title/body/url/notification_id.
import assert from 'node:assert/strict';
import type { PushPayload, PushTarget } from './handler.ts';
import { createWebPushSender, isValidVapid, PUSH_TTL_SECONDS } from './push.ts';

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const text = (s: string) => new TextEncoder().encode(s);
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

async function vapidKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return { publicKey: b64url(raw), privateKey: jwk.d!, subject: 'mailto:ops@example.com' };
}

/** What a browser holds for one PushSubscription. */
async function browserSubscription(endpoint: string) {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const authSecret = crypto.getRandomValues(new Uint8Array(16));
  const target: PushTarget = { endpoint, p256dh: b64url(uaPublic), auth: b64url(authSecret) };
  return { target, privateKey: pair.privateKey, uaPublic, authSecret };
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource },
      key,
      bytes * 8,
    ),
  );
}

/** RFC 8291 §3 + RFC 8188 decryption of a single-record aes128gcm body. */
async function decrypt(body: Uint8Array, sub: Awaited<ReturnType<typeof browserSubscription>>): Promise<string> {
  const salt = body.slice(0, 16);
  const idlen = body[20]!;
  const asPublic = body.slice(21, 21 + idlen);
  const ciphertext = body.slice(21 + idlen);
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, sub.privateKey, 256));
  const ikm = await hkdf(sub.authSecret, ecdh, concat(text('WebPush: info\0'), sub.uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, text('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, text('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, ['decrypt']);
  const padded = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, aes, ciphertext));
  let end = padded.length - 1;
  while (end > 0 && padded[end] === 0) end--;
  assert.equal(padded[end], 2, 'last-record delimiter');
  return new TextDecoder().decode(padded.slice(0, end));
}

const PAYLOAD: PushPayload = {
  notification_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  title: 'Học tiếp bài đang dở nhé',
  body: 'Bài "Chào hỏi" còn 3 bước',
  url: '/app/hoc/bai-1',
};

type Call = { url: string; init: RequestInit };

Deno.test('sends an RFC 8291/8292 request that the browser can decrypt to exactly the push payload', async () => {
  const vapid = await vapidKeys();
  const sub = await browserSubscription('https://fcm.googleapis.com/fcm/send/abc123');
  const calls: Call[] = [];
  const send = createWebPushSender((url, init) => {
    calls.push({ url, init });
    return Promise.resolve(new Response(null, { status: 201 }));
  });

  assert.deepEqual(await send(sub.target, PAYLOAD, vapid), { status: 201 });
  assert.equal(calls.length, 1);
  const { url, init } = calls[0]!;
  assert.equal(url, 'https://fcm.googleapis.com/fcm/send/abc123');
  assert.equal(init.method, 'POST');
  assert.ok(init.signal, 'request has a timeout signal');

  const headers = new Headers(init.headers);
  assert.equal(headers.get('content-encoding'), 'aes128gcm');
  assert.equal(headers.get('ttl'), String(PUSH_TTL_SECONDS));
  const auth = headers.get('authorization') ?? '';
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(auth);
  assert.ok(m, 'VAPID authorization header');
  assert.equal(m[2], vapid.publicKey);
  const claims = JSON.parse(new TextDecoder().decode(fromB64url(m[1]!.split('.')[1]!)));
  assert.equal(claims.aud, 'https://fcm.googleapis.com');
  assert.equal(claims.sub, vapid.subject);

  const decrypted = JSON.parse(await decrypt(init.body as Uint8Array, sub));
  assert.deepEqual(decrypted, PAYLOAD);
});

Deno.test('returns the push service status (410, 500) and null on a network error', async () => {
  const vapid = await vapidKeys();
  const sub = await browserSubscription('https://updates.push.services.mozilla.com/wpush/v2/xyz');
  for (const status of [410, 404, 500]) {
    const send = createWebPushSender(() => Promise.resolve(new Response('gone', { status })));
    assert.deepEqual(await send(sub.target, PAYLOAD, vapid), { status });
  }
  const offline = createWebPushSender(() => Promise.reject(new TypeError('network down')));
  assert.deepEqual(await offline(sub.target, PAYLOAD, vapid), { status: null });
});

Deno.test('a malformed stored p256dh key throws before any request (the handler counts it, keeps the row)', async () => {
  const vapid = await vapidKeys();
  const sub = await browserSubscription('https://web.push.apple.com/abc');
  let called = false;
  const send = createWebPushSender(() => {
    called = true;
    return Promise.resolve(new Response(null, { status: 201 }));
  });
  await assert.rejects(send({ ...sub.target, p256dh: 'bad' }, PAYLOAD, vapid));
  assert.equal(called, false);
});

Deno.test('isValidVapid accepts a real pair and rejects typos, swapped or mismatched keys, bad subjects', async () => {
  const good = await vapidKeys();
  const other = await vapidKeys();
  assert.equal(await isValidVapid(good), true);
  assert.equal(await isValidVapid({ ...good, subject: 'https://linguo.example.com' }), true);
  const bad = [
    { ...good, publicKey: 'bad' },
    { ...good, privateKey: 'bad' },
    { ...good, publicKey: good.privateKey, privateKey: good.publicKey },
    { ...good, privateKey: other.privateKey },
    { ...good, publicKey: good.publicKey + '=' },
    { ...good, subject: 'ops@example.com' },
    { ...good, subject: 'http://example.com' },
  ];
  for (const [i, v] of bad.entries()) assert.equal(await isValidVapid(v), false, `case ${i}`);
});

Deno.test('requests never follow redirects: redirect: manual, and any 3xx is reported as that status', async () => {
  const vapid = await vapidKeys();
  const sub = await browserSubscription('https://fcm.googleapis.com/fcm/send/abc123');
  const inits: RequestInit[] = [];
  for (const status of [301, 302, 307, 308]) {
    const send = createWebPushSender((_url, init) => {
      inits.push(init);
      return Promise.resolve(new Response(null, { status, headers: { location: 'http://169.254.169.254/latest/meta-data/' } }));
    });
    assert.deepEqual(await send(sub.target, PAYLOAD, vapid), { status });
  }
  assert.equal(inits.length, 4);
  for (const init of inits) assert.equal(init.redirect, 'manual');
});

Deno.test('an opaque redirect (status 0) is reported as a 3xx failure, never as success', async () => {
  const vapid = await vapidKeys();
  const sub = await browserSubscription('https://fcm.googleapis.com/fcm/send/abc123');
  const opaque = { status: 0, type: 'opaqueredirect', body: null } as unknown as Response;
  const send = createWebPushSender(() => Promise.resolve(opaque));
  assert.deepEqual(await send(sub.target, PAYLOAD, vapid), { status: 302 });
});

Deno.test('the endpoint host is re-checked before sending: nothing is fetched outside the allowlist', async () => {
  const vapid = await vapidKeys();
  let called = 0;
  const send = createWebPushSender(() => {
    called++;
    return Promise.resolve(new Response(null, { status: 201 }));
  });
  for (const endpoint of [
    'https://169.254.169.254/latest/meta-data/',
    'https://localhost/x',
    'https://push.example.com/x',
    'https://user@fcm.googleapis.com/x',
    'https://fcm.googleapis.com:8443/x',
    'http://fcm.googleapis.com/x',
  ]) {
    const sub = await browserSubscription(endpoint);
    assert.deepEqual(await send(sub.target, PAYLOAD, vapid), { status: null, blocked: true }, endpoint);
  }
  assert.equal(called, 0);
});
