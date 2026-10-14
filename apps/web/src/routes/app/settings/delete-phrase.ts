import { DELETE_CONFIRM_PHRASE } from '@/features/account/service';

/** Upper-case, no diacritics, single spaces: "  Xóa  tài khoản " and "xoa tai khoan" both become "XOA TAI KHOAN". */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * Whether what the learner typed confirms deleting the account: the phrase in any case, with or without Vietnamese
 * diacritics ("XOA TAI KHOAN" or "XÓA TÀI KHOẢN"). The server is still sent DELETE_CONFIRM_PHRASE verbatim.
 */
export function matchesDeletePhrase(value: string): boolean {
  return normalize(value) === DELETE_CONFIRM_PHRASE;
}
