import { describe, expect, it } from 'vitest';
import { matchesDeletePhrase } from './delete-phrase';

describe('matchesDeletePhrase', () => {
  it.each(['XOA TAI KHOAN', 'xoa tai khoan', '  Xoa Tai Khoan  ', 'XÓA TÀI KHOẢN', 'xóa tài khoản', 'Xoá   tài  khoản', 'XOÁ TÀI KHOẢN'])(
    'accepts %j',
    (value) => {
      expect(matchesDeletePhrase(value)).toBe(true);
    },
  );

  it.each(['', 'XOA', 'XOA TAI KHOAN.', 'XOATAIKHOAN', 'XOA TAI KHOAN CUA TOI', 'XÓA TÀI KHOẢ'])('rejects %j', (value) => {
    expect(matchesDeletePhrase(value)).toBe(false);
  });
});
