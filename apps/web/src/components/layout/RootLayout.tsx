import { Outlet, ScrollRestoration } from 'react-router';
import { PwaBridge } from '@/app/PwaBridge';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import { RouteAnnouncer } from './RouteAnnouncer';

export function RootLayout() {
  return (
    <>
      <OfflineBanner />
      <Outlet />
      <RouteAnnouncer />
      <PwaBridge />
      <ScrollRestoration />
    </>
  );
}
