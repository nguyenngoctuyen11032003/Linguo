import { CheckCircle2, CloudDownload, CloudOff, Trash2 } from 'lucide-react';
import type { PathLesson } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { useOfflineContent, type DownloadJob } from '@/features/offline/useOfflineContent';
import { cn } from '@/lib/cn';
import { useOnline } from '@/lib/useOnline';

/** "12,4 MB" / "850 KB": sizes are estimates, so no decimals below 1 MB. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const OUTCOME_TEXT: Record<NonNullable<DownloadJob['outcome']>, string> = {
  done: 'Đã tải xong. Bạn có thể học các bài này khi không có mạng.',
  partial: 'Một số bài chưa tải được. Thử lại khi có mạng.',
  offline: 'Mất kết nối khi đang tải. Phần đã tải vẫn dùng được; hãy thử lại khi có mạng.',
  quota: 'Bộ nhớ thiết bị đã đầy. Hãy xoá bớt bài đã tải hoặc giải phóng dung lượng rồi thử lại.',
  rate_limited: 'Bạn đã tải quá nhiều lần trong giờ qua. Hãy thử lại sau ít phút.',
  cancelled: 'Đã dừng tải. Phần đã tải vẫn dùng được.',
  error: 'Chưa tải được. Vui lòng thử lại.',
};

/** Banner shown when the lesson list on screen is the saved copy (offline, or the server could not be reached). */
export function SavedListNotice({ fromCache }: { fromCache: boolean }) {
  const online = useOnline();
  if (!fromCache) return null;
  return (
    <p role="status" className="card flex items-start gap-3 p-4 text-[14px]">
      <CloudOff aria-hidden className="mt-0.5 size-5 shrink-0 text-muted" />
      <span>
        {online ? 'Chưa cập nhật được danh sách bài từ máy chủ, đang hiển thị bản đã lưu.' : 'Bạn đang ngoại tuyến — đang hiển thị danh sách bài đã lưu trên máy. Các bài đã tải về vẫn học được.'}
      </span>
    </p>
  );
}

/** Small "Đã tải" / "Cần mạng" tag of a lesson row. Nothing while the download state is unknown. */
export function LessonOfflineTag({ lesson }: { lesson: PathLesson }) {
  const online = useOnline();
  const { ready, isDownloaded } = useOfflineContent();
  if (!ready) return null;
  if (isDownloaded(lesson.lesson_id)) {
    return (
      <span className="inline-flex items-center gap-1 text-success-text">
        <CheckCircle2 aria-hidden className="size-3.5" />
        Đã tải về máy
      </span>
    );
  }
  if (!online) {
    return (
      <span className="inline-flex items-center gap-1 text-muted">
        <CloudOff aria-hidden className="size-3.5" />
        Cần mạng
      </span>
    );
  }
  return null;
}

/** The lesson cannot be opened now: offline, never downloaded (a lesson already in progress is still tried: its copy may be saved). */
export function useLessonUnavailable(lesson: PathLesson): boolean {
  const online = useOnline();
  const { ready, isDownloaded } = useOfflineContent();
  return ready && !online && !isDownloaded(lesson.lesson_id) && lesson.run_status !== 'in_progress';
}

interface DownloadControlProps {
  scope: string;
  kind: 'unit' | 'program' | 'path';
  lessons: readonly PathLesson[];
  /** Visible label, e.g. "Tải cả lộ trình". */
  label: string;
  compact?: boolean;
}

/**
 * "Tải về học offline" for a set of lessons: size quote, progress with a stop button, the result, and removal once
 * everything is on the device. Hidden when the device cannot keep downloads (no IndexedDB) or there is nothing to get.
 */
export function DownloadControl({ scope, kind, lessons, label, compact = false }: DownloadControlProps) {
  const online = useOnline();
  const offline = useOfflineContent();
  const { ready, persistent, isDownloaded, estimateBytes, job, download, cancel, remove } = offline;
  if (!ready || !persistent || lessons.length === 0) return null;

  const missing = lessons.filter((l) => !isDownloaded(l.lesson_id));
  const mine = job?.scope === scope ? job : null;
  const busy = job?.running === true;
  const running = mine?.running === true;
  const allDone = missing.length === 0;

  return (
    <div className={cn('space-y-2', compact ? '' : 'card p-4')}>
      <div className="flex flex-wrap items-center gap-3">
        {!compact && (
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary">
            <CloudDownload className="size-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          {!compact && <p className="font-bold leading-snug">Học không cần mạng</p>}
          <p className="text-[13px] text-muted">
            {allDone
              ? `${lessons.length} bài đã có trên máy, học được khi ngoại tuyến.`
              : `${missing.length}/${lessons.length} bài chưa tải · khoảng ${formatBytes(estimateBytes(missing.length))}`}
          </p>
        </div>
        {running ? (
          <Button variant="ghost" onClick={cancel}>
            Dừng
          </Button>
        ) : allDone ? (
          <Button
            variant="ghost"
            aria-label={`Xoá ${lessons.length} bài đã tải`}
            onClick={() => void remove(lessons.map((l) => l.lesson_id))}
          >
            <Trash2 aria-hidden className="size-4" />
            Xoá khỏi máy
          </Button>
        ) : (
          <Button
            variant={compact ? 'ghost' : 'primary'}
            disabled={!online || busy}
            hint={!online ? 'Cần mạng để tải' : undefined}
            onClick={() => void download({ kind, scope, lessonIds: missing.map((l) => l.lesson_id) })}
          >
            <CloudDownload aria-hidden className="size-4" />
            {label}
          </Button>
        )}
      </div>
      {running && mine && (
        <div role="status" className="space-y-1">
          <div
            role="progressbar"
            aria-label="Tiến độ tải bài học"
            aria-valuemin={0}
            aria-valuemax={mine.total}
            aria-valuenow={mine.done}
            className="h-1.5 overflow-hidden rounded-full bg-text/10"
          >
            <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${mine.total ? (mine.done / mine.total) * 100 : 0}%` }} />
          </div>
          <p className="text-[13px] text-muted">
            Đang tải {mine.done}/{mine.total} bài…
          </p>
        </div>
      )}
      {mine && !mine.running && mine.outcome && (
        <p role="status" className={cn('text-[13px]', mine.outcome === 'done' ? 'text-success-text' : 'text-muted')}>
          {OUTCOME_TEXT[mine.outcome]}
        </p>
      )}
    </div>
  );
}
