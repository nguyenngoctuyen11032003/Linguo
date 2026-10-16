import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { buttonClasses } from '@/components/ui/Button';

export function NotFoundPage() {
  return (
    <main id="main" className="flex min-h-hero flex-col items-center justify-center gap-4 px-safe py-10 text-center">
      <Compass aria-hidden className="size-12 text-primary" />
      <h1 className="page-title">Không tìm thấy trang</h1>
      <p className="max-w-sm text-[15px] text-muted">Đường dẫn có thể đã thay đổi hoặc không còn tồn tại.</p>
      <Link to="/" className={buttonClasses('accent', 'lg')}>
        Về trang chủ
      </Link>
    </main>
  );
}
