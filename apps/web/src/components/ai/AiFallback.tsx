import { useContext } from 'react';
import { CloudOff } from 'lucide-react';
import type { AiError } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { aiErrorMessage } from '@/features/ai-tutor/error-map';
import { ProfileContext } from '@/features/profile/ProfileProvider';
import { MarkdownLite } from './MarkdownLite';

export interface AiFallbackText {
  title: string;
  body: string;
}

export interface AiFallbackProps {
  state: 'quota' | 'unavailable' | 'error';
  error: AiError | null;
  /** Today's quota from `useAiQuota` when the error carries none (shows the reset time). */
  quota?: AiError['quota'];
  /** Curated (non-AI) explanation shown instead. */
  fallback?: AiFallbackText;
  onRetry?: () => void;
}

const CODE = { quota: 'quota_exceeded', unavailable: 'ai_unavailable', error: 'invalid_output' } as const;

/** Non-AI fallback: why AI is unavailable, when to retry, and the curated explanation when there is one. */
export function AiFallback({ state, error, quota, fallback, onRetry }: AiFallbackProps) {
  const timeZone = useContext(ProfileContext)?.profile?.timezone;
  const base: AiError = error ?? { error: CODE[state], message: '', retry_after_sec: null, quota: null };
  const message = aiErrorMessage(base.quota || !quota ? base : { ...base, quota }, { timeZone });

  return (
    <div className="space-y-4">
      <div role="alert" className="flex items-start gap-3 rounded-2xl border border-border px-4 py-3">
        <CloudOff aria-hidden className="mt-0.5 size-5 shrink-0 text-muted" />
        <div className="min-w-0 space-y-1">
          <p className="font-semibold">Tạm thời không khả dụng</p>
          <p className="text-[15px] text-muted">{message}</p>
        </div>
      </div>
      {onRetry && state !== 'quota' && (
        <Button variant="ghost" onClick={onRetry}>
          Thử lại
        </Button>
      )}
      {fallback ? (
        <section aria-label="Lời giải thích soạn sẵn" className="space-y-2 rounded-2xl bg-text/5 px-4 py-3 text-[15px] leading-relaxed">
          <p className="text-sm font-semibold text-muted">Lời giải thích soạn sẵn</p>
          <h3 className="font-semibold">{fallback.title}</h3>
          <MarkdownLite text={fallback.body} />
        </section>
      ) : (
        <p className="text-[15px] text-muted">Bài học, đáp án và lịch ôn vẫn hoạt động bình thường khi không có AI.</p>
      )}
    </div>
  );
}
