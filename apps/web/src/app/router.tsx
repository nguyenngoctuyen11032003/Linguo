import type { ComponentType } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { FullScreenLoader } from '@/components/layout/FullScreenLoader';
import { RootLayout } from '@/components/layout/RootLayout';
import { RedirectIfAuthed, RequireAuth } from '@/features/auth/guards';
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

/**
 * Route-level code splitting: the landing, legal and auth screens stay in the entry chunk; everything a signed-in
 * learner uses loads on demand (`/app` shell, lesson player, review, exams, ...). React Router holds a navigation
 * until the chunk arrives (the previous screen stays up, so nothing shifts) and shows `hydrateFallbackElement` on a
 * deep link. Every chunk is still in the service worker's precache (vite.config.ts globs all JS), so the app
 * keeps working offline. A failed chunk load reaches the route's errorElement ("Thử lại" reloads the page).
 */
function lazyPage<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K): Pick<RouteObject, 'lazy'> {
  return { lazy: async () => ({ Component: (await load())[name] }) };
}

/**
 * Spec 11 §4: `/quan-tri` ships as its own chunk, so learners never download admin code. React Router's `lazy` loads
 * elements but cannot add children, so the child paths are listed here (null = index) and kept in sync with
 * `adminRoutes` by a unit test; every element still comes from routes/admin/admin-routes.tsx.
 */
export const ADMIN_CHILD_PATHS = [null, 'noi-dung', 'noi-dung/:kind/:id', 'bao-loi', 'nguon', 'thong-ke', 'nhat-ky'] as const;
const loadAdmin = () => import('@/routes/admin/admin-routes');

const adminRoute: RouteObject = {
  path: 'quan-tri',
  handle: MAIN_LAYOUT,
  lazy: async () => ({ element: (await loadAdmin()).adminRootRoute.element }),
  children: ADMIN_CHILD_PATHS.map((path): RouteObject => {
    const lazy = async () => {
      const { adminRoutes } = await loadAdmin();
      return { element: adminRoutes.find((r) => (path === null ? r.index : r.path === path))?.element };
    };
    return path === null ? { index: true, lazy } : { path, lazy };
  }),
};

const routeTree: RouteObject[] = [
  {
    path: '/',
    element: <RootLayout />,
    hydrateFallbackElement: <FullScreenLoader />,
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
        ...lazyPage(() => import('@/routes/app/AppRoute'), 'AppRoute'),
        children: [
          { path: 'bat-dau', ...lazyPage(() => import('@/routes/app/onboarding/OnboardingPage'), 'OnboardingPage') },
          { path: 'kiem-tra/:pathId', ...lazyPage(() => import('@/routes/app/diagnostic/DiagnosticPage'), 'DiagnosticPage') },
          { path: 'kiem-tra/:pathId/ket-qua', ...lazyPage(() => import('@/routes/app/diagnostic/DiagnosticReportPage'), 'DiagnosticReportPage') },
          { path: 'hoc-tap/bai/:lessonId', ...lazyPage(() => import('@/routes/app/lesson/LessonPage'), 'LessonPage') },
          { path: 'luyen-thi/lam-bai/:attemptId', ...lazyPage(() => import('@/routes/app/exam/ExamRunnerPage'), 'ExamRunnerPage') },
          { path: 'luyen-thi/ket-qua/:attemptId', ...lazyPage(() => import('@/routes/app/exam/ExamResultPage'), 'ExamResultPage') },
          {
            ...lazyPage(() => import('@/components/layout/AppLayout'), 'AppLayout'),
            handle: MAIN_LAYOUT,
            children: [
              { index: true, ...lazyPage(() => import('@/routes/app/HomePage'), 'HomePage') },
              { path: 'hoc-tap', ...lazyPage(() => import('@/routes/app/learn/LearnPage'), 'LearnPage') },
              { path: 'on-tap', ...lazyPage(() => import('@/routes/app/review/ReviewPage'), 'ReviewPage') },
              { path: 'phien-hoc', ...lazyPage(() => import('@/routes/app/session/SessionPage'), 'SessionPage') },
              { path: 'gia-su', ...lazyPage(() => import('@/routes/app/tutor/TutorPage'), 'TutorPage') },
              { path: 'luyen-noi', ...lazyPage(() => import('@/routes/app/speaking/SpeakingPage'), 'SpeakingPage') },
              { path: 'luyen-thi', ...lazyPage(() => import('@/routes/app/exam/ExamHubPage'), 'ExamHubPage') },
              { path: 'tien-do', ...lazyPage(() => import('@/routes/app/progress/ProgressPage'), 'ProgressPage') },
              { path: 'cai-dat', ...lazyPage(() => import('@/routes/app/SettingsPage'), 'SettingsPage') },
              { path: 'thong-bao', ...lazyPage(() => import('@/routes/app/notifications/NotificationsPage'), 'NotificationsPage') },
            ],
          },
        ],
      },
      adminRoute,
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
