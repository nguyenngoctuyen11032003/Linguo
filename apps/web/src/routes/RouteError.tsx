import { isRouteErrorResponse, useRouteError } from 'react-router';
import { ErrorState } from '@/components/ui/ErrorState';

export function RouteError() {
  const error = useRouteError();
  if (import.meta.env.DEV) console.error(error);
  const description = isRouteErrorResponse(error)
    ? `Lỗi ${error.status}. Vui lòng tải lại trang.`
    : 'Đã có lỗi không mong muốn. Tải lại trang để tiếp tục; dữ liệu đã lưu không bị mất.';
  return (
    <div className="flex min-h-hero items-center justify-center px-safe py-10">
      <ErrorState title="Đã có lỗi xảy ra" description={description} retryLabel="Tải lại trang" onRetry={() => window.location.reload()} />
    </div>
  );
}
