import type { ComponentType } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { FullScreenLoader } from '@/components/layout/FullScreenLoader';
import { RootLayout } from '@/components/layout/RootLayout';
import { RedirectIfAuthed } from '@/features/auth/guards';
import { installRoutePrefetch, prefetchOnIdle } from '@/lib/prefetch';
import { enableViewTransitions } from '@/lib/view-transitions';
import { LandingPage } from '@/routes/landing/LandingPage';
import { NotFoundPage } from '@/routes/NotFoundPage';
import { RouteError } from '@/routes/RouteError';
import { loadAppServices } from './app-services';

/** Layout routes whose element renders `<main>`: error elements below them must not add a second one. */
const MAIN_LAYOUT = { providesMain: true } as const;

/**
 * React Router leaves a route blank (no errorElement) when its lazy() rejects, e.g. a chunk that fails to load on a
 * flaky network or after a new deploy. Resolve with a component that rethrows during render instead, so the route's
 * RouteError (friendly screen + error report) shows.
 */
function failedChunk(error: unknown): Pick<RouteObject, 'Component'> {
  return {
    Component: () => {
      throw error;
    },
  };
}

/**
 * Route-level code splitting: only the landing page stays in the entry chunk. The signed-out screens (auth, legal)
 * share one lazy chunk (public-pages.ts) and everything a signed-in
 * learner uses loads on demand (`/app` shell, lesson player, review, exams, ...). React Router holds a navigation
 * until the chunk arrives (the previous screen stays up, so nothing shifts) and shows `hydrateFallbackElement` on a
 * deep link. Every chunk is still in the service worker's precache (vite.config.ts globs all JS), so the app
 * keeps working offline. A failed chunk load reaches the route's errorElement ("Thử lại" reloads the page).
 *
 * Every route that may talk to Supabase also waits for the app services (Supabase client and analytics, see
 * app-services.ts), loaded in parallel with its own chunk, so getSupabase() is set before the screen renders. Only
 * the legal pages, which need neither, skip that (`services: false`).
 */
function lazyPage<K extends string>(
  load: () => Promise<Record<K, ComponentType>>,
  name: K,
  { services = true }: { services?: boolean } = {},
): Pick<RouteObject, 'lazy'> {
  return {
    lazy: async () => {
      try {
        const [mod] = await Promise.all([load(), services ? loadAppServices() : null]);
        return { Component: mod[name] };
      } catch (error) {
        return failedChunk(error);
      }
    },
  };
}

/**
 * Spec 11 §4: `/quan-tri` ships as its own chunk, so learners never download admin code. React Router's `lazy` loads
 * elements but cannot add children, so the child paths are listed here (null = index) and kept in sync with
 * `adminRoutes` by a unit test; every element still comes from routes/admin/admin-routes.tsx.
 */
export const ADMIN_CHILD_PATHS = [null, 'noi-dung', 'noi-dung/:kind/:id', 'bao-loi', 'nguon', 'thong-ke', 'nhat-ky', 'nhan-su'] as const;
const loadAdmin = () => import('@/routes/admin/admin-routes');

const adminRoute: RouteObject = {
  path: 'quan-tri',
  handle: MAIN_LAYOUT,
  lazy: async () => {
    try {
      const [admin] = await Promise.all([loadAdmin(), loadAppServices()]);
      return { element: admin.adminRootRoute.element };
    } catch (error) {
      return failedChunk(error);
    }
  },
  children: ADMIN_CHILD_PATHS.map((path): RouteObject => {
    const lazy = async () => {
      try {
        const [{ adminRoutes }] = await Promise.all([loadAdmin(), loadAppServices()]);
        return { element: adminRoutes.find((r) => (path === null ? r.index : r.path === path))?.element };
      } catch (error) {
        return failedChunk(error);
      }
    };
    return path === null ? { index: true, lazy } : { path, lazy };
  }),
};

const loadPublic = () => import('./public-pages');

