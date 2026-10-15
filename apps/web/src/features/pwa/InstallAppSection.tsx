import { useEffect, useRef, useState } from 'react';
import { Download, Share } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SolidCard } from '@/components/ui/SolidCard';
import { useInstallPrompt } from './useInstallPrompt';

/**
 * Settings → "Cài app" (spec 10 §4). Shows the install button when the browser offers a prompt, the
 * Share → Add to Home Screen steps on iOS, and nothing when installed or unsupported. Never pops up by itself.
 */
export function InstallAppSection() {
  const { status, promptInstall } = useInstallPrompt();
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // The button is gone once the prompt is used: keep keyboard focus in the section, on its heading.
    if (dismissed) headingRef.current?.focus();
  }, [dismissed]);

  // A dismissed prompt cannot be shown again (status turns 'unsupported'): stay visible with a short note instead
  // of vanishing under the learner's finger.
  const showDismissed = dismissed && status !== 'available';
  if (status === 'installed' || (status === 'unsupported' && !showDismissed)) return null;

  const install = async () => {
    setBusy(true);
    try {
      const outcome = await promptInstall();
      if (outcome !== 'accepted') setDismissed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="cai-app" aria-labelledby="install-app-heading" className="scroll-mt-[calc(4.5rem+env(safe-area-inset-top,0px))]">
      <SolidCard className="space-y-3">
        <h2
          ref={headingRef}
          id="install-app-heading"
          tabIndex={-1}
          className="rounded-lg text-lg font-bold focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/45"
        >
          Cài ứng dụng
        </h2>
        <p className="text-[15px]">
          Cài Linguo lên màn hình chính để mở nhanh như một ứng dụng, học được cả khi mạng chập chờn và nhận nhắc học trên thiết
          bị.
        </p>
        <p role="status" className="text-[15px] text-muted empty:hidden">
          {showDismissed ? 'Đã bỏ qua lần này. Bạn có thể cài Linguo sau từ menu của trình duyệt.' : ''}
        </p>
        {status === 'unsupported' ? null : status === 'available' ? (
          <Button variant="primary" onClick={install} loading={busy}>
            <Download aria-hidden className="size-5" />
            Cài Linguo lên máy
          </Button>
        ) : (
          <ol className="list-decimal space-y-1.5 pl-5 text-[15px]" aria-label="Cách cài trên iPhone và iPad">
            <li>
              Mở Linguo bằng Safari, chạm nút <strong>Chia sẻ</strong>{' '}
              <Share aria-hidden className="inline size-4 align-[-2px]" />.
            </li>
            <li>
              Chọn <strong>Thêm vào màn hình chính</strong>.
            </li>
            <li>
              Chạm <strong>Thêm</strong>, rồi mở Linguo từ biểu tượng mới.
            </li>
          </ol>
        )}
      </SolidCard>
    </section>
  );
}
