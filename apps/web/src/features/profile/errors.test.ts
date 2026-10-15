import { describe, expect, it } from 'vitest';
import { profileSaveErrorMessage } from './errors';

const GENERIC = 'Chưa lưu được hồ sơ. Kiểm tra mạng rồi thử lại.';

describe('profileSaveErrorMessage', () => {
  it('shows the cooldown end in the learner time zone (Ho Chi Minh vs UTC differ across midnight)', () => {
    const details = '2026-10-15T20:30:00Z';
    const hcm = profileSaveErrorMessage({ message: 'timezone_change_cooldown', details }, 'Asia/Ho_Chi_Minh');
    const utc = profileSaveErrorMessage({ message: 'timezone_change_cooldown', details }, 'UTC');
    expect(hcm).toContain('16/10/2026');
    expect(hcm).toContain('03:30');
    expect(utc).toContain('15/10/2026');
    expect(utc).toContain('20:30');
  });

  it('omits the time when details are missing or invalid', () => {
    for (const details of [undefined, null, 'garbage', '', 123]) {
      expect(profileSaveErrorMessage({ message: 'timezone_change_cooldown', details }, 'UTC')).toBe('Múi giờ chỉ được đổi một lần mỗi 24 giờ.');
    }
  });

  it('survives an invalid time zone', () => {
    expect(profileSaveErrorMessage({ message: 'timezone_change_cooldown', details: '2026-10-15T20:30:00Z' }, 'Not/AZone')).toContain('Bạn có thể đổi lại sau');
  });

  it('everything else gets the generic message without a raw code', () => {
    for (const e of [null, undefined, 'x', 5, {}, { message: 'other_code' }, new Error('boom')]) {
      expect(profileSaveErrorMessage(e, 'UTC')).toBe(GENERIC);
    }
  });
});
