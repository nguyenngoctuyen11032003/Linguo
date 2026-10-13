import { Settings2 } from 'lucide-react';
import { Link } from 'react-router';
import { SolidCard } from '@/components/ui/SolidCard';

/** Shown instead of auth/app screens when VITE_SUPABASE_* are not set. The landing page still works. */
export function NotConfigured() {
  return (
    <div className="flex min-h-hero items-center justify-center px-safe py-10">
      <SolidCard className="max-w-md space-y-4 text-center">
        <Settings2 aria-hidden className="mx-auto size-10 text-warn" />
        <h1 className="text-xl font-bold">Chưa cấu hình Supabase</h1>
        <p className="text-[15px] leading-relaxed text-muted">
          Thiếu <code>VITE_SUPABASE_URL</code> hoặc <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>. Làm theo hướng dẫn trong{' '}
          <code>docs/SETUP.md</code> rồi chạy lại.
        </p>
        <Link to="/" className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
          Về trang giới thiệu
        </Link>
      </SolidCard>
    </div>
  );
}
