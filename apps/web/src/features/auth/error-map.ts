const BY_CODE: Record<string, string> = {
  invalid_credentials: 'Email hoặc mật khẩu không đúng.',
  email_not_confirmed: 'Email chưa được xác minh. Hãy mở liên kết trong email chúng tôi đã gửi.',
  user_already_exists: 'Email này đã được đăng ký. Hãy đăng nhập hoặc dùng "Quên mật khẩu".',
  email_exists: 'Email này đã được đăng ký. Hãy đăng nhập hoặc dùng "Quên mật khẩu".',
  weak_password: 'Mật khẩu quá yếu. Hãy dùng ít nhất 8 ký tự, kết hợp chữ và số.',
  same_password: 'Mật khẩu mới phải khác mật khẩu cũ.',
  over_email_send_rate_limit: 'Bạn đã yêu cầu gửi email quá nhiều lần. Vui lòng thử lại sau ít phút.',
  over_request_rate_limit: 'Quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.',
  email_address_invalid: 'Email không hợp lệ.',
  signup_disabled: 'Đăng ký tạm thời bị tắt.',
  provider_disabled: 'Phương thức đăng nhập này chưa được bật.',
  flow_state_expired: 'Liên kết đã hết hạn. Vui lòng yêu cầu liên kết mới.',
  flow_state_not_found: 'Liên kết không hợp lệ hoặc đã được dùng. Vui lòng yêu cầu liên kết mới.',
  otp_expired: 'Liên kết đã hết hạn. Vui lòng yêu cầu liên kết mới.',
  session_not_found: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
};

const BY_NAME: Record<string, string> = {
  AuthPKCECodeVerifierMissingError:
    'Hãy mở liên kết trên cùng trình duyệt bạn đã dùng để đăng ký hoặc đăng nhập. Nếu đó là email xác minh, tài khoản có thể đã được xác minh — hãy thử đăng nhập.',
  AuthRetryableFetchError: 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.',
};

export function authErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const e = error as { code?: unknown; name?: unknown; status?: unknown };
    if (typeof e.code === 'string') {
      const byCode = BY_CODE[e.code];
      if (byCode) return byCode;
    }
    if (typeof e.name === 'string') {
      const byName = BY_NAME[e.name];
      if (byName) return byName;
    }
    if (e.status === 0 || error instanceof TypeError) return 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.';
    if (typeof e.code === 'string') return `Đã có lỗi xảy ra (mã: ${e.code}). Vui lòng thử lại.`;
  }
  return 'Đã có lỗi xảy ra. Vui lòng thử lại.';
}
