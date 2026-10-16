import { useState, useSyncExternalStore } from 'react';
import { RouterProvider } from 'react-router';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { MotionProvider } from '@/providers/MotionProvider';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { loadedAnalyticsProvider, onAnalyticsProviderLoaded, whenAppServicesReady } from './app-services';
import { createAppRouter } from './router';

/**
 * The AnalyticsProvider arrives with the lazy app services (app-services.ts). It renders nothing itself, so it sits
 * next to the tree instead of around it (wrapping later would remount the router); it is mounted before the
 * AuthProvider can report a signed-in user, i.e. before any screen that tracks.
 */
function DeferredAnalytics() {
  const Analytics = useSyncExternalStore(onAnalyticsProviderLoaded, loadedAnalyticsProvider);
  return Analytics ? <Analytics>{null}</Analytics> : null;
}

export function App() {
  const [router] = useState(createAppRouter);
  return (
    <ThemeProvider>
      <MotionProvider>
        <AuthProvider loadClient={whenAppServicesReady}>
          <DeferredAnalytics />
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </AuthProvider>
      </MotionProvider>
    </ThemeProvider>
  );
}
