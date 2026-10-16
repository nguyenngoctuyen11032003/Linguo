import type { SupabaseClient, User } from '@supabase/supabase-js';
import { authErrorMessage } from './error-map';

export const WRONG_CURRENT_PASSWORD = 'Mật khẩu hiện tại không đúng.';

/**
 * True when the account can sign in with an email and password (an `email` identity), so it has a password to change.
 * A Google-only account has no such identity. When the user object carries neither providers nor identities, an
 * email address is taken as the email provider.
 */
export function hasPasswordSignIn(user: User | null | undefined): boolean {
  if (!user) return false;
  const providers = user.app_metadata?.providers;
  if (Array.isArray(providers)) return providers.includes('email');
  if (Array.isArray(user.identities)) return user.identities.some((identity) => identity.provider === 'email');
  const provider = user.app_metadata?.provider;
  if (typeof provider === 'string') return provider === 'email';
  return Boolean(user.email);
}

export type ChangePasswordResult = { ok: true } | { ok: false; field: 'current' | null; message: string };

/**
 * Checks the current password by signing in again with it, then sets the new one. A wrong current password is
 * reported on the "current" field; every other failure (same or weak password, rate limit, network) is a form message.
 */
export async function changePassword(client: SupabaseClient, email: string, current: string, password: string): Promise<ChangePasswordResult> {
  try {
    const verify = await client.auth.signInWithPassword({ email, password: current });
    if (verify.error) {
      const code = (verify.error as { code?: unknown }).code;
      if (code === 'invalid_credentials') return { ok: false, field: 'current', message: WRONG_CURRENT_PASSWORD };
      return { ok: false, field: null, message: authErrorMessage(verify.error) };
    }
    const { error } = await client.auth.updateUser({ password });
    if (error) return { ok: false, field: null, message: authErrorMessage(error) };
    return { ok: true };
  } catch (error) {
    return { ok: false, field: null, message: authErrorMessage(error) };
  }
}
