const KEY = 'linguo-recovery';

/**
 * Set by the auth callback once a password-recovery link was exchanged; lets the reset page tell a
 * recovery session from an ordinary signed-in session. Per tab, never persisted across browser restarts.
 */
export function markRecoveryPending(): void {
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    // Without storage the reset form simply cannot be shown; the user can request a new link.
  }
}

export function isRecoveryPending(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function clearRecovery(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
