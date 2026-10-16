import { RequireAuth } from '@/features/auth/guards';
import { LegalPage } from '@/routes/legal/LegalPage';
import { ResetPasswordPage } from '@/routes/auth/ResetPasswordPage';

export const PrivacyPage = () => <LegalPage kind="privacy" />;
export const TermsPage = () => <LegalPage kind="terms" />;
export const GuardedResetPasswordPage = () => (
  <RequireAuth>
    <ResetPasswordPage />
  </RequireAuth>
);
