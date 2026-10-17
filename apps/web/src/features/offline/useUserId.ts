import { useContext } from 'react';
import { AuthContext } from '@/features/auth/AuthProvider';

/** The signed-in user's id, or null (also without an AuthProvider: screens render in tests and logged-out areas). */
export function useOptionalUserId(): string | null {
  return useContext(AuthContext)?.user?.id ?? null;
}
