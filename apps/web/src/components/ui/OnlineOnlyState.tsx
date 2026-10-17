import type { ReactNode } from 'react';
import { CloudOff } from 'lucide-react';
import { Link } from 'react-router';
import { buttonClasses } from './Button';
import { EmptyState } from './EmptyState';

interface OnlineOnlyStateProps {
  /** What needs the network, as the sentence subject ("Gia sư AI"); default "Tính năng này". */
  feature?: string;
  /** Replaces the default explanation. */
  description?: string;
  /** Replaces the default "Học ngoại tuyến" link. */
  action?: ReactNode;
}

/**
 * Shown instead of a screen whose work is done by the server (AI tutor, role-play, placement test, session planner,
 * exam start) while the device is offline: one clear message, a way back to what does work offline, never a spinner
 * that waits for a request that cannot succeed.
 */
export function OnlineOnlyState({ feature = 'Tính năng này', description, action }: OnlineOnlyStateProps) {
  return (
    <div role="status">
      <EmptyState
        icon={CloudOff}
        title="Tính năng này cần mạng"
        description={description ?? `${feature} cần kết nối mạng. Bạn vẫn học bài đã tải và ôn thẻ ngoại tuyến được, mọi thứ sẽ tự đồng bộ khi có mạng.`}
        action={
          action ?? (
            <Link to="/app/hoc-tap" className={buttonClasses('accent')}>
              Tiếp tục học ngoại tuyến
            </Link>
          )
        }
      />
    </div>
  );
}
