import { Outlet, ScrollRestoration } from 'react-router';
import { OfflineBanner } from '@/components/ui/OfflineBanner';

export function RootLayout() {
  return (
    <>
      <OfflineBanner />
      <Outlet />
      <ScrollRestoration />
    </>
  );
}
