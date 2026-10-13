/**
 * Counts preference changes made by the user on this device. The server-sync hook compares the count
 * before and after its fetch so a slow response never overwrites a choice made while it was in flight.
 */
let version = 0;

export function markLocalPreferenceEdit(): void {
  version += 1;
}

export function localPreferenceEditVersion(): number {
  return version;
}
