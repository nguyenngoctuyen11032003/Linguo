import { useState } from 'react';
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

  if (status === 'installed' || status === 'unsupported') return null;

  const install = async () => {
    setBusy(true);
    try {
      await promptInstall();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="cai-app" aria-labelledby="install-app-heading" className="scroll-mt-[calc(4.5rem+env(safe-area-inset-top,0px))]">
      <SolidCard className="space-y-3">
        <h2 id="install-app-heading" className="text-lg font-bold">
          Cài ứng dụng
        </h2>
        <p className="text-[15px]">
          Cài Linguo lên màn hình chính để mở nhanh như một ứng dụng, học được cả khi mạng chập chờn và nhận nhắc học trên thiết
          bị.
        </p>
        {status === 'available' ? (
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
