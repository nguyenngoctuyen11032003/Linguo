import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Link, NavLink } from 'react-router';
import { cn } from '@/lib/cn';
import { MORE_NAV, PRIMARY_NAV, type NavItem } from './nav';
import { Wordmark } from './Wordmark';
import { useTeacherNav } from '@/features/teacher/useTeacherNav';

const PRACTICE = MORE_NAV.filter((item) => !['/app/tien-do', '/app/cai-dat'].includes(item.to));
const PERSONAL = MORE_NAV.filter((item) => ['/app/tien-do', '/app/cai-dat'].includes(item.to));

function Group({ label, items, collapsed }: { label: string; items: NavItem[]; collapsed: boolean }) {
  if (items.length === 0) return null;
  return (
    <div className="sb-group">
      <p className={cn('sb-group__label eyebrow', collapsed && 'sb-group__label--collapsed')} aria-hidden>
        <span>{label}</span>
      </p>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} end={item.end} title={collapsed ? item.label : undefined} className={({ isActive }) => cn('sb-link', isActive && 'sb-link--active')}>
              {({ isActive }) => (
                <>
                  <item.icon aria-hidden className="sb-link__icon size-5" strokeWidth={isActive ? 2.3 : 1.8} />
                  <span className={cn('sb-link__text', collapsed && 'sr-only')}>{item.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Sidebar({ className, collapsed = false, onToggle }: { className?: string; collapsed?: boolean; onToggle?: () => void }) {
  const teacherNav = useTeacherNav();
  return (
    <aside data-collapsed={collapsed} className={cn('sb sticky top-0 h-app flex-col', className)}>
      <div className="sb__head">
        <Link to="/app" aria-label="Linguo" className="sb__brand focus-ring">
          <Wordmark size={32} markOnly={collapsed} />
        </Link>
      </div>
      <nav aria-label="Điều hướng chính (máy tính)" className="sb__nav">
        <Group label="Học" items={PRIMARY_NAV} collapsed={collapsed} />
        <Group label="Luyện tập" items={PRACTICE} collapsed={collapsed} />
        <Group label="Cá nhân" items={PERSONAL} collapsed={collapsed} />
        <Group label="Giáo viên" items={teacherNav} collapsed={collapsed} />
      </nav>
      {onToggle && (
        <button type="button" onClick={onToggle} aria-pressed={collapsed} aria-label={collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'} title={collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'} className="sb__toggle focus-ring">
          {collapsed ? <PanelLeftOpen aria-hidden className="size-5" /> : <PanelLeftClose aria-hidden className="size-5" />}
          <span className={cn('sb-link__text', collapsed && 'sr-only')}>Thu gọn</span>
        </button>
      )}
    </aside>
  );
}
