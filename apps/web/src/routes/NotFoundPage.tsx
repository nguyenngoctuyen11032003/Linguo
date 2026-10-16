import { ArrowLeft, Compass } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { FeedbackScreen } from '@/components/feedback/FeedbackScreen';
import { buttonClasses } from '@/components/ui/Button';

export function NotFoundPage() {
  const navigate = useNavigate();
  // A deep link opened in a new tab has nowhere to go back to.
  const canGoBack = typeof window !== 'undefined' && window.history.length > 1;
  return (
    <main id="main" className="relative isolate flex min-h-hero flex-col justify-center overflow-x-clip px-safe py-10">
      <FeedbackScreen
        display="404"
        illustration="lost"
        tone="primary"
        eyebrowIcon={Compass}
        eyebrow="Lạc đường"
        title="Không tìm thấy trang"
        description="Đường dẫn có thể đã thay đổi hoặc không còn tồn tại. Đừng lo, lộ trình học của bạn vẫn ở nguyên chỗ cũ."
        actions={
          <>
            <Link to="/" className={buttonClasses('accent', 'lg', true)}>
              Về trang chủ
            </Link>
            {canGoBack && (
              <button type="button" onClick={() => void navigate(-1)} className={buttonClasses('ghost', 'lg', true)}>
                <ArrowLeft aria-hidden className="size-5" />
                Quay lại trang trước
              </button>
            )}
          </>
        }
      />
    </main>
  );
}
