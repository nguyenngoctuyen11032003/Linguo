import type { RouteObject } from 'react-router';
import { AdminGuard } from './AdminGuard';
import { AdminLayout } from './AdminLayout';
import { AuditLogPage } from './AuditLogPage';
import { OverviewPage } from './OverviewPage';
import { ReportsPage } from './ReportsPage';
import { SourcesPage } from './SourcesPage';

/**
 * Children of `/quan-tri` (spec 11 §4). Mount them under `adminRootRoute` (guard + layout); Wave 2 wires that into
 * router.tsx as a lazy chunk.
 */
export const adminRoutes: RouteObject[] = [
  { index: true, element: <OverviewPage /> },
  { path: 'bao-loi', element: <ReportsPage /> },
  { path: 'nguon', element: <SourcesPage /> },
  {
    path: 'nhat-ky',
    element: (
      <AdminGuard minRole="admin">
        <AuditLogPage />
      </AdminGuard>
    ),
  },
  // TODO(wave2): C4 pages
  //   { path: 'noi-dung', element: <ContentListPage /> },
  //   { path: 'noi-dung/:kind/:id', element: <ContentDetailPage /> },
  //   { path: 'thong-ke', element: <AdminGuard minRole="admin"><AnalyticsPage /></AdminGuard> },
];

/** `/quan-tri`: staff only (404 for everyone else), compact admin layout, noindex. */
export const adminRootRoute: RouteObject = {
  path: 'quan-tri',
  element: (
    <AdminGuard>
      <AdminLayout />
    </AdminGuard>
  ),
  children: adminRoutes,
};
