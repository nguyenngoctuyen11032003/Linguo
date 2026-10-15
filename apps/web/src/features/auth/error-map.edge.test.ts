import { describe, expect, it } from 'vitest';
import { GENERIC_ERROR_MESSAGE } from '@/lib/error-fallback';
import { authErrorMessage, isKnownAuthErrorCode } from './error-map';

const KNOWN = [
  'invalid_credentials', 'email_not_confirmed', 'user_already_exists', 'email_exists', 'weak_password', 'same_password',
  'over_email_send_rate_limit', 'over_request_rate_limit', 'email_address_invalid', 'signup_disabled', 'provider_disabled',
  'flow_state_expired', 'flow_state_not_found', 'otp_expired', 'session_not_found', 'session_expired',
  'refresh_token_not_found', 'reauthentication_needed', 'bad_code_verifier', 'validation_failed', 'user_banned', 'access_denied',
];

describe('authErrorMessage', () => {
  it.each(KNOWN)('maps %s to a specific message without the raw code', (code) => {
    expect(isKnownAuthErrorCode(code)).toBe(true);
    const msg = authErrorMessage({ code });
    expect(msg).not.toBe(GENERIC_ERROR_MESSAGE);
    expect(msg).not.toContain(code);
    expect(msg).not.toContain('_');
  });

  it('does not treat Object.prototype keys as known codes', () => {
    for (const code of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(isKnownAuthErrorCode(code)).toBe(false);
      expect(authErrorMessage({ code })).toBe(GENERIC_ERROR_MESSAGE);
    }
  });

  it('rejects non-string codes', () => {
    for (const code of [undefined, null, 0, 42, {}, [], true]) expect(isKnownAuthErrorCode(code)).toBe(false);
  });

  it('falls back to the generic message for unknown codes and junk', () => {
    for (const e of [null, undefined, 'boom', 7, {}, { code: 'something_new' }, { code: '' }]) {
      expect(authErrorMessage(e)).toBe(GENERIC_ERROR_MESSAGE);
    }
  });

  it('maps by error name and by network shape', () => {
    expect(authErrorMessage({ name: 'AuthPKCECodeVerifierMissingError' })).toContain('cùng trình duyệt');
    expect(authErrorMessage({ name: 'AuthRetryableFetchError' })).toContain('Không kết nối');
    expect(authErrorMessage({ status: 0 })).toContain('Không kết nối');
    expect(authErrorMessage(new TypeError('Failed to fetch'))).toContain('Không kết nối');
  });

  it('prefers a known code over a name', () => {
    expect(authErrorMessage({ code: 'weak_password', name: 'AuthRetryableFetchError' })).toContain('Mật khẩu');
  });
});
