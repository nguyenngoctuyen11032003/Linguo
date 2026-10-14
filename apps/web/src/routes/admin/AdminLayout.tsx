import { useEffect, useState } from 'react';
import type { StaffRole } from '@linguo/shared';
import { ArrowLeft, BarChart3, BookOpen, Flag, LayoutDashboard, Library, ScrollText, type LucideIcon } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router';
import { breakOutOfFrame, isFramed } from '@/features/admin/frame-guard';
import { STAFF_ROLE_LABELS_VI, hasStaffRole } from '@/features/admin/service';
import { useAdminRole } from '@/features/admin/useStaffRole';
import { cn } from '@/lib/cn';

interface AdminNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  minRole?: StaffRole;
}

const ADMIN_NAV: readonly AdminNavItem[] = [
  { to: '/quan-tri', label: 'Tổng quan', icon: LayoutDashboard, end: true },
  { to: '/quan-tri/noi-dung', label: 'Nội dung', icon: BookOpen },
  { to: '/quan-tri/bao-loi', label: 'Báo lỗi', icon: Flag },
  { to: '/quan-tri/nguon', label: 'Nguồn', icon: Library },
  { to: '/quan-tri/thong-ke', label: 'Thống kê', icon: BarChart3, minRole: 'admin' },
  { to: '/quan-tri/nhat-ky', label: 'Nhật ký', icon: ScrollText, minRole: 'admin' },
];

/** Keeps the admin area out of search indexes while it is mounted (spec 11 §4), restoring the previous tag after. */
function useNoIndex() {
  useEffect(() => {
    let meta = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const created = !meta;
    const previous = meta?.getAttribute('content') ?? null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'robots');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', 'noindex');
    const tag = meta;
    return () => {
      if (created) tag.remove();
      else if (previous !== null) tag.setAttribute('content', previous);
      else tag.removeAttribute('content');
    };
  }, []);
}

/** What an embedded copy shows instead of the admin pages: nothing sensitive, only a way to open the real page. */
function FramedNotice() {
  useEffect(() => {
    breakOutOfFrame();
  }, []);
  return (
    <main className="min-h-hero bg-bg p-6 text-center">
      <p className="mb-3 text-[15px]">Trang quản trị không được hiển thị bên trong trang khác.</p>
      <a href={window.location.href} target="_top" rel="noopener" className="font-semibold text-primary underline underline-offset-4">
        Mở trang quản trị trong cửa sổ riêng
      </a>
    </main>
  );
}

/** Compact staff layout: desktop first (side nav), a scrolling tab row on small screens. */
export function AdminLayout() {
  const role = useAdminRole();
  useNoIndex();
  // Evaluated once per mount: a page cannot move between being framed and not.
  const [framed] = useState(() => isFramed());
  if (framed) return <FramedNotice />;
  const items = ADMIN_NAV.filter((item) => !item.minRole || hasStaffRole(role, item.minRole));

  return (
    <div className="min-h-hero bg-bg">
      <a href="#main" className="sr-only z-[100] rounded-full bg-primary px-4 py-2 text-on-primary focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Bỏ qua tới nội dung
      </a>
      <header className="sticky top-0 z-30 border-b border-border bg-surface-solid pt-safe">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-safe">
          <Link to="/quan-tri" className="inline-flex min-h-11 items-center gap-2 font-bold tracking-[-0.02em]">
            <span>Linguo</span>
            <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-sm font-semibold text-text">Quản trị</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {role && <span className="hidden text-muted sm:inline">{STAFF_ROLE_LABELS_VI[role]}</span>}
            <Link to="/app" className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 font-medium text-muted hover:bg-text/5 hover:text-text">
              <ArrowLeft aria-hidden className="size-4" />
              Về ứng dụng
            </Link>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-6 lg:px-safe">
        <nav aria-label="Điều hướng quản trị" className="border-b border-border lg:border-b-0 lg:py-6">
          <ul className="flex gap-1 overflow-x-auto px-safe py-2 lg:flex-col lg:overflow-visible lg:p-0">
            {items.map((item) => (
              <li key={item.to} className="shrink-0">
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-11 items-center gap-2 whitespace-nowrap rounded-2xl px-3 text-[15px] font-medium',
                      isActive ? 'bg-primary/12 font-semibold text-text' : 'text-muted hover:bg-text/5 hover:text-text',
                    )
                  }
                >
                  <item.icon aria-hidden className="size-4" />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <main id="main" className="min-w-0 px-safe pb-12 pt-5 lg:px-0 lg:pt-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
