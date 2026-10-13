/** localStorage can throw (private mode, blocked storage); never let that break the UI. */
export function readString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Preference simply won't persist on this device.
  }
}

export function readBool(key: string): boolean {
  return readString(key) === 'true';
}

export function writeBool(key: string, value: boolean): void {
  writeString(key, String(value));
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}
