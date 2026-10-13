import type { EstimateResult } from '@linguo/shared';
import { FeasibilityBadge } from './FeasibilityBadge';
import { formatMinutes } from './schedule';

const formatNumber = (n: number) => n.toLocaleString('vi-VN');

interface EstimateSummaryProps {
  estimate: EstimateResult;
  compact?: boolean;
}

export function EstimateSummary({ estimate, compact = false }: EstimateSummaryProps) {
  const { weeksMin, weeksMax, feasibility, assumptions } = estimate;
  const [multiplierMin, multiplierMax] = assumptions.multiplierRange;
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-sm text-muted">Ước lượng</p>
        <p className="text-2xl font-bold tracking-[-0.02em]">
          {weeksMin === weeksMax ? `Khoảng ${weeksMin} tuần` : `Khoảng ${weeksMin}–${weeksMax} tuần`}
        </p>
      </div>
      <FeasibilityBadge feasibility={feasibility} />
      {!compact && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Học {formatMinutes(assumptions.weeklyMinutes)} mỗi tuần</li>
          <li>{`Cần khoảng ${formatNumber(assumptions.hoursNeeded)} giờ học theo bảng tham chiếu`}</li>
          <li>{`Khoảng dao động từ ×${formatNumber(multiplierMin)} đến ×${formatNumber(multiplierMax)} so với trung bình`}</li>
          {!assumptions.referenceReviewed && <li>Số giờ tham chiếu chưa được kiểm duyệt, chỉ để tham khảo.</li>}
        </ul>
      )}
    </div>
  );
}
