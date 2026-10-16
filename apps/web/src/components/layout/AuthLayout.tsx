import { Link, Outlet } from 'react-router';
import { Wordmark } from './Wordmark';

export function AuthLayout() {
  return (
    <div className="relative min-h-hero overflow-x-clip">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_55%_at_10%_0%,rgb(76_162_209/0.22),transparent_65%),radial-gradient(ellipse_70%_50%_at_100%_100%,rgb(243_125_37/0.16),transparent_65%)]"
      />
      <div className="relative mx-auto flex min-h-hero w-full max-w-md flex-col px-safe pb-safe pt-safe">
        <header className="flex items-center py-3">
          <Link to="/" aria-label="Linguo" className="inline-flex min-h-11 items-center">
            <Wordmark size={32} />
          </Link>
        </header>
        <main id="main" className="flex flex-1 flex-col justify-center py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