const routeTree: RouteObject[] = [
  {
    path: '/',
    element: <RootLayout />,
    hydrateFallbackElement: <FullScreenLoader />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: 'quyen-rieng-tu', ...lazyPage(loadPublic, 'PrivacyPage', { services: false }) },
      { path: 'dieu-khoan', ...lazyPage(loadPublic, 'TermsPage', { services: false }) },
      {
        element: (
          <RedirectIfAuthed>
            <AuthLayout />
          </RedirectIfAuthed>
        ),
        handle: MAIN_LAYOUT,
        children: [
          { path: 'dang-nhap', ...lazyPage(loadPublic, 'SignInPage') },
          { path: 'dang-ky', ...lazyPage(loadPublic, 'SignUpPage') },
          { path: 'quen-mat-khau', ...lazyPage(loadPublic, 'ForgotPasswordPage') },
          { path: 'kiem-tra-email', ...lazyPage(loadPublic, 'CheckEmailPage') },
        ],
      },
      {
        element: <AuthLayout />,
        handle: MAIN_LAYOUT,
        children: [
          { path: 'auth/callback', ...lazyPage(loadPublic, 'AuthCallbackPage') },
          { path: 'dat-lai-mat-khau', ...lazyPage(loadPublic, 'GuardedResetPasswordPage') },
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
              { path: 'dong-vai', ...lazyPage(() => import('@/routes/app/roleplay/RoleplayPage'), 'RoleplayPage') },
              { path: 'luyen-thi', ...lazyPage(() => import('@/routes/app/exam/ExamHubPage'), 'ExamHubPage') },
              { path: 'tien-do', ...lazyPage(() => import('@/routes/app/progress/ProgressPage'), 'ProgressPage') },
              { path: 'cai-dat', ...lazyPage(() => import('@/routes/app/SettingsPage'), 'SettingsPage') },
              { path: 'thong-bao', ...lazyPage(() => import('@/routes/app/notifications/NotificationsPage'), 'NotificationsPage') },
              // Personal vocabulary (spec P2): lists, one list, and its review.
              { path: 'tu-vung-cua-toi', ...lazyPage(() => import('@/routes/app/vocab/PersonalListsPage'), 'PersonalListsPage') },
              { path: 'tu-vung-cua-toi/:listId', ...lazyPage(() => import('@/routes/app/vocab/PersonalListPage'), 'PersonalListPage') },
              { path: 'tu-vung-cua-toi/:listId/on-tap', ...lazyPage(() => import('@/routes/app/vocab/PersonalReviewPage'), 'PersonalReviewPage') },
              // Classes, learner side (PRD P2): join by code (also the invite link), my classes and assignments.
              { path: 'lop-hoc', ...lazyPage(() => import('@/routes/app/classes/ClassesPage'), 'ClassesPage') },
              { path: 'lop-hoc/tham-gia', ...lazyPage(() => import('@/routes/app/classes/JoinClassPage'), 'JoinClassPage') },
            ],
          },
        ],
      },
      adminRoute,
      // Teacher tools (PRD P2): own chunk and shell, only for users with a teacher profile.
      {
        path: 'giao-vien',
        ...lazyPage(() => import('@/routes/teacher/TeacherRoute'), 'TeacherRoute'),
        handle: MAIN_LAYOUT,
        children: [
          { index: true, ...lazyPage(() => import('@/routes/teacher/TeacherClassesPage'), 'TeacherClassesPage') },
          { path: 'lop/:classId', ...lazyPage(() => import('@/routes/teacher/TeacherClassPage'), 'TeacherClassPage') },
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

/** Likely-next screens, warmed on idle (lib/prefetch.ts): the bottom-nav tabs inside /app, sign-in elsewhere. */
export const APP_IDLE_PREFETCH = ['/app', '/app/hoc-tap', '/app/on-tap', '/app/tien-do', '/app/cai-dat'] as const;
export const PUBLIC_IDLE_PREFETCH = ['/dang-nhap'] as const;

export function createAppRouter() {
  const basename = import.meta.env.BASE_URL.replace(/\/+$/, '') || '/';
  const router = createBrowserRouter(routes, { basename });
  enableViewTransitions(router);
  installRoutePrefetch(routes, basename);
  // Warm the likely-next chunks once the first screen has settled (no navigation in flight).
  let warmedApp = false;
  let warmedPublic = false;
  const warm = (pathname: string) => {
    if (pathname.startsWith('/app')) {
      if (warmedApp) return;
      warmedApp = true;
      prefetchOnIdle(APP_IDLE_PREFETCH);
    } else if (!warmedPublic && !pathname.startsWith('/quan-tri') && !pathname.startsWith('/giao-vien')) {
      warmedPublic = true;
      prefetchOnIdle(PUBLIC_IDLE_PREFETCH);
    }
  };
  if (router.state.initialized) warm(router.state.location.pathname);
  router.subscribe((state) => {
    if (state.initialized && state.navigation.state === 'idle') warm(state.location.pathname);
  });
  return router;
}
