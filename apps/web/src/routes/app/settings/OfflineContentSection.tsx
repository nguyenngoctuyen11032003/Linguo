import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { SolidCard } from '@/components/ui/SolidCard';
import { useOfflineContent } from '@/features/offline/useOfflineContent';
import { isPersisted, offlineMediaSize, requestPersistence, storageEstimate } from '@/features/offline-media';
import { cn } from '@/lib/cn';
import { formatBytes } from '../learn/offline-format';
import { SECTION_HEADING_CLASS, SECTION_SCROLL_MARGIN } from './section-state';

function SwitchRow({ id, label, description, checked, onToggle }: { id: string; label: string; description: string; checked: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p id={`${id}-label`} className="font-medium">
          {label}
        </p>
        <p id={`${id}-desc`} className="text-sm text-muted">
          {description}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-desc`}
        onClick={onToggle}
        className="inline-flex min-h-11 min-w-14 shrink-0 items-center justify-center rounded-full"
      >
        <span aria-hidden="true" className={cn('relative inline-flex h-8 w-14 items-center rounded-full border border-border transition-colors', checked ? 'bg-primary' : 'bg-text/15')}>
          <span className={cn('inline-block size-6 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-7' : 'translate-x-1')} />
        </span>
      </button>
    </div>
  );
}

interface Device {
  mediaBytes: number | null;
  estimate: { usage: number; quota: number } | null;
  persisted: boolean | null;
}

/**
 * "Dữ liệu ngoại tuyến": what the device keeps so lessons work with no network (lesson text and answer keys in
 * IndexedDB, downloaded media in the offline media cache), whether the browser promised not to evict it, the automatic
 * download switches, and removal.
 */
export function OfflineContentSection() {
  const { ready, persistent, downloaded, usageBytes, autoDownload, setAutoDownload, wifiOnly, setWifiOnly, wifiOnlySupported, removeAll, job } = useOfflineContent();
  const [device, setDevice] = useState<Device>({ mediaBytes: null, estimate: null, persisted: null });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const jobKey = job ? `${job.id}:${job.running}` : '';

  useEffect(() => {
    let live = true;
    void Promise.all([offlineMediaSize().catch(() => null), storageEstimate().catch(() => null), isPersisted().catch(() => null)]).then(([mediaBytes, estimate, persisted]) => {
      if (live) setDevice({ mediaBytes, estimate, persisted });
    });
    return () => {
      live = false;
    };
  }, [downloaded, jobKey]);

  const lessons = downloaded.size;
  const onRemoveAll = async () => {
    setBusy(true);
    try {
      await removeAll();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <section id="du-lieu-ngoai-tuyen" aria-labelledby="offline-heading" className={SECTION_SCROLL_MARGIN}>
      <SolidCard className="space-y-5">
        <h2 id="offline-heading" tabIndex={-1} className={SECTION_HEADING_CLASS}>
          Dữ liệu ngoại tuyến
        </h2>
        {!ready ? (
          <p className="text-sm text-muted">Đang đọc dữ liệu trên thiết bị…</p>
        ) : !persistent ? (
          <p role="status" className="text-sm text-muted">
            Trình duyệt này không cho lưu bài học trên thiết bị, nên chưa học ngoại tuyến được. Hãy thử mở Linguo bằng trình duyệt khác hoặc cài ứng dụng.
          </p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-muted">Bài đã tải</dt>
                <dd className="font-semibold tabular-nums">{lessons} bài</dd>
              </div>
              <div>
                <dt className="text-muted">Dung lượng bài học</dt>
                <dd className="font-semibold tabular-nums">{formatBytes(usageBytes)}</dd>
              </div>
              <div>
                <dt className="text-muted">Âm thanh đã tải</dt>
                <dd className="font-semibold tabular-nums">{device.mediaBytes === null ? '—' : formatBytes(device.mediaBytes)}</dd>
              </div>
              <div>
                <dt className="text-muted">Bộ nhớ của trình duyệt</dt>
                <dd className="font-semibold tabular-nums">{device.estimate ? `${formatBytes(device.estimate.usage)} / ${formatBytes(device.estimate.quota)}` : '—'}</dd>
              </div>
            </dl>

            {device.persisted === false && (
              <div className="space-y-2 rounded-2xl bg-warn/15 px-4 py-3 text-sm">
                <p>Trình duyệt có thể tự xoá bài đã tải khi máy thiếu bộ nhớ. Cho phép lưu bền để giữ chúng.</p>
                <Button
                  variant="ghost"
                  onClick={() =>
                    void requestPersistence().then(async () => {
                      const persisted = await isPersisted().catch(() => null);
                      setDevice((d) => ({ ...d, persisted }));
                    })
                  }
                >
                  Giữ dữ liệu bền
                </Button>
              </div>
            )}
            {device.persisted === true && <p className="text-sm text-success-text">Trình duyệt đã đồng ý giữ dữ liệu này, sẽ không tự xoá.</p>}

            <SwitchRow
              id="offline-auto"
              label="Tự tải bài sắp học"
              description="Khi có mạng và máy rảnh, tự tải bài hiện tại và 3 bài tiếp theo để học được khi mất mạng."
              checked={autoDownload}
              onToggle={() => setAutoDownload(!autoDownload)}
            />
            {wifiOnlySupported && (
              <SwitchRow
                id="offline-wifi"
                label="Chỉ tải tự động bằng Wi-Fi"
                description="Không tự tải khi đang dùng dữ liệu di động hoặc bật chế độ tiết kiệm dữ liệu."
                checked={wifiOnly}
                onToggle={() => setWifiOnly(!wifiOnly)}
              />
            )}

            {confirming ? (
              <div role="alert" className="space-y-3 rounded-2xl bg-warn/15 px-4 py-3">
                <p className="text-[15px]">
                  Xoá toàn bộ bài đã tải và âm thanh trên máy này? Tiến độ chưa đồng bộ không bị mất; bài đang dở giữ lại cho đến khi gửi xong.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button variant="danger" loading={busy} onClick={() => void onRemoveAll()}>
                    Xoá dữ liệu ngoại tuyến
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
                    Giữ lại
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="ghost" disabled={lessons === 0 && !device.mediaBytes} onClick={() => setConfirming(true)}>
                Xoá dữ liệu ngoại tuyến
              </Button>
            )}
          </>
        )}
      </SolidCard>
    </section>
  );
}
