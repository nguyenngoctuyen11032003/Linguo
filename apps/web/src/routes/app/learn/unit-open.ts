/**
 * Which units the learner opened or closed on /app/hoc-tap, remembered for this browser tab only
 * (sessionStorage): a fresh visit starts again from "the unit with the recommended lesson is open".
 */
export const UNIT_OPEN_KEY = 'linguo:learn:open-units';

export type UnitOpenState = Record<string, boolean>;

export function readUnitOpen(): UnitOpenState {
  try {
    const raw = window.sessionStorage.getItem(UNIT_OPEN_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const state: UnitOpenState = {};
    for (const [id, open] of Object.entries(parsed)) if (typeof open === 'boolean') state[id] = open;
    return state;
  } catch {
    return {};
  }
}

export function writeUnitOpen(state: UnitOpenState): void {
  try {
    window.sessionStorage.setItem(UNIT_OPEN_KEY, JSON.stringify(state));
  } catch {
    // Private mode or blocked storage: the choice simply isn't remembered.
  }
}
