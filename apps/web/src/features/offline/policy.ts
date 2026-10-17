import type { PathLesson } from '@linguo/shared';
import { isSaveDataActive } from '@/lib/useSaveData';

/** The pack cache is checked against the server's manifest this often (plus on every start while stale packs are known). */
export const MANIFEST_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** The current + next unfinished lessons kept ready (the lesson on screen and the next three). */
export const AUTO_CACHE_LESSONS = 4;
export const AUTO_MIN_GAP_MS = 10 * 60 * 1000;
export const IDLE_DELAY_MS = 2500;

export const PREF_AUTO = 'linguo-offline-auto-v1';
export const PREF_WIFI = 'linguo-offline-wifi-v1';

interface Connection {
  type?: string;
}
const connectionOf = (): Connection | undefined => (navigator as Navigator & { connection?: Connection }).connection;

/** The browser can tell Wi-Fi from cellular (Android Chrome); elsewhere "Wi-Fi only" cannot be honoured. */
export function wifiOnlySupported(): boolean {
  return typeof connectionOf()?.type === 'string';
}

/** Whether the connection is one the learner would not want a background download on. */
export function connectionBlocksAuto(wifiOnly: boolean): boolean {
  if (isSaveDataActive()) return true;
  return wifiOnly && connectionOf()?.type === 'cellular';
}

export function readPref(key: string, userId: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(`${key}:${userId}`);
    return raw === null ? fallback : raw === '1';
  } catch {
    return fallback;
  }
}

export function writePref(key: string, userId: string, value: boolean): void {
  try {
    localStorage.setItem(`${key}:${userId}`, value ? '1' : '0');
  } catch {
    // Not remembered; the toggle still applies for this visit.
  }
}

/** Unfinished lessons in path order: the in-progress ones first, then the not-started ones. */
export function nextUnfinished(lessons: readonly PathLesson[], count: number): PathLesson[] {
  const programRank = new Map<string, number>();
  for (const l of lessons) if (!programRank.has(l.program_id)) programRank.set(l.program_id, programRank.size);
  const ordered = [...lessons].sort(
    (a, b) => (programRank.get(a.program_id) ?? 0) - (programRank.get(b.program_id) ?? 0) || a.unit_order - b.unit_order || a.lesson_order - b.lesson_order,
  );
  const open = ordered.filter((l) => l.run_status !== 'completed');
  return [...open.filter((l) => l.run_status === 'in_progress'), ...open.filter((l) => l.run_status === 'not_started')].slice(0, count);
}
