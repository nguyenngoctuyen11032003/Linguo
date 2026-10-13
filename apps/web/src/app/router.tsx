import { createBrowserRouter, type RouteObject } from 'react-router';
import { AppLayout } from '@/components/layout/AppLayout';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { RootLayout } from '@/components/layout/RootLayout';
import { RedirectIfAuthed, RequireAuth } from '@/features/auth/guards';
import { AppRoute } from '@/routes/app/AppRoute';
import { ComingSoonPage } from '@/routes/app/ComingSoonPage';
import { DiagnosticPage } from '@/routes/app/diagnostic/DiagnosticPage';
import { DiagnosticReportPage } from '@/routes/app/diagnostic/DiagnosticReportPage';
import { HomePage } from '@/routes/app/HomePage';
import { LearnPage } from '@/routes/app/learn/LearnPage';
import { LessonPage } from '@/routes/app/lesson/LessonPage';
import { OnboardingPage } from '@/routes/app/onboarding/OnboardingPage';
import { ReviewPage } from '@/routes/app/review/ReviewPage';
import { SessionPage } from '@/routes/app/session/SessionPage';
import { SettingsPage } from '@/routes/app/SettingsPage';
import { TutorPage } from '@/routes/app/tutor/TutorPage';
import { AuthCallbackPage } from '@/routes/auth/AuthCallbackPage';
import { CheckEmailPage } from '@/routes/auth/CheckEmailPage';
import { ForgotPasswordPage } from '@/routes/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/routes/auth/ResetPasswordPage';
import { SignInPage } from '@/routes/auth/SignInPage';
import { SignUpPage } from '@/routes/auth/SignUpPage';
import { LandingPage } from '@/routes/landing/LandingPage';
import { LegalPage } from '@/routes/LegalPage';
import { NotFoundPage } from '@/routes/NotFoundPage';
import { RouteError } from '@/routes/RouteError';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: 'quyen-rieng-tu', element: <LegalPage kind="privacy" /> },
      { path: 'dieu-khoan', element: <LegalPage kind="terms" /> },
      {
        element: (
          <RedirectIfAuthed>
            <AuthLayout />
          </RedirectIfAuthed>
        ),
        children: [
          { path: 'dang-nhap', element: <SignInPage /> },
          { path: 'dang-ky', element: <SignUpPage /> },
          { path: 'quen-mat-khau', element: <ForgotPasswordPage /> },
          { path: 'kiem-tra-email', element: <CheckEmailPage /> },
        ],
      },
      {
        element: <AuthLayout />,
        children: [
          { path: 'auth/callback', element: <AuthCallbackPage /> },
          {
            path: 'dat-lai-mat-khau',
            element: (
              <RequireAuth>
                <ResetPasswordPage />
              </RequireAuth>
            ),
          },
        ],
      },
      {
        path: 'app',
        element: <AppRoute />,
        children: [
          { path: 'bat-dau', element: <OnboardingPage /> },
          { path: 'kiem-tra/:pathId', element: <DiagnosticPage /> },
          { path: 'kiem-tra/:pathId/ket-qua', element: <DiagnosticReportPage /> },
          { path: 'hoc-tap/bai/:lessonId', element: <LessonPage /> },
          {
            element: <AppLayout />,
            children: [
              { index: true, element: <HomePage /> },
              { path: 'hoc-tap', element: <LearnPage /> },
              { path: 'on-tap', element: <ReviewPage /> },
              { path: 'phien-hoc', element: <SessionPage /> },
              { path: 'gia-su', element: <TutorPage /> },
              { path: 'luyen-thi', element: <ComingSoonPage title="Luyện thi" /> },
              { path: 'tien-do', element: <ComingSoonPage title="Tiến độ" /> },
              { path: 'cai-dat', element: <SettingsPage /> },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export function createAppRouter() {
  const basename = import.meta.env.BASE_URL.replace(/\/+$/, '') || '/';
  return createBrowserRouter(routes, { basename });
}
