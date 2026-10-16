// One lazy chunk for the signed-out screens reached from the landing page (sign in/up, password reset, legal).
// Grouped so a deep link or the first tap on "Đăng nhập" costs a single request; router.tsx prefetches it on idle.
export { AuthCallbackPage } from '@/routes/auth/AuthCallbackPage';
export { CheckEmailPage } from '@/routes/auth/CheckEmailPage';
export { ForgotPasswordPage } from '@/routes/auth/ForgotPasswordPage';
export { SignInPage } from '@/routes/auth/SignInPage';
export { SignUpPage } from '@/routes/auth/SignUpPage';
export { GuardedResetPasswordPage, PrivacyPage, TermsPage } from './public-wrappers';
