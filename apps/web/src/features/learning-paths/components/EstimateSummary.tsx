import type { EstimateResult } from '@linguo/shared';
import { formatEstimate, nudgeMinutesPerDay } from '../format-estimate';
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
  const nudge = nudgeMinutesPerDay(estimate);
  const exactWeeks = weeksMin === weeksMax ? `${weeksMin}` : `${weeksMin}–${weeksMax}`;
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-sm text-muted">Ước lượng</p>
        <p className="text-2xl font-bold tracking-[-0.02em]">{formatEstimate(weeksMin, weeksMax, { capitalize: true })}</p>
      </div>
      {nudge !== null && (
        <p data-testid="estimate-nudge" className="text-[15px]">
          Tăng lên {nudge} phút/ngày để rút ngắn đáng kể.
        </p>
      )}
      <FeasibilityBadge feasibility={feasibility} />
      {!compact && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          {weeksMax > 12 && <li>{`Tương đương ${exactWeeks} tuần học`}</li>}
          <li>Học {formatMinutes(assumptions.weeklyMinutes)} mỗi tuần</li>
          <li>{`Cần khoảng ${formatNumber(assumptions.hoursNeeded)} giờ học theo bảng tham chiếu`}</li>
          <li>{`Khoảng dao động từ ×${formatNumber(multiplierMin)} đến ×${formatNumber(multiplierMax)} so với trung bình`}</li>
          {!assumptions.referenceReviewed && <li>Số giờ tham chiếu chưa được kiểm duyệt, chỉ để tham khảo.</li>}
        </ul>
      )}
    </div>
  );
}
