import { useContext, type ComponentType, type SVGProps } from 'react';
import { CircleAlert, CloudOff, Hourglass, LogIn, MoonStar, PencilLine } from 'lucide-react';
import type { AiError, AiErrorCode } from '@linguo/shared';
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

interface Presentation {
  title: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Retrying the same request can succeed (a real outage or a one-off bad answer). */
  retry: boolean;
  /** Extra reassurance inside the notice (the learner has done nothing wrong). */
  note?: string;
}

/** Title and icon follow what actually happened: only a real outage reads "Tạm thời không khả dụng". */
function presentationOf(code: AiErrorCode, dailyQuota: boolean): Presentation {
  switch (code) {
    case 'quota_exceeded':
      return dailyQuota
        ? {
            title: 'Đã hết lượt hôm nay',
            Icon: MoonStar,
            retry: false,
            note: 'Bài học, đáp án và lịch ôn vẫn dùng bình thường nhé. Lượt AI được làm mới mỗi ngày.',
          }
        : { title: 'Chậm lại một chút', Icon: Hourglass, retry: true };
    case 'bad_request':
      return { title: 'Câu hỏi chưa hợp lệ', Icon: PencilLine, retry: false };
    case 'unauthorized':
      return { title: 'Cần đăng nhập lại', Icon: LogIn, retry: false };
    case 'invalid_output':
      return { title: 'AI chưa trả lời được', Icon: CircleAlert, retry: true };
    case 'ai_unavailable':
    default:
      return { title: 'Tạm thời không khả dụng', Icon: CloudOff, retry: true };
  }
}

/** Non-AI fallback: why AI is unavailable, when to retry, and the curated explanation when there is one. */
export function AiFallback({ state, error, quota, fallback, onRetry }: AiFallbackProps) {
  const timeZone = useContext(ProfileContext)?.profile?.timezone;
  const base: AiError = error ?? { error: CODE[state], message: '', retry_after_sec: null, quota: null };
  // The per-IP burst limit carries a retry delay and no daily quota: the ambient quota must not turn it into "used up".
  const burst = base.error === 'quota_exceeded' && !base.quota && base.retry_after_sec !== null && base.retry_after_sec > 0;
  const withQuota = base.quota || !quota || burst ? base : { ...base, quota };
  const message = aiErrorMessage(withQuota, { timeZone });
  const dailyQuota = !burst;
  const { title, Icon, retry, note } = presentationOf(base.error, dailyQuota);
  const tutorWorks = base.error === 'ai_unavailable' || base.error === 'invalid_output';

  return (
    <div className="space-y-4">
      <div role="alert" className="flex items-start gap-3 rounded-2xl border border-border px-4 py-3">
        <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-muted" />
        <div className="min-w-0 space-y-1">
          <p className="font-semibold">{title}</p>
          <p className="text-[15px] text-muted">{message}</p>
          {note && <p className="text-[15px] text-muted">{note}</p>}
        </div>
      </div>
      {onRetry && retry && (
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
        tutorWorks && <p className="text-[15px] text-muted">Bài học, đáp án và lịch ôn vẫn hoạt động bình thường khi không có AI.</p>
      )}
    </div>
  );
}
