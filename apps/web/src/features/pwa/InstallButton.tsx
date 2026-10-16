import { useCallback, useRef, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { useModalDialog } from '@/lib/useModalDialog';
import { cn } from '@/lib/cn';
import { isIos, useInstallPrompt } from './useInstallPrompt';

/**
 * "Tải ứng dụng" for the marketing page. One tap installs when the browser offers a prompt (Chrome/Edge on
 * laptop and Android); otherwise opens short manual steps (iOS Share sheet, or the browser menu elsewhere).
 * Hidden once Linguo runs as an installed app.
 */
export function InstallButton({ className }: { className?: string }) {
  const { status, promptInstall } = useInstallPrompt();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useModalDialog(open, close, { triggerRef, containerRef: dialogRef });

  if (status === 'installed') return null;

  const onClick = async () => {
    if (status === 'available') {
      const outcome = await promptInstall();
      if (outcome === 'unavailable') setOpen(true);
      return;
    }
    setOpen(true);
  };

  const ios = status === 'ios' || isIos();

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={onClick}
        className={cn(
          'inline-flex min-h-11 items-center gap-2 rounded-full bg-white/10 px-4 text-[14px] font-semibold text-white ring-1 ring-white/15 ring-inset transition-[background-color,scale] hover:bg-white/15 active:scale-95',
          className,
        )}
      >
        <Download aria-hidden className="size-[18px]" />
        Tải ứng dụng
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-3 sm:items-center" onClick={close}>
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-dialog-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md space-y-4 rounded-3xl bg-[#10283c] p-6 text-white ring-1 ring-white/15 ring-inset"
          >
            <button
              type="button"
              aria-label="Đóng"
              onClick={close}
              className="absolute right-3 top-3 inline-flex size-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/15"
            >
              <X aria-hidden className="size-5" />
            </button>
            <h2 id="install-dialog-title" className="pr-10 font-display text-3xl font-extrabold uppercase leading-none">
              Cài Linguo như ứng dụng
            </h2>
            <p className="text-[15px] text-white/75">Mở nhanh từ màn hình chính hoặc màn hình nền, không cần gõ địa chỉ web.</p>
            {ios ? (
              <ol className="list-decimal space-y-2 pl-5 text-[15px]">
                <li>
                  Mở trang này bằng <strong>Safari</strong>, chạm nút <strong>Chia sẻ</strong>{' '}
                  <Share aria-hidden className="inline size-4 align-[-2px]" />.
                </li>
                <li>
                  Chọn <strong>Thêm vào màn hình chính</strong>.
                </li>
                <li>
                  Chạm <strong>Thêm</strong>.
                </li>
              </ol>
            ) : (
              <ol className="list-decimal space-y-2 pl-5 text-[15px]">
                <li>
                  <strong>Laptop (Chrome / Edge):</strong> bấm biểu tượng cài đặt{' '}
                  <Download aria-hidden className="inline size-4 align-[-2px]" /> bên phải thanh địa chỉ, hoặc menu ⋮ →{' '}
                  <strong>Cài đặt Linguo</strong>.
                </li>
                <li>
                  <strong>Android (Chrome):</strong> menu ⋮ → <strong>Thêm vào màn hình chính</strong> / <strong>Cài đặt ứng dụng</strong>.
                </li>
                <li>
                  <strong>Safari trên Mac:</strong> Tệp → <strong>Thêm vào Dock</strong>.
                </li>
              </ol>
            )}
          </div>
        </div>
      )}
    </>
  );
}
