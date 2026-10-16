import { AlertTriangle, RefreshCw, RotateCw, Sparkles, WifiOff } from 'lucide-react';
import { useEffect } from 'react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { FeedbackScreen } from '@/components/feedback/FeedbackScreen';
import { Button, buttonClasses } from '@/components/ui/Button';
import { errorCode, isChunkLoadError, reportRenderError } from '@/lib/error-reporting';
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

const reload = () => window.location.reload();

/**
 * errorElement of every route (spec 7 §2): a crash in one screen shows this inside its parent layout instead of a
 * blank app. Production never shows the stack or the raw message, only a message-free error code.
 * A lazy chunk that fails to load means a stale deploy (the old chunk names are gone) or no network: it gets its own
 * screen whose primary action reloads the page.
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
  const code = errorCode(error);
  const chunk = isChunkLoadError(error);
  const offline = chunk && typeof navigator !== 'undefined' && navigator.onLine === false;

  const home = (
    <Link to="/" reloadDocument className={buttonClasses('ghost', 'lg', true)}>
      Về trang chủ
    </Link>
  );
  const footnote = (
    <>
      Mã lỗi: <code className="font-mono text-text/80">{code}</code>
    </>
  );

  let screen;
  if (chunk && !offline) {
    screen = (
      <FeedbackScreen
        role="alert"
        display="Mới!"
        illustration="update"
        tone="accent"
        eyebrowIcon={Sparkles}
        eyebrow="Vừa cập nhật"
        title="Đã có phiên bản mới"
        description="Linguo vừa được nâng cấp trong lúc bạn đang học. Tải lại trang để dùng bản mới nhất — tiến độ của bạn vẫn được giữ nguyên."
        actions={
          <>
            <Button variant="accent" size="lg" block onClick={reload}>
              <RefreshCw aria-hidden className="size-5" />
              Tải lại trang
            </Button>
            {home}
          </>
        }
        footnote={footnote}
      />
    );
  } else {
    screen = (
      <FeedbackScreen
        role="alert"
        display="Ối!"
        illustration="broken"
        tone="error"
        eyebrowIcon={offline ? WifiOff : AlertTriangle}
        eyebrow={offline ? 'Mất kết nối' : 'Đứt đường giữa chừng'}
        title="Có lỗi xảy ra"
        description={
          offline
            ? 'Màn hình này chưa tải xong vì mất mạng. Kiểm tra kết nối rồi thử lại nhé — dữ liệu đã lưu không bị mất.'
            : 'Màn hình này gặp sự cố. Dữ liệu đã lưu không bị mất; hãy thử lại hoặc về trang chủ.'
        }
        actions={
          <>
            <Button variant="primary" size="lg" block onClick={reload}>
              <RotateCw aria-hidden className="size-5" />
              Thử lại
            </Button>
            {home}
          </>
        }
        footnote={footnote}
      >
        {detail && (
          <pre data-testid="route-error-detail" className="mt-4 max-h-40 w-full overflow-auto rounded-xl bg-text/5 p-3 text-left text-xs">
            {detail}
          </pre>
        )}
      </FeedbackScreen>
    );
  }

  const body = <div className="flex min-h-[60dvh] items-center justify-center overflow-x-clip px-safe py-10">{screen}</div>;

  return inMain ? (
    body
  ) : (
    <main id="main" className="min-h-hero">
      {body}
    </main>
  );
}
