import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { buttonClasses } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

export function NotFoundPage() {
  return (
    <main id="main" className="relative isolate flex min-h-hero flex-col justify-center overflow-x-clip px-safe py-10">
      <div aria-hidden="true" className="absolute left-1/2 top-1/3 -z-10 size-80 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
      <div className="mx-auto w-full max-w-md">
        <p aria-hidden="true" className="stat-num text-gradient-fade -ml-1 text-[clamp(140px,48vw,200px)]">
          404
        </p>
        <div className="mt-2 flex items-center gap-2 text-primary">
          <Compass aria-hidden className="size-5" />
          <span className="text-xs font-semibold uppercase tracking-[0.08em]">Lạc đường</span>
        </div>
        <h1 className="page-title mt-2">Không tìm thấy trang</h1>
        <p className="mt-3.5 max-w-sm text-pretty text-[15px] leading-relaxed text-muted">Đường dẫn có thể đã thay đổi hoặc không còn tồn tại.</p>
        <Link to="/" className={cn(buttonClasses('accent', 'lg', true), 'mt-7')}>
          Về trang chủ
        </Link>
      </div>
    </main>
  );
}
