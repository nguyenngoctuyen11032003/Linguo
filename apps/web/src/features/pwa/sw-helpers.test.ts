import { SW_MESSAGE_NOTIFICATION_CLICKED } from '@linguo/shared';
import { describe, expect, it } from 'vitest';
import { isBusyRoute } from './busy-route';
import {
  isCacheableMediaRequest,
  isNotificationClickedMessage,
  isSkipWaitingMessage,
  isSupabaseApiRequest,
  parsePushPayload,
  pickClient,
  resolveUrlInScope,
  SW_MESSAGE_SKIP_WAITING,
  SW_NOTIFICATION_CLICKED,
} from './sw-helpers';

const SCOPE = 'https://nam.github.io/Linguo/';
const ID = '0b6f1d4e-1c1a-4a5e-9a51-6a2f2c6c8f11';

describe('constants', () => {
  it('mirrors the shared contract message type', () => {
    expect(SW_NOTIFICATION_CLICKED).toBe(SW_MESSAGE_NOTIFICATION_CLICKED);
  });
});

describe('isSupabaseApiRequest', () => {
  it('never lets REST, RPC, Auth or Functions be cached', () => {
    for (const u of [
      'https://abc.supabase.co/rest/v1/rpc/get_lesson',
      'https://abc.supabase.co/auth/v1/token?grant_type=refresh_token',
      'https://abc.supabase.co/functions/v1/ai-tutor',
      'http://127.0.0.1:54321/rest/v1/profiles',
      'https://abc.supabase.co/storage/v1/object/sign/private/x.mp3',
    ]) {
      expect(isSupabaseApiRequest(new URL(u)), u).toBe(true);
    }
  });

  it('treats public Storage objects and the site itself as non-API', () => {
    expect(isSupabaseApiRequest(new URL('https://abc.supabase.co/storage/v1/object/public/audio/a.mp3'))).toBe(false);
    expect(isSupabaseApiRequest(new URL('https://nam.github.io/Linguo/assets/x.png'))).toBe(false);
  });
});

describe('isCacheableMediaRequest', () => {
  const req = (url: string, extra: Partial<{ method: string; destination: string; hasRange: boolean }> = {}) => ({
    url,
    method: 'GET',
    destination: '',
    hasRange: false,
    ...extra,
  });

  it('caches images and audio by destination or extension', () => {
    expect(isCacheableMediaRequest(req('https://cdn.example.com/img/cat', { destination: 'image' }))).toBe(true);
    expect(isCacheableMediaRequest(req('https://nam.github.io/Linguo/content/hello.MP3'))).toBe(true);
    expect(isCacheableMediaRequest(req('https://abc.supabase.co/storage/v1/object/public/audio/a.m4a'))).toBe(true);
  });

  it('skips API calls, non-GET, range requests and non-media', () => {
    expect(isCacheableMediaRequest(req('https://abc.supabase.co/rest/v1/rpc/x.png'))).toBe(false);
    expect(isCacheableMediaRequest(req('https://cdn.example.com/a.png', { method: 'POST' }))).toBe(false);
    expect(isCacheableMediaRequest(req('https://cdn.example.com/a.mp3', { hasRange: true }))).toBe(false);
    expect(isCacheableMediaRequest(req('https://nam.github.io/Linguo/app/on-tap', { destination: 'document' }))).toBe(false);
    expect(isCacheableMediaRequest(req('data:image/png;base64,AAAA', { destination: 'image' }))).toBe(false);
    expect(isCacheableMediaRequest(req('not a url'))).toBe(false);
  });
});

describe('resolveUrlInScope', () => {
  it('resolves app paths under the base path', () => {
    expect(resolveUrlInScope('/app/on-tap', SCOPE)).toBe('https://nam.github.io/Linguo/app/on-tap');
    expect(resolveUrlInScope('app/hoc-tap?x=1', SCOPE)).toBe('https://nam.github.io/Linguo/app/hoc-tap?x=1');
    expect(resolveUrlInScope('https://nam.github.io/Linguo/app/thong-bao', SCOPE)).toBe(
      'https://nam.github.io/Linguo/app/thong-bao',
    );
    expect(resolveUrlInScope('/app', 'http://localhost:4173/')).toBe('http://localhost:4173/app');
  });

  it('never leaves the scope', () => {
    const fallback = 'https://nam.github.io/Linguo/app';
    expect(resolveUrlInScope('https://evil.example/app', SCOPE)).toBe(fallback);
    expect(resolveUrlInScope('javascript:alert(1)', SCOPE)).toBe(fallback);
    expect(resolveUrlInScope('//evil.example/x', SCOPE)).toBe('https://nam.github.io/Linguo/evil.example/x');
    expect(resolveUrlInScope('https://nam.github.io/Other/app', SCOPE)).toBe(fallback);
    expect(resolveUrlInScope(42, SCOPE)).toBe(fallback);
    expect(resolveUrlInScope('  ', SCOPE)).toBe(fallback);
  });
});

