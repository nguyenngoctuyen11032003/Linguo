import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppSupabaseClient } from '@/lib/supabase';
import { accountErrorMessage, clearAllLocalLearnerData, clearLocalAccountData, DELETE_CONFIRM_PHRASE, deleteMyAccount, downloadJson, exportFileName, exportMyData } from './service';

function fakeClient(result: { data?: unknown; error?: unknown }) {
  const rpc = vi.fn(() => Promise.resolve({ data: result.data ?? null, error: result.error ?? null }));
  return { client: { rpc } as unknown as AppSupabaseClient, rpc };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('account service', () => {
  it('exports through export_my_data and returns the payload', async () => {
    const { client, rpc } = fakeClient({ data: { profile: { id: 'u1' } } });
    await expect(exportMyData(client)).resolves.toEqual({ profile: { id: 'u1' } });
    expect(rpc).toHaveBeenCalledWith('export_my_data');
  });

  it('throws the RPC error and refuses an empty export', async () => {
    await expect(exportMyData(fakeClient({ error: { message: 'rate_limited', code: 'P0001' } }).client)).rejects.toMatchObject({
      message: 'rate_limited',
    });
    await expect(exportMyData(fakeClient({ data: null }).client)).rejects.toThrow('empty_export');
  });

  it('deletes through delete_my_account with the typed phrase', async () => {
    const { client, rpc } = fakeClient({});
    await deleteMyAccount(client, DELETE_CONFIRM_PHRASE);
    expect(rpc).toHaveBeenCalledWith('delete_my_account', { p_confirm: 'XOA TAI KHOAN' });
    const failing = fakeClient({ error: { message: 'invalid_confirmation', code: 'P0001' } });
    await expect(deleteMyAccount(failing.client, 'xoa')).rejects.toMatchObject({ message: 'invalid_confirmation' });
  });

  it('names the file after the local date', () => {
    expect(exportFileName('2026-10-13')).toBe('linguo-du-lieu-2026-10-13.json');
  });

  it('downloads pretty JSON through a temporary link', async () => {
    const create = vi.fn<(blob: Blob) => string>(() => 'blob:linguo');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('linguo-du-lieu-2026-10-13.json');
      expect(this.getAttribute('href')).toBe('blob:linguo');
    });
    downloadJson({ a: 1 }, 'linguo-du-lieu-2026-10-13.json');
    expect(click).toHaveBeenCalledOnce();
    const blob = create.mock.calls[0]![0];
    expect(blob.type).toBe('application/json');
    expect(JSON.parse(await blob.text())).toEqual({ a: 1 });
    expect(document.querySelector('a[download]')).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect(revoke).toHaveBeenCalledWith('blob:linguo');
  });

  it('maps errors to Vietnamese', () => {
    expect(accountErrorMessage({ message: 'rate_limited', code: 'P0001' }, 'export')).toMatch(/nhiều lần/);
    expect(accountErrorMessage({ message: 'invalid_confirmation', code: 'P0001' }, 'delete')).toMatch(/XOA TAI KHOAN/);
    expect(accountErrorMessage({ message: 'last_admin_required', code: 'P0001' }, 'delete')).toMatch(/quản trị viên cuối cùng/);
    expect(accountErrorMessage({ message: 'TypeError: Failed to fetch', code: '' }, 'export')).toMatch(/Không kết nối/);
    expect(accountErrorMessage(new Error('boom'), 'export')).toBe('Chưa tải được dữ liệu. Vui lòng thử lại.');
    expect(accountErrorMessage(new Error('boom'), 'delete')).toBe('Chưa xoá được tài khoản. Vui lòng thử lại.');
  });
});

describe('clearAllLocalLearnerData', () => {
  const learnerKeys = [
    'linguo-outbox-v1:u1',
    'linguo-outbox-v1:u2',
    'linguo-review-outbox-v1:u1',
    'linguo-lesson-v1:u1:abc',
    'linguo-speaking-v1:u1',
    'linguo-speaking-v1:u2',
    'linguo-onboarding-draft',
  ];

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('wipes every per-learner key for all users, in both storages, and keeps device preferences', () => {
    for (const k of learnerKeys) localStorage.setItem(k, 'x');
    sessionStorage.setItem('linguo:roleplay:v1:u1', 'chat');
    sessionStorage.setItem('linguo:roleplay:v1:u2', 'chat');
    localStorage.setItem('linguo-theme', 'dark');
    localStorage.setItem('linguo-reduce-motion', 'true');
    clearAllLocalLearnerData('u1');
    for (const k of learnerKeys) expect(localStorage.getItem(k)).toBeNull();
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.getItem('linguo-theme')).toBe('dark');
    expect(localStorage.getItem('linguo-reduce-motion')).toBe('true');
  });

  it('on sign-out keeps queued unsynced answers and other users\x27 lesson cache, wipes the learner\x27s own cache and every private store', () => {
    for (const k of learnerKeys) localStorage.setItem(k, 'x');
    localStorage.setItem('linguo-lesson-v1:u2:abc', 'x');
    sessionStorage.setItem('linguo:roleplay:v1:u1', 'chat');
    clearAllLocalLearnerData('u1', { mode: 'sign-out' });
    for (const k of ['linguo-outbox-v1:u1', 'linguo-outbox-v1:u2', 'linguo-review-outbox-v1:u1', 'linguo-lesson-v1:u2:abc']) {
      expect(localStorage.getItem(k)).toBe('x');
    }
    for (const k of ['linguo-lesson-v1:u1:abc', 'linguo-speaking-v1:u1', 'linguo-speaking-v1:u2', 'linguo-onboarding-draft']) {
      expect(localStorage.getItem(k)).toBeNull();
    }
    expect(sessionStorage.length).toBe(0);
  });

  it('wipes the saved role-play conversation (localStorage v2 and legacy v1) on sign-out and on deletion', () => {
    for (const mode of ['sign-out', 'delete'] as const) {
      localStorage.setItem('linguo:roleplay:v2:u1', 'chat');
      localStorage.setItem('linguo:roleplay:v2:u2', 'chat');
      sessionStorage.setItem('linguo:roleplay:v1:u1', 'chat');
      clearAllLocalLearnerData('u1', { mode });
      expect(localStorage.getItem('linguo:roleplay:v2:u1')).toBeNull();
      expect(localStorage.getItem('linguo:roleplay:v2:u2')).toBeNull();
      expect(sessionStorage.getItem('linguo:roleplay:v1:u1')).toBeNull();
    }
  });

  it('works without a user id and is also what account deletion runs', () => {
    localStorage.setItem('linguo-speaking-v1:u9', 'x');
    clearLocalAccountData('u9');
    expect(localStorage.getItem('linguo-speaking-v1:u9')).toBeNull();
    sessionStorage.setItem('linguo:roleplay:v1:u3', 'x');
    clearAllLocalLearnerData();
    expect(sessionStorage.getItem('linguo:roleplay:v1:u3')).toBeNull();
  });

  it('never throws and still clears sessionStorage when localStorage is blocked', () => {
    sessionStorage.setItem('linguo:roleplay:v1:u1', 'chat');
    localStorage.setItem('linguo-speaking-v1:u1', 'x');
    const original = Storage.prototype.removeItem;
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, key: string) {
      if (this === localStorage) throw new Error('blocked');
      original.call(this, key);
    });
    expect(() => clearAllLocalLearnerData('u1')).not.toThrow();
    expect(sessionStorage.getItem('linguo:roleplay:v1:u1')).toBeNull();
  });
});
