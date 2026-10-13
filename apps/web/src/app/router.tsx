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
import { LegalPage } from '@/routes/legal/LegalPage';
import { NotFoundPage } from '@/routes/NotFoundPage';
import { RouteError } from '@/routes/RouteError';

/** Layout routes whose element renders `<main>`: error elements below them must not add a second one. */
const MAIN_LAYOUT = { providesMain: true } as const;

const routeTree: RouteObject[] = [
  {
    path: '/',
    element: <RootLayout />,
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
        handle: MAIN_LAYOUT,
        children: [
          { path: 'dang-nhap', element: <SignInPage /> },
          { path: 'dang-ky', element: <SignUpPage /> },
          { path: 'quen-mat-khau', element: <ForgotPasswordPage /> },
          { path: 'kiem-tra-email', element: <CheckEmailPage /> },
        ],
      },
      {
        element: <AuthLayout />,
        handle: MAIN_LAYOUT,
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
            handle: MAIN_LAYOUT,
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

/**
 * Every route gets its own error boundary (spec 7 §2): a crash renders RouteError in place of that route only, so
 * the parent layout (navigation, offline banner) stays usable.
 */
function withErrorBoundaries(list: RouteObject[], inMain: boolean): RouteObject[] {
  return list.map((route) => {
    const childInMain = inMain || route.handle === MAIN_LAYOUT;
    const errorElement = route.errorElement ?? <RouteError inMain={inMain} />;
    if (route.index) return { ...route, errorElement } as RouteObject;
    return { ...route, errorElement, children: route.children && withErrorBoundaries(route.children, childInMain) } as RouteObject;
  });
}

export const routes: RouteObject[] = withErrorBoundaries(routeTree, false);

export function createAppRouter() {
  const basename = import.meta.env.BASE_URL.replace(/\/+$/, '') || '/';
  return createBrowserRouter(routes, { basename });
}
