import { Mic } from 'lucide-react';
import { Link } from 'react-router';
import { buttonClasses } from '@/components/ui/Button';
import { SolidCard } from '@/components/ui/SolidCard';

/** Home shortcut to /app/luyen-noi (spec 6.9); static, so it needs no data. */
export function SpeakingCard() {
  return (
    <SolidCard>
      <section aria-labelledby="speaking-card-title" className="flex flex-wrap items-center gap-4">
        <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
          <Mic aria-hidden className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="speaking-card-title" className="text-lg font-bold tracking-[-0.02em]">
            Luyện nói
          </h2>
          <p className="text-sm text-muted">Nhắc lại câu, trả lời mở và đóng vai. Giọng của bạn không bị lưu lại.</p>
        </div>
        <Link to="/app/luyen-noi" className={buttonClasses('ghost', 'md')}>
          Luyện nói
        </Link>
      </section>
    </SolidCard>
  );
}
