import { render } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { Mock } from 'vitest';
import { ADMIN_USER_ID } from '@/features/admin/admin-fixtures';
import { AuthContext, type AuthState } from '@/features/auth/AuthProvider';
import { adminRootRoute } from './admin-routes';

export type RpcTable = Record<string, { data: unknown; error?: unknown } | ((args: Record<string, unknown>) => { data: unknown; error?: unknown })>;

/** Routes every rpc(name, args) of the mocked client through `table`. */
export function routeRpcs(rpc: Mock, table: RpcTable) {
  rpc.mockImplementation((name: string, args: Record<string, unknown>) => {
    const entry = table[name];
    const r = typeof entry === 'function' ? entry(args) : entry;
    return Promise.resolve(r ? { data: r.data, error: r.error ?? null } : { data: null, error: { message: `no_rpc_${name}`, code: 'X' } });
  });
}

/** Renders the real /quan-tri route tree (guard + layout + pages) at `path`. */
export function renderAdmin(path: string, auth: AuthState['status'] = 'signed-in') {
  const value: AuthState =
    auth === 'signed-in'
      ? { status: auth, session: null, user: { id: ADMIN_USER_ID, email: 'staff@example.com' } as User }
      : { status: auth, session: null, user: null };
  const router = createMemoryRouter(
    [
      { path: '/', children: [adminRootRoute, { path: 'app', element: <p>Ứng dụng</p> }] },
    ],
    { initialEntries: [path] },
  );
  return {
    router,
    ...render(
      <AuthContext.Provider value={value}>
        <RouterProvider router={router} />
      </AuthContext.Provider>,
    ),
  };
}
