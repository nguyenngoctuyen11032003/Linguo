import assert from 'node:assert/strict';
import { isAllowedPushEndpoint } from './endpoint.ts';

Deno.test('real push service endpoints are allowed', () => {
  for (const url of [
    'https://fcm.googleapis.com/fcm/send/abc123',
    'https://fcm.googleapis.com:443/wp/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/gAAAA',
    'https://autopush.push.services.mozilla.com/wpush/v2/x',
    'https://db5p.notify.windows.com/?token=abc',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
    'https://web.push.apple.com/QAbc',
    'https://FCM.GoogleAPIs.com/fcm/send/abc',
  ]) {
    assert.equal(isAllowedPushEndpoint(url), true, url);
  }
});

Deno.test('other hosts, internal addresses and look-alikes are rejected', () => {
  for (const url of [
    'https://push.example.com/abc',
    'https://evil.com/fcm.googleapis.com/x',
    'https://fcm.googleapis.com.evil.com/x',
    'https://evilfcm.googleapis.com/x',
    'https://notify.windows.com/x', // the bare domain is not a push host
    'https://evilpush.apple.com/x',
    'https://push.services.mozilla.com.evil.com/x',
    'https://localhost/x',
    'https://localhost.push.apple.com.evil.io/x',
    'https://127.0.0.1/x',
    'https://10.0.0.5/x',
    'https://169.254.169.254/latest/meta-data/',
    'https://[::1]/x',
    'https://[::ffff:7f00:1]/x',
    'https://2130706433/x',
    'https://metadata.google.internal/x',
  ]) {
    assert.equal(isAllowedPushEndpoint(url), false, url);
  }
});

Deno.test('http, userinfo, odd ports, backslashes, whitespace and malformed values are rejected', () => {
  for (const url of [
    'http://fcm.googleapis.com/fcm/send/abc',
    'ftp://fcm.googleapis.com/x',
    'https://user@fcm.googleapis.com/x',
    'https://user:pw@fcm.googleapis.com/x',
    'https://fcm.googleapis.com@evil.com/x',
    'https://fcm.googleapis.com:443@evil.com/x',
    'https://fcm.googleapis.com:8443/x',
    'https://fcm.googleapis.com:80/x',
    'https://fcm.googleapis.com\\@evil.com/x',
    'https://evil.com\\.fcm.googleapis.com/x',
    'https://fcm.googleapis.com/x y',
    'https://fcm.googleapis.com',
    'https://fcm.googleapis.com?x=1',
    'https://fcm.googleapis.com./x',
    '//fcm.googleapis.com/x',
    '',
    'not a url',
    `https://fcm.googleapis.com/${'a'.repeat(2048)}`,
  ]) {
    assert.equal(isAllowedPushEndpoint(url), false, url);
  }
  assert.equal(isAllowedPushEndpoint(null), false);
  assert.equal(isAllowedPushEndpoint(undefined), false);
  assert.equal(isAllowedPushEndpoint(42), false);
});
