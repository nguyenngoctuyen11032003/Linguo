import { clearLessonCache, LESSON_CACHE_PREFIX } from '@/features/lesson-player/lessonCache';
import { OUTBOX_CHANGE_EVENT, OUTBOX_KEY_PREFIX, outboxKey } from '@/features/lesson-player/outbox';
import { REVIEW_OUTBOX_KEY_PREFIX, reviewOutboxKey } from '@/features/reviews/outbox';
import { clearSession, KEY_PREFIX as ROLEPLAY_KEY_PREFIX } from '@/features/roleplay/storage';
import { clearReflections, REFLECTION_KEY_PREFIX } from '@/features/speaking/ratings';
import { DRAFT_KEY } from '@/routes/app/onboarding/useOnboardingDraft';
import { isNetworkError } from '@/lib/network-error';
import { removeKey } from '@/lib/storage';
import type { AppSupabaseClient } from '@/lib/supabase';

/** Exact phrase `delete_my_account` requires (spec 7 §1); typed by the user in the delete dialog. */
export const DELETE_CONFIRM_PHRASE = 'XOA TAI KHOAN';

/**
 * The account RPCs (migration 20261014000910) may be missing from the generated Database types until they are
 * regenerated, so they are called through this narrow signature.
 */
type AccountRpc = (fn: 'export_my_data' | 'delete_my_account', args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;

function rpc(client: AppSupabaseClient): AccountRpc {
  return client.rpc.bind(client) as unknown as AccountRpc;
}

/** Everything the server holds about the caller (`export_my_data`), as returned. */
export async function exportMyData(client: AppSupabaseClient): Promise<unknown> {
  const { data, error } = await rpc(client)('export_my_data');
  if (error) throw error;
  if (data === null || data === undefined) throw new Error('empty_export');
  return data;
}

/** Deletes the caller's account and every row tied to it. `confirm` must equal DELETE_CONFIRM_PHRASE. */
export async function deleteMyAccount(client: AppSupabaseClient, confirm: string): Promise<void> {
  const { error } = await rpc(client)('delete_my_account', { p_confirm: confirm });
  if (error) throw error;
}

/** `linguo-du-lieu-YYYY-MM-DD.json` for the user's local calendar date. */
export function exportFileName(isoDate: string): string {
  return `linguo-du-lieu-${isoDate}.json`;
}

/** Hands `data` to the browser as a pretty-printed JSON download. */
export function downloadJson(data: unknown, fileName: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke after the click has been handled; some browsers read the URL asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Every per-learner store this app keeps in the browser, by key prefix (localStorage and sessionStorage alike):
 * lesson + review outboxes, cached lesson text, role-play conversation, speaking self-ratings. Keys are suffixed
 * with the user id.
 */
const LEARNER_KEY_PREFIXES = [OUTBOX_KEY_PREFIX, REVIEW_OUTBOX_KEY_PREFIX, LESSON_CACHE_PREFIX, ROLEPLAY_KEY_PREFIX, REFLECTION_KEY_PREFIX];
/** Per-device (not per-user) key that still holds a learner's input: the onboarding draft. */
const LEARNER_EXACT_KEYS = [DRAFT_KEY];
// Kept on purpose: non-personal device preferences (`linguo-theme`, `linguo-reduce-motion`), the recovery-pending
// flag (no personal data) and the shared media cache (`linguo-media-v1`).

function wipeStore(store: Storage): void {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (key) keys.push(key);
  }
  for (const key of keys) {
    if (LEARNER_EXACT_KEYS.includes(key) || LEARNER_KEY_PREFIXES.some((p) => key.startsWith(p))) store.removeItem(key);
  }
}

/**
 * Sign-out and account deletion: removes every per-learner client store, for ALL user ids, because the device is
 * being handed over (queued, unsynced answers of this user are dropped too; sign-out already asked the learner to
 * confirm when some were pending). Each store is wiped independently: one failing never stops the rest, and this
 * never throws. `userId` additionally clears that user's keys by exact name in case enumeration fails.
 */
export function clearAllLocalLearnerData(userId?: string | null): void {
  for (const read of [() => localStorage, () => sessionStorage]) {
    try {
      wipeStore(read());
    } catch {
      // Storage blocked: nothing readable is stored either.
    }
  }
  if (userId) {
    const exact: Array<() => void> = [
      () => removeKey(outboxKey(userId)),
      () => removeKey(reviewOutboxKey(userId)),
      () => clearLessonCache(userId),
      () => clearSession(userId),
      () => clearReflections(userId),
    ];
    for (const fn of exact) {
      try {
        fn();
      } catch {
        // Keep going with the other stores.
      }
    }
  }
  try {
    window.dispatchEvent(new Event(OUTBOX_CHANGE_EVENT));
  } catch {
    // No window: nothing is listening.
  }
}

/** After the account is gone: nothing of it may stay on the device. */
export function clearLocalAccountData(userId: string): void {
  clearAllLocalLearnerData(userId);
}

const MESSAGES: Record<string, string> = {
  rate_limited: 'Bạn đã tải dữ liệu nhiều lần trong giờ qua. Vui lòng thử lại sau ít phút.',
  invalid_confirmation: `Chuỗi xác nhận chưa đúng. Hãy gõ chính xác “${DELETE_CONFIRM_PHRASE}”.`,
  not_authenticated: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
};

/** Vietnamese message for an export/delete failure. */
export function accountErrorMessage(error: unknown, action: 'export' | 'delete'): string {
  if (isNetworkError(error)) return 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.';
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    const known = MESSAGES[error.message];
    if (known) return known;
  }
  return action === 'export' ? 'Chưa tải được dữ liệu. Vui lòng thử lại.' : 'Chưa xoá được tài khoản. Vui lòng thử lại.';
}