describe('parsePushPayload', () => {
  it('reads a pushPayloadSchema-shaped object or JSON string', () => {
    const payload = { notification_id: ID, title: 'Đến giờ ôn tập', body: '12 thẻ đang chờ bạn', url: '/app/on-tap' };
    const expected = { title: 'Đến giờ ôn tập', body: '12 thẻ đang chờ bạn', url: `${SCOPE}app/on-tap`, notificationId: ID };
    expect(parsePushPayload(payload, SCOPE)).toEqual(expected);
    expect(parsePushPayload(JSON.stringify(payload), SCOPE)).toEqual(expected);
  });

  it('falls back to a generic notification on garbage', () => {
    for (const raw of [null, 'not json', 42, { title: 7, notification_id: 'x', url: 'https://evil.example' }]) {
      const p = parsePushPayload(raw, SCOPE);
      expect(p.title).toBe('Linguo');
      expect(p.body.length).toBeGreaterThan(0);
      expect(p.url.startsWith(SCOPE)).toBe(true);
      expect(p.notificationId).toBeNull();
    }
    expect(parsePushPayload(null, SCOPE).url).toBe(`${SCOPE}app/thong-bao`);
  });

  it('caps long strings', () => {
    const p = parsePushPayload({ title: 'a'.repeat(500), body: 'b'.repeat(500) }, SCOPE);
    expect(p.title).toHaveLength(120);
    expect(p.body).toHaveLength(300);
  });
});

describe('messages and clients', () => {
  it('validates the click message shape', () => {
    const ok = { type: SW_NOTIFICATION_CLICKED, notification_id: ID, url: `${SCOPE}app`, navigated: true };
    expect(isNotificationClickedMessage(ok)).toBe(true);
    expect(isNotificationClickedMessage({ ...ok, notification_id: null })).toBe(true);
    expect(isNotificationClickedMessage({ ...ok, notification_id: 'nope' })).toBe(false);
    expect(isNotificationClickedMessage({ ...ok, type: 'other' })).toBe(false);
    expect(isNotificationClickedMessage(null)).toBe(false);
    expect(isSkipWaitingMessage({ type: SW_MESSAGE_SKIP_WAITING })).toBe(true);
    expect(isSkipWaitingMessage('linguo:skip-waiting')).toBe(false);
  });

  it('prefers the focused window inside the scope', () => {
    const a = { url: `${SCOPE}app`, focused: false };
    const b = { url: `${SCOPE}app/on-tap`, focused: true };
    const outside = { url: 'https://nam.github.io/Other/', focused: true };
    expect(pickClient([a, b, outside], SCOPE)).toBe(b);
    expect(pickClient([outside, a], SCOPE)).toBe(a);
    expect(pickClient([outside], SCOPE)).toBeNull();
  });
});

describe('isBusyRoute', () => {
  it('flags lesson, exam attempt, diagnostic and session routes, with or without the base path', () => {
    expect(isBusyRoute('/app/hoc-tap/bai/abc')).toBe(true);
    expect(isBusyRoute('/Linguo/app/luyen-thi/lam-bai/123/')).toBe(true);
    expect(isBusyRoute('/app/kiem-tra/en')).toBe(true);
    expect(isBusyRoute('/app/phien-hoc')).toBe(true);
  });

  it('leaves hubs and result pages alone', () => {
    for (const p of ['/app', '/app/hoc-tap', '/app/luyen-thi', '/app/luyen-thi/ket-qua/1', '/app/kiem-tra/en/ket-qua', '/']) {
      expect(isBusyRoute(p), p).toBe(false);
    }
  });
});
