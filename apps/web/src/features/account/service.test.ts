import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppSupabaseClient } from '@/lib/supabase';
import { accountErrorMessage, DELETE_CONFIRM_PHRASE, deleteMyAccount, downloadJson, exportFileName, exportMyData } from './service';

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
    expect(accountErrorMessage({ message: 'TypeError: Failed to fetch', code: '' }, 'export')).toMatch(/Không kết nối/);
    expect(accountErrorMessage(new Error('boom'), 'export')).toBe('Chưa tải được dữ liệu. Vui lòng thử lại.');
    expect(accountErrorMessage(new Error('boom'), 'delete')).toBe('Chưa xoá được tài khoản. Vui lòng thử lại.');
  });
});
