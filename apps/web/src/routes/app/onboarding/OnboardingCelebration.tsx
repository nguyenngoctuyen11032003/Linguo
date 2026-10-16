import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import { useNavigate } from 'react-router';
import { LEVEL_INFO, type LevelCode } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { playSound } from '@/lib/sound';
import { CountUp } from '@/components/ui/CountUp';
import { RouteLine } from '@/components/ui/RouteLine';
import { estimateRange } from '@/features/learning-paths/format-estimate';
import type { LearningPath } from '@/features/learning-paths/service';

/** Short enough to finish while the learner reads the heading. */
const COUNT_MS = 1200;

export function OnboardingCelebration({ path, onDone }: { path: LearningPath; onDone: () => void }) {
  const navigate = useNavigate();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const from = LEVEL_INFO[path.currentLevel as LevelCode].label;
  const to = LEVEL_INFO[path.targetLevel as LevelCode].label;
  const estimate = estimateRange(path.estimate.weeksMin, path.estimate.weeksMax);
  const unsure = path.startPoint === 'unsure';
  const beginner = path.startPoint === 'new';
  // Placement test (spec 4 §5). Replaces the wizard entry so "back" from the test does not reopen an empty wizard.
  const startTest = (foundation: boolean) =>
    navigate(`/app/kiem-tra/${path.id}${foundation ? '?che-do=nen-tang' : ''}`, { replace: true });

  useEffect(() => {
    headingRef.current?.focus();
    playSound('achievement');
  }, []);

  return (
    <main id="main" className="mx-auto flex min-h-hero w-full max-w-md flex-col items-center justify-center gap-6 px-safe py-10 text-center">
      <span aria-hidden="true" className="grid size-16 place-items-center rounded-full bg-success text-bg shadow-[0_5px_0_color-mix(in_srgb,var(--success)_55%,black)] ring-8 ring-success/15">
        <Check className="size-8" strokeWidth={3.5} />
      </span>
      <RouteLine
        title={`Lộ trình từ ${from} tới ${to}`}
        viewBox="0 0 240 70"
        className="max-w-xs text-text"
        tracks={[
          {
            id: 'done',
            color: '#4CA2D1',
            d: 'M20 48 C80 0 150 80 220 22',
            stops: [
              { x: 20, y: 48, label: from, labelPosition: 'bottom', anchor: 'start' },
              { x: 220, y: 22, label: to, labelPosition: 'top', anchor: 'end' },
            ],
          },
        ]}
      />
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-[clamp(44px,14vw,64px)] font-extrabold uppercase leading-[1.12] tracking-[-0.005em] focus:outline-none"
      >
        Lộ trình đã sẵn sàng!
      </h1>
      {/* The estimate counts up (spec onboarding step 6); CountUp shows the final numbers at once under reduced motion. */}
      <p
        data-testid="celebration-estimate"
        className="card relative isolate flex w-full flex-col items-center overflow-hidden px-5 pb-5 pt-4 text-[15px] font-semibold text-muted before:absolute before:-top-16 before:left-1/2 before:-z-10 before:size-48 before:-translate-x-1/2 before:rounded-full before:bg-radial before:from-accent/20 before:to-transparent before:to-70%"
      >
        <span className="eyebrow">Ước lượng khoảng </span>
        <span className="stat-num mt-3 pr-1 text-[clamp(64px,22vw,96px)] text-text">
          <CountUp to={estimate.min} durationMs={COUNT_MS} />
          {estimate.min !== estimate.max && (
            <>
              –<CountUp to={estimate.max} durationMs={COUNT_MS} />
            </>
          )}
        </span>{' '}
        <span className="mt-2">
          {estimate.unit} để đạt <span className="font-bold text-accent-text">{to}</span>.
        </span>
      </p>
      {unsure ? (
        <>
          <p className="text-[15px] text-muted">
            {from} chỉ là trình độ tạm tính. Bài kiểm tra ước lượng từ vựng, ngữ pháp và đọc hiểu của bạn; bạn quyết định có cập nhật lộ trình hay
            không.
          </p>
          <div className="flex w-full flex-col gap-3">
            <Button variant="accent" size="lg" block onClick={() => startTest(false)}>
              Làm bài kiểm tra (~12 phút)
            </Button>
            <Button variant="ghost" size="lg" block onClick={onDone}>
              Để sau
            </Button>
          </div>
        </>
      ) : (
        <div className="flex w-full flex-col items-center gap-4">
          <Button variant="accent" size="lg" onClick={onDone}>
            Vào trang chủ
          </Button>
          {beginner && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-[15px] text-muted">Đã biết chút ít? Một bài kiểm tra ngắn cho biết bạn có nên bắt đầu cao hơn không. Không bắt buộc.</p>
              <Button variant="ghost" onClick={() => startTest(true)}>
                Kiểm tra nền tảng (2–3 phút)
              </Button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
