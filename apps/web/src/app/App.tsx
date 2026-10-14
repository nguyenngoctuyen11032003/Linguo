import { useState } from 'react';
import { RouterProvider } from 'react-router';
import { ToastProvider } from '@/components/ui/Toast';
import { AnalyticsProvider } from '@/features/analytics';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { MotionProvider } from '@/providers/MotionProvider';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { createAppRouter } from './router';

export function App() {
  const [router] = useState(createAppRouter);
  return (
    <ThemeProvider>
      <MotionProvider>
        <AuthProvider>
          <AnalyticsProvider>
            <ToastProvider>
              <RouterProvider router={router} />
            </ToastProvider>
          </AnalyticsProvider>
        </AuthProvider>
      </MotionProvider>
    </ThemeProvider>
  );
}
