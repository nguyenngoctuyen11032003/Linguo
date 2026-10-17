import type { PathLesson } from '@linguo/shared';
import { useOfflineContent } from '@/features/offline/useOfflineContent';
import { useOnline } from '@/lib/useOnline';

/** "12,4 MB" / "850 KB": sizes are estimates, so no decimals below 1 MB. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** The lesson cannot be opened now: offline, never downloaded (a lesson already in progress is still tried: its copy may be saved). */
export function useLessonUnavailable(lesson: PathLesson): boolean {
  const online = useOnline();
  const { ready, isDownloaded } = useOfflineContent();
  return ready && !online && !isDownloaded(lesson.lesson_id) && lesson.run_status !== 'in_progress';
}

