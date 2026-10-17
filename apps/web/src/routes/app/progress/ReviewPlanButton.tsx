import { useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { ProgressDashboard } from '@linguo/shared';
import { AiExplainSheet } from '@/components/ai';
import { Button } from '@/components/ui/Button';
import { buildPlanReviewRequest } from './review-plan';

interface Props {
  dashboard: Pick<ProgressDashboard, 'mistakes' | 'exercise_types'>;
  learner: { language: 'en' | 'ko' | 'ja' | 'de'; level: string };
}

/** "Lập kế hoạch ôn bằng AI" next to the mistakes list; hidden when there is nothing to plan. */
export function ReviewPlanButton({ dashboard, learner }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const request = buildPlanReviewRequest(dashboard, learner);
  if (!request) return null;
  // Without AI the list above still links every mistake back to its lesson.
  const fallback = { title: 'Ôn lại từng bài', body: 'Chọn một lỗi trong danh sách bên trên và mở lại bài học của nó để ôn ngay.' };
  return (
    <>
      <Button
        ref={trigger}
        variant="ghost"
        className="max-[379px]:px-4 max-[379px]:text-sm"
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
      >
        <Sparkles aria-hidden className="size-4" />
        Lập kế hoạch ôn bằng AI
      </Button>
      {/* Mounted on first use: the sheet's notice and quota hooks make no request until the learner asks. */}
      {mounted && <AiExplainSheet open={open} onClose={() => setOpen(false)} request={request} fallback={fallback} triggerRef={trigger} />}
    </>
  );
}
