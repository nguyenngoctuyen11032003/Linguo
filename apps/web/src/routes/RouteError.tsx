import { AlertTriangle } from 'lucide-react';
import { useEffect } from 'react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { Button, buttonClasses } from '@/components/ui/Button';
import { SolidCard } from '@/components/ui/SolidCard';
import { reportRenderError } from '@/lib/error-reporting';
import { NotFoundPage } from './NotFoundPage';

interface Props {
  /** True when the parent layout already renders `<main>` (AppLayout, AuthLayout): no second landmark. */
  inMain?: boolean;
}

function devDetail(error: unknown): string | null {
  if (!import.meta.env.DEV) return null;
  if (error instanceof Error) return error.stack ?? error.message;
  return String(error);
}

/**
 * errorElement of every route (spec 7 §2): a crash in one screen shows this inside its parent layout instead of a
 * blank app. Production never shows the stack or the raw message.
 */
export function RouteError({ inMain = false }: Props) {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  useEffect(() => {
    if (!notFound) reportRenderError(error);
  }, [error, notFound]);
  if (notFound) return <NotFoundPage />;
  if (import.meta.env.DEV) console.error(error);
  const detail = devDetail(error);

  const body = (
    <div className="flex min-h-[60dvh] items-center justify-center px-safe py-10">
      <SolidCard role="alert" className="flex w-full max-w-md flex-col items-center gap-3 px-6 py-8 text-center">
        <AlertTriangle aria-hidden className="size-8 text-error" />
        <h1 className="text-xl font-bold">Có lỗi xảy ra</h1>
        <p className="text-[15px] text-muted">Màn hình này gặp sự cố. Dữ liệu đã lưu không bị mất; hãy thử lại hoặc về trang chủ.</p>
        {detail && (
          <pre data-testid="route-error-detail" className="max-h-40 w-full overflow-auto rounded-xl bg-text/5 p-3 text-left text-xs">
            {detail}
          </pre>
        )}
        <div className="mt-2 grid w-full gap-2 sm:grid-cols-2">
          <Button variant="primary" onClick={() => window.location.reload()}>
            Thử lại
          </Button>
          <Link to="/" reloadDocument className={buttonClasses('ghost')}>
            Về trang chủ
          </Link>
        </div>
      </SolidCard>
    </div>
  );

  return inMain ? (
    body
  ) : (
    <main id="main" className="min-h-hero">
      {body}
    </main>
  );
}
