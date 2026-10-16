import { useEffect, useRef, useState } from 'react';
import { Users } from 'lucide-react';
import { DEFAULT_TIMEZONE, TEACHER_LIMITS as L, type LearnerClass } from '@linguo/shared';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { SolidCard } from '@/components/ui/SolidCard';
import { useToast } from '@/components/ui/Toast';
import { joinedMessage } from '@/features/classes/labels';
import { useLearnerClasses, type LearnerClassesApi } from '@/features/classes/useLearnerClasses';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { useProfile } from '@/features/profile/ProfileProvider';
import { resolveTimeZone } from '@/lib/dates';
import { useOnline } from '@/lib/useOnline';
import { ClassCard } from './ClassCard';
import { JoinClassForm } from './JoinClassForm';
import { LeaveClassDialog } from './LeaveClassDialog';
import { PrivacyNote } from './PrivacyNote';

/** /app/lop-hoc: join a class with a code, the learner's classes with their assignments, and leaving a class. */
export function ClassesPage() {
  const api = useLearnerClasses();
  const toast = useToast();
  const online = useOnline();
  const { profile } = useProfile();
  const paths = useLearningPaths();
  const timeZone = resolveTimeZone(profile?.timezone ?? DEFAULT_TIMEZONE);
  const [leaving, setLeaving] = useState<LearnerClass | null>(null);
  const leaveTrigger = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [focusHeading, setFocusHeading] = useState(false);
  const atLimit = api.classes.length >= L.maxClassesPerLearner;

  useEffect(() => {
    if (!focusHeading || leaving) return;
    // The "Rời lớp" button that opened the dialog is gone: keep keyboard focus on the page heading.
    // Wait a frame so the dialog's own focus restore (to the removed trigger) has run first.
    const frame = requestAnimationFrame(() => {
      headingRef.current?.focus();
      setFocusHeading(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusHeading, leaving]);

  return (
    <div className="space-y-6">
      <div>
        <h1 ref={headingRef} tabIndex={-1} className="page-title focus:outline-none">
          Lớp học
        </h1>
        <p className="mt-1 max-w-prose text-[15px] text-muted">
          Tham gia lớp bằng mã giáo viên gửi để nhận bài được giao. Bạn vẫn học trên lộ trình của mình như bình thường.
        </p>
      </div>

      {!online && (
        <p className="rounded-2xl border border-warn/60 bg-warn/10 px-4 py-3 text-[15px]">
          Bạn đang ngoại tuyến. Danh sách lớp có thể chưa mới nhất; tham gia hoặc rời lớp cần có mạng. Trang sẽ tự tải lại khi có mạng.
        </p>
      )}

      <SolidCard>
        <section aria-labelledby="join-class-title" className="space-y-3">
          <h2 id="join-class-title" className="text-lg font-bold tracking-[-0.02em]">
            Tham gia lớp mới
          </h2>
          {atLimit ? (
            <p className="text-[15px] text-muted">
              Bạn đang ở trong {L.maxClassesPerLearner} lớp, đó là mức tối đa. Hãy rời một lớp cũ trước khi tham gia lớp mới.
            </p>
          ) : (
            <JoinClassForm
              join={api.join}
              onJoined={(klass, alreadyMember) => toast.show({ tone: alreadyMember ? 'info' : 'success', message: joinedMessage(klass, alreadyMember) })}
            />
          )}
        </section>
      </SolidCard>

      <ClassList
        api={api}
        timeZone={timeZone}
        currentLanguage={paths.current?.language ?? null}
        online={online}
        onLeave={(klass, trigger) => {
          leaveTrigger.current = trigger;
          setLeaving(klass);
        }}
      />

      <PrivacyNote />

      <LeaveClassDialog
        className={leaving?.name ?? null}
        triggerRef={leaveTrigger}
        onClose={() => setLeaving(null)}
        onConfirm={async () => {
          if (!leaving) return;
          await api.leave(leaving.id);
          setFocusHeading(true);
          toast.show({ tone: 'success', message: `Đã rời lớp ${leaving.name}. Giáo viên không còn thấy tiến độ của bạn.` });
        }}
      />
    </div>
  );
}

interface ClassListProps {
  api: LearnerClassesApi;
  timeZone: string;
  currentLanguage: string | null;
  online: boolean;
  onLeave: (klass: LearnerClass, trigger: HTMLButtonElement) => void;
}

function ClassList({ api, timeZone, currentLanguage, online, onLeave }: ClassListProps) {
  if (api.status === 'loading') {
    return (
      <div role="status" className="space-y-3">
        <span className="sr-only">Đang tải lớp học…</span>
        <Skeleton className="block h-40 w-full rounded-3xl" />
      </div>
    );
  }
  if (api.status === 'error' && api.classes.length === 0) {
    return <ErrorState title="Không tải được lớp học" description={api.error ?? undefined} onRetry={api.reload} />;
  }
  if (api.classes.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Bạn chưa ở lớp nào"
        description="Khi giáo viên gửi mã lớp hoặc đường dẫn mời, hãy nhập mã ở trên. Bài được giao sẽ hiện ngay tại đây."
      />
    );
  }
  return (
    <div className="space-y-4">
      {api.status === 'error' && (
        <p role="alert" className="rounded-2xl border border-error/50 bg-error/10 px-4 py-3 text-[15px] text-error-text">
          {api.error}{' '}
          <button type="button" onClick={api.reload} className="min-h-11 font-semibold underline">
            Thử lại
          </button>
        </p>
      )}
      <ul className="space-y-4">
        {api.classes.map((klass) => (
          <li key={klass.id} className="min-w-0">
            <ClassCard
              klass={klass}
              assignments={api.assignments.filter((a) => a.class_id === klass.id)}
              timeZone={timeZone}
              currentLanguage={currentLanguage}
              leaveDisabled={!online}
              onLeave={(trigger) => onLeave(klass, trigger)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
