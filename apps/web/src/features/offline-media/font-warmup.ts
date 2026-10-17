// Korean learners: ask the service worker to cache every Pretendard subset once, so Hangul renders in the real font
// offline (the page only loads the subsets of characters it has shown). The worker does the fetching (the page CSP
// allows no fetch() to jsDelivr); see warmPretendard in src/sw.ts.
import { SW_MESSAGE_WARM_FONTS } from '@/features/pwa/sw-helpers';
import { isMeteredConnection } from '@/lib/useSaveData';

const STAMP_KEY = 'linguo-font-warm-v1';
/** Re-ask rarely: the worker skips cached subsets, but it still downloads the stylesheet. */
const REPEAT_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

function readStamp(): number {
  try {
    const n = Number(localStorage.getItem(STAMP_KEY));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function writeStamp(now: number): void {
  try {
    localStorage.setItem(STAMP_KEY, String(now));
  } catch {
    // private mode: the warm-up just repeats next launch
  }
}

/** True when a warm-up is worthwhile now: online, not metered / data saver, not done recently. */
export function shouldWarmFonts(now: number = Date.now()): boolean {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  if (navigator.onLine === false || isMeteredConnection()) return false;
  return now - readStamp() > REPEAT_AFTER_MS;
}

/** Posts the warm-up request to the active worker. Resolves true when it was sent. Never throws. */
export async function requestPretendardWarmup(now: number = Date.now()): Promise<boolean> {
  if (!shouldWarmFonts(now)) return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const worker = registration?.active;
    if (!worker) return false;
    worker.postMessage({ type: SW_MESSAGE_WARM_FONTS });
    writeStamp(now);
    return true;
  } catch {
    return false;
  }
}
