import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleButton } from './GoogleButton';

const mocks = vi.hoisted(() => ({ signInWithOAuth: vi.fn() }));
vi.mock('@/lib/env', () => ({ env: { googleEnabled: true } }));
vi.mock('@/lib/supabase', () => ({
  requireSupabase: () => ({ auth: { signInWithOAuth: mocks.signInWithOAuth } }),
  authRedirect: (path: string) => `http://localhost:5173${path}`,
}));

beforeEach(() => {
  mocks.signInWithOAuth.mockReset();
});

describe('GoogleButton', () => {
  it('starts the OAuth flow with the encoded next path', async () => {
    mocks.signInWithOAuth.mockResolvedValue({ data: {}, error: null });
    render(<GoogleButton next="/app/cai-dat" onError={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Tiếp tục với Google' }));
    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'http://localhost:5173/auth/callback?next=%2Fapp%2Fcai-dat' },
    });
  });

  it('reports a returned error and resets the loading state', async () => {
    mocks.signInWithOAuth.mockResolvedValue({ data: {}, error: { code: 'provider_disabled' } });
    const onError = vi.fn();
    render(<GoogleButton next="/app" onError={onError} />);
    await userEvent.click(screen.getByRole('button', { name: 'Tiếp tục với Google' }));
    expect(onError).toHaveBeenCalledWith('Phương thức đăng nhập này chưa được bật.');
    expect(screen.getByRole('button', { name: 'Tiếp tục với Google' })).not.toBeDisabled();
  });

  it('recovers when the request throws (offline)', async () => {
    mocks.signInWithOAuth.mockImplementation(async () => {
      throw new TypeError('Failed to fetch');
    });
    const onError = vi.fn();
    render(<GoogleButton next="/app" onError={onError} />);
    await userEvent.click(screen.getByRole('button', { name: 'Tiếp tục với Google' }));
    expect(onError).toHaveBeenCalledWith('Không kết nối được máy chủ. Kiểm tra mạng và thử lại.');
    expect(screen.getByRole('button', { name: 'Tiếp tục với Google' })).not.toBeDisabled();
  });
});
