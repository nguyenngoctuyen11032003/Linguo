import assert from 'node:assert/strict';
import { createBreaker } from './breaker.ts';

function setup(over: Partial<{ failureThreshold: number; windowMs: number; openMs: number }> = {}) {
  const clock = { t: 0 };
  const b = createBreaker({ failureThreshold: 3, windowMs: 60_000, openMs: 30_000, now: () => clock.t, ...over });
  return { b, clock };
}

Deno.test('starts closed', () => {
  const { b } = setup();
  assert.equal(b.state(), 'closed');
  assert.equal(b.canRequest(), true);
  assert.equal(b.retryAfterSec(), 0);
});

Deno.test('opens after N upstream failures within the window', () => {
  const { b, clock } = setup();
  b.onFailure('timeout');
  clock.t += 1000;
  b.onFailure('unavailable');
  assert.equal(b.state(), 'closed');
  clock.t += 1000;
  b.onFailure('rate_limited');
  assert.equal(b.state(), 'open');
  assert.equal(b.canRequest(), false);
  assert.equal(b.retryAfterSec(), 30);
  clock.t += 10_500;
  assert.equal(b.retryAfterSec(), 20);
});

Deno.test('failures outside the window do not add up', () => {
  const { b, clock } = setup();
  b.onFailure('network');
  b.onFailure('network');
  clock.t += 60_000;
  b.onFailure('network');
  assert.equal(b.state(), 'closed');
  b.onFailure('network');
  assert.equal(b.state(), 'closed');
  b.onFailure('network');
  assert.equal(b.state(), 'open');
});

Deno.test('success resets the failure count', () => {
  const { b } = setup();
  b.onFailure('timeout');
  b.onFailure('timeout');
  b.onSuccess();
  b.onFailure('timeout');
  b.onFailure('timeout');
  assert.equal(b.state(), 'closed');
});

Deno.test('request-specific failures never open it', () => {
  const { b } = setup({ failureThreshold: 1 });
  for (const k of ['bad_request', 'schema_rejected', 'blocked'] as const) b.onFailure(k);
  assert.equal(b.state(), 'closed');
});

Deno.test('daily_quota opens immediately', () => {
  const { b } = setup();
  b.onFailure('daily_quota');
  assert.equal(b.state(), 'open');
  assert.equal(b.canRequest(), false);
});

Deno.test('half-open lets exactly one probe through; success closes', () => {
  const { b, clock } = setup();
  b.onFailure('daily_quota');
  clock.t += 30_000;
  assert.equal(b.state(), 'half_open');
  assert.equal(b.retryAfterSec(), 1);
  assert.equal(b.canRequest(), true);
  assert.equal(b.canRequest(), false);
  assert.equal(b.canRequest(), false);
  b.onSuccess();
  assert.equal(b.state(), 'closed');
  assert.equal(b.canRequest(), true);
  assert.equal(b.canRequest(), true);
});

Deno.test('half-open probe failure re-opens for a full period', () => {
  const { b, clock } = setup();
  b.onFailure('daily_quota');
  clock.t += 30_000;
  assert.equal(b.canRequest(), true);
  b.onFailure('timeout');
  assert.equal(b.state(), 'open');
  assert.equal(b.retryAfterSec(), 30);
  clock.t += 29_999;
  assert.equal(b.canRequest(), false);
  clock.t += 1;
  assert.equal(b.canRequest(), true);
});

Deno.test('half-open probe answered with a request-specific error closes it', () => {
  const { b, clock } = setup();
  b.onFailure('daily_quota');
  clock.t += 30_000;
  assert.equal(b.canRequest(), true);
  b.onFailure('blocked');
  assert.equal(b.state(), 'closed');
});

Deno.test('a probe that never reports back expires after openMs', () => {
  const { b, clock } = setup();
  b.onFailure('daily_quota');
  clock.t += 30_000;
  assert.equal(b.canRequest(), true);
  clock.t += 29_000;
  assert.equal(b.canRequest(), false);
  clock.t += 1_000;
  assert.equal(b.canRequest(), true);
});
