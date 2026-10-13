import { describe, expect, it } from 'vitest';
import {
  fieldErrors,
  isValidTimeZone,
  preferencesUpdateSchema,
  profileUpdateSchema,
  signInSchema,
  signUpSchema,
} from './schemas';
import { LANGUAGES, SKILLS } from './constants';

describe('signUpSchema', () => {
  it('accepts a valid sign-up and trims fields', () => {
    const r = signUpSchema.parse({ displayName: '  Minh Anh ', email: ' a@b.vn ', password: 'matkhau123' });
    expect(r).toEqual({ displayName: 'Minh Anh', email: 'a@b.vn', password: 'matkhau123' });
  });

  it('rejects short passwords and bad emails with Vietnamese messages', () => {
    const r = signUpSchema.safeParse({ displayName: '', email: 'khong-phai-email', password: '123' });
    expect(r.success).toBe(false);
    if (r.success) return;
    const errors = fieldErrors(r.error);
    expect(errors.email).toBe('Email không hợp lệ.');
    expect(errors.password).toBe('Mật khẩu cần ít nhất 8 ký tự.');
  });

  it('rejects display names longer than 60 characters', () => {
    const r = signUpSchema.safeParse({ displayName: 'a'.repeat(61), email: 'a@b.vn', password: 'matkhau123' });
    expect(r.success).toBe(false);
  });
});

describe('signInSchema', () => {
  it('requires a password', () => {
    const r = signInSchema.safeParse({ email: 'a@b.vn', password: '' });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(fieldErrors(r.error).password).toBe('Vui lòng nhập mật khẩu.');
  });
});

describe('profile and preferences', () => {
  it('validates IANA time zones', () => {
    expect(isValidTimeZone('Asia/Ho_Chi_Minh')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('Asia/Tokyo')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
  });

  it('rejects offset-style and malformed zones', () => {
    for (const tz of ['+07:00', '-05:00', 'UTC+7', 'GMT+07:00', '', ' Asia/Tokyo', 'Asia//Tokyo', 'Asia/Tokyo/']) {
      expect(isValidTimeZone(tz), tz).toBe(false);
    }
  });

  it('limits passwords by UTF-8 bytes, not characters', () => {
    const ok = signUpSchema.safeParse({ displayName: '', email: 'a@b.vn', password: 'a'.repeat(72) });
    expect(ok.success).toBe(true);
    // 37 two-byte characters = 37 chars but 74 bytes
    const multi = signUpSchema.safeParse({ displayName: '', email: 'a@b.vn', password: 'ê'.repeat(37) });
    expect(multi.success).toBe(false);
    if (multi.success) return;
    expect(fieldErrors(multi.error).password).toBe('Mật khẩu quá dài.');
    expect(signUpSchema.safeParse({ displayName: '', email: 'a@b.vn', password: 'ê'.repeat(36) }).success).toBe(true);
  });

  it('rejects unknown zones in profileUpdateSchema', () => {
    expect(profileUpdateSchema.safeParse({ displayName: 'An', timezone: 'Mars/Olympus' }).success).toBe(false);
  });

  it('accepts only known themes', () => {
    expect(preferencesUpdateSchema.safeParse({ theme: 'dark', reduceMotion: true }).success).toBe(true);
    expect(preferencesUpdateSchema.safeParse({ theme: 'blue', reduceMotion: true }).success).toBe(false);
  });
});

describe('constants', () => {
  it('has six skills and Korean marked as not yet available', () => {
    expect(SKILLS).toHaveLength(6);
    expect(LANGUAGES.en.available).toBe(true);
    expect(LANGUAGES.ko.available).toBe(false);
  });
});
