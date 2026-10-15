import { useEffect, useRef, useState, type RefObject } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { AiModal } from './AiModal';

export type AiNoticeContext = 'tutor' | 'roleplay';

const COPY: Record<AiNoticeContext, { title: string; description: string; sent: string }> = {
  tutor: {
    title: 'Trước khi dùng Gia sư AI',
    description: 'Giải thích AI có thể chưa chính xác. Hãy đối chiếu với bài học khi thấy điều gì lạ.',
    sent: 'Câu hỏi của bạn',
  },
  roleplay: {
    title: 'Trước khi trò chuyện với Đối tác AI',
    description: 'Đối tác AI có thể nói sai hoặc chưa tự nhiên. Hãy đối chiếu với bài học khi thấy điều gì lạ.',
    sent: 'Tin nhắn của bạn',
  },
};

export interface AiNoticeDialogProps {
  open: boolean;
  /** Records the acknowledgement (e.g. `useAiNotice().ack`). The dialog shows an error when it resolves false or rejects. */
  onAccept: () => Promise<boolean | void> | boolean | void;
  onClose: () => void;
  triggerRef?: RefObject<HTMLElement | null>;
  /** Which AI the learner is about to use: the tutor (questions) or the role-play partner (messages). */
  context?: AiNoticeContext;
}

/** Privacy notice shown before the first AI request (PRD §8.6): free-tier Gemini data handling. */
export function AiNoticeDialog({ open, onAccept, onClose, triggerRef, context = 'tutor' }: AiNoticeDialogProps) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const titleRef = useRef<HTMLSpanElement>(null);
  const copy = COPY[context];

  useEffect(() => {
    if (!open) {
      setBusy(false);
      setFailed(false);
      return;
    }
    // Start reading at the title (not the privacy link half-way down); runs after the modal's own initial focus.
    titleRef.current?.focus({ preventScroll: true });
  }, [open]);

  const accept = async () => {
    setBusy(true);
    setFailed(false);
    try {
      if ((await onAccept()) === false) setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AiModal
      open={open}
      onClose={onClose}
      triggerRef={triggerRef}
      role="alertdialog"
      title={
        <span ref={titleRef} tabIndex={-1} className="inline-flex items-center gap-2 focus:outline-none">
          <ShieldAlert aria-hidden className="size-5 shrink-0 text-primary" />
          {copy.title}
        </span>
      }
      description={copy.description}
    >
      <ul className="list-disc space-y-2 pl-5 text-[15px] leading-relaxed">
        <li>
          {copy.sent} được gửi tới <strong>Google Gemini</strong> qua gói miễn phí (free tier).
        </li>
        <li>Theo chính sách của Google, dữ liệu gửi qua gói miễn phí có thể được dùng để cải thiện sản phẩm của Google và có thể được người đánh giá xem xét.</li>
        <li>
          <strong>Đừng nhập thông tin cá nhân</strong> (họ tên, email, số điện thoại, địa chỉ…) hay nội dung bí mật.
        </li>
        <li>Linguo không gửi tên, email hay lịch sử học của bạn cho AI.</li>
      </ul>
      <p className="mt-3 text-[15px]">
        Xem thêm tại{' '}
        <Link to="/quyen-rieng-tu" className="font-semibold text-primary underline underline-offset-2">
          Chính sách quyền riêng tư
        </Link>
        .
      </p>
      {failed && (
        <p role="alert" className="mt-3 text-sm text-error-text">
          Chưa lưu được xác nhận. Vui lòng thử lại.
        </p>
      )}
      {/* Kept in view while the notice scrolls on short screens, so the answer is always one tap away. The negative
          inset and margin cancel the scroll area's bottom padding so nothing scrolls by underneath the buttons. */}
      <div
        data-testid="ai-notice-actions"
        className="sticky -bottom-[max(1.25rem,env(safe-area-inset-bottom,0px))] -mb-[max(1.25rem,env(safe-area-inset-bottom,0px))] mt-4 grid gap-2 border-t border-border bg-surface-solid pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-3"
      >
        <Button variant="accent" size="lg" block loading={busy} onClick={() => void accept()}>
          Tôi đã hiểu, tiếp tục
        </Button>
        <Button variant="ghost" size="lg" block onClick={onClose}>
          Để sau
        </Button>
      </div>
    </AiModal>
  );
}
