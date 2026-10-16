import { Link, NavLink } from 'react-router';
import { cn } from '@/lib/cn';
import { MORE_NAV, PRIMARY_NAV } from './nav';
import { Wordmark } from './Wordmark';
import { useTeacherNav } from '@/features/teacher/useTeacherNav';

export function Sidebar({ className }: { className?: string }) {
  const teacherNav = useTeacherNav();
  return (
    <aside className={cn('glass sticky top-0 h-app flex-col gap-8 border-y-0 border-l-0 px-4 py-6', className)}>
      <Link to="/app" aria-label="Linguo" className="inline-flex min-h-11 items-center px-2">
        <Wordmark size={32} />
      </Link>
      <nav aria-label="Điều hướng chính (máy tính)">
        <ul className="space-y-1">
          {[...PRIMARY_NAV, ...MORE_NAV, ...teacherNav].map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'relative flex min-h-11 items-center gap-3 rounded-2xl px-3 text-[15px] font-semibold transition-colors',
                    isActive
                      ? 'bg-primary/12 text-text before:absolute before:inset-y-2.5 before:-left-4 before:w-1 before:rounded-r-full before:bg-primary'
                      : 'text-muted hover:bg-text/5 hover:text-text',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon aria-hidden className={cn('size-5', isActive && 'text-primary')} strokeWidth={isActive ? 2.3 : 1.9} />
                    {item.label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
