import { Outlet, ScrollRestoration } from 'react-router';
import { PwaBridge } from '@/app/PwaBridge';
import { OfflineBanner } from '@/components/ui/OfflineBanner';

export function RootLayout() {
  return (
    <>
      <OfflineBanner />
      <Outlet />
      <PwaBridge />
      <ScrollRestoration />
    </>
  );
}
