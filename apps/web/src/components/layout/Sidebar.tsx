import { Link, NavLink } from 'react-router';
import { asset } from '@/lib/asset';
import { cn } from '@/lib/cn';
import { MORE_NAV, PRIMARY_NAV } from './nav';
import { useTeacherNav } from '@/features/teacher/useTeacherNav';

export function Sidebar({ className }: { className?: string }) {
  const teacherNav = useTeacherNav();
  return (
    <aside className={cn('sticky top-0 h-app flex-col gap-6 border-r border-border bg-surface-solid px-4 py-6', className)}>
      <Link to="/app" className="inline-flex min-h-11 items-center gap-2 px-2 text-lg font-bold tracking-[-0.02em]">
        <img src={asset('brand/logo-mark.svg')} alt="" width={32} height={32} className="size-8" />
        Linguo
      </Link>
      <nav aria-label="Điều hướng chính (máy tính)">
        <ul className="space-y-1">
          {[...PRIMARY_NAV, ...MORE_NAV, ...teacherNav].map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn('flex min-h-11 items-center gap-3 rounded-2xl px-3 text-[15px] font-medium', isActive ? 'bg-primary/12 text-primary' : 'text-muted hover:bg-text/5 hover:text-text')
                }
              >
                <item.icon aria-hidden className="size-5" />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
