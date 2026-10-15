import assert from 'node:assert/strict';
import { clientIp, createIpLimiter } from './ip-limiter.ts';

function setup(over: Partial<{ limit: number; windowMs: number; maxKeys: number }> = {}) {
  const clock = { t: 0 };
  const l = createIpLimiter({ limit: 3, windowMs: 60_000, now: () => clock.t, ...over });
  return { l, clock };
}

Deno.test('allows up to the limit, then refuses with the time left in the window', () => {
  const { l, clock } = setup();
  for (let i = 0; i < 3; i++) assert.deepEqual(l.hit('1.2.3.4'), { allowed: true });
  clock.t += 20_500;
  assert.deepEqual(l.hit('1.2.3.4'), { allowed: false, retryAfterSec: 40 });
});

Deno.test('a new window starts after windowMs', () => {
  const { l, clock } = setup();
  for (let i = 0; i < 3; i++) l.hit('1.2.3.4');
  assert.equal(l.hit('1.2.3.4').allowed, false);
  clock.t += 60_000;
  assert.equal(l.hit('1.2.3.4').allowed, true);
});

Deno.test('addresses are counted separately', () => {
  const { l } = setup();
  for (let i = 0; i < 3; i++) l.hit('1.2.3.4');
  assert.equal(l.hit('1.2.3.4').allowed, false);
  assert.equal(l.hit('5.6.7.8').allowed, true);
});

Deno.test('retryAfterSec is at least 1', () => {
  const { l, clock } = setup();
  for (let i = 0; i < 3; i++) l.hit('a');
  clock.t += 59_999;
  assert.deepEqual(l.hit('a'), { allowed: false, retryAfterSec: 1 });
});

Deno.test('memory stays bounded: expired keys are pruned, a spray of live keys resets the map', () => {
  const { l, clock } = setup({ limit: 1, maxKeys: 2 });
  l.hit('a');
  l.hit('b');
  clock.t += 60_000;
  // a and b expired: pruned, c is counted.
  assert.equal(l.hit('c').allowed, true);
  assert.equal(l.hit('c').allowed, false);
});

Deno.test('clientIp: cf-connecting-ip wins, else the rightmost x-forwarded-for entry, else unknown', () => {
  const req = (h: Record<string, string>) => new Request('http://localhost/', { headers: h });
  assert.equal(clientIp(req({ 'cf-connecting-ip': '198.51.100.9', 'x-forwarded-for': '1.1.1.1, 203.0.113.7' })), '198.51.100.9');
  assert.equal(clientIp(req({ 'x-forwarded-for': ' 1.1.1.1 , 203.0.113.7 ' })), '203.0.113.7');
  assert.equal(clientIp(req({ 'x-forwarded-for': '2001:db8::1' })), '2001:db8::1');
  assert.equal(clientIp(req({})), 'unknown');
  assert.equal(clientIp(req({ 'x-forwarded-for': ' , ' })), 'unknown');
});

Deno.test('clientIp: spoofed leading x-forwarded-for entries all map to the same bucket', () => {
  const req = (xff: string) => new Request('http://localhost/', { headers: { 'x-forwarded-for': xff } });
  const keys = new Set(Array.from({ length: 50 }, (_, i) => clientIp(req(`9.9.9.${i}, 203.0.113.7`))));
  assert.deepEqual([...keys], ['203.0.113.7']);
});

Deno.test('a full map evicts expired then oldest keys only; recent keys keep their counts', () => {
  const { l, clock } = setup({ limit: 1, maxKeys: 3 });
  l.hit('a');
  clock.t += 1000;
  l.hit('b');
  clock.t += 1000;
  l.hit('c');
  clock.t += 1000;
  // Full of live keys: only the oldest (a) is evicted.
  assert.equal(l.hit('d').allowed, true);
  assert.equal(l.hit('c').allowed, false);
  assert.equal(l.hit('b').allowed, false);
  assert.equal(l.hit('d').allowed, false);
  assert.equal(l.hit('a').allowed, true);
});
