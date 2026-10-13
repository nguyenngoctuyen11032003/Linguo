import type { EstimateResult } from '@linguo/shared';
import { FeasibilityBadge } from './FeasibilityBadge';
import { formatMinutes } from './schedule';

interface EstimateSummaryProps {
  estimate: EstimateResult;
  compact?: boolean;
}

export function EstimateSummary({ estimate, compact = false }: EstimateSummaryProps) {
  const { weeksMin, weeksMax, feasibility, assumptions } = estimate;
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-sm text-muted">Ước lượng</p>
        <p className="text-2xl font-bold tracking-[-0.02em]">
          Khoảng {weeksMin}–{weeksMax} tuần
        </p>
      </div>
      <FeasibilityBadge feasibility={feasibility} />
      {!compact && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Học {formatMinutes(assumptions.weeklyMinutes)} mỗi tuần</li>
          <li>Cần khoảng {assumptions.hoursNeeded} giờ học theo bảng tham chiếu</li>
          <li>Khoảng dao động từ ×0,8 đến ×1,3 so với trung bình</li>
          {!assumptions.referenceReviewed && <li>Số giờ tham chiếu chưa được kiểm duyệt, chỉ để tham khảo.</li>}
        </ul>
      )}
    </div>
  );
}
