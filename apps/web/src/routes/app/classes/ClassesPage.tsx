import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Users } from 'lucide-react';
import { useNavigate } from 'react-router';
import { DEFAULT_TIMEZONE, TEACHER_LIMITS as L, type LearnerAssignment, type LearnerClass } from '@linguo/shared';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { SolidCard } from '@/components/ui/SolidCard';
import { useToast } from '@/components/ui/Toast';
import { assignmentLink, joinedMessage } from '@/features/classes/labels';
import { useLearnerClasses, type LearnerClassesApi } from '@/features/classes/useLearnerClasses';
import { useLearningPaths, type LearningPathsContextValue } from '@/features/learning-paths/LearningPathsProvider';
import { pathForLanguage } from '@/features/learning-paths/path-for-language';
import type { LearningPath } from '@/features/learning-paths/service';
import { useProfile } from '@/features/profile/ProfileProvider';
import { cn } from '@/lib/cn';
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
  const navigate = useNavigate();
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

  /**
   * Lessons, exams and reviews all run on the current path, so an assignment of a class in another language first
   * switches to the learner's own path in that language (the card says so). Without such a path the link is followed
   * as it is and the destination explains.
   */
  const openAssignment = (klass: LearnerClass, assignment: LearnerAssignment, event: MouseEvent<HTMLAnchorElement>) => {
    const current = paths.current?.language ?? null;
    if (current === null || current === klass.language_code) return;
    const target = pathForLanguage(paths.paths, klass.language_code);
    if (!target) return;
    // A plain click only: new-tab and download gestures keep the browser's behaviour.
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void switchAndGo(paths, target, assignmentLink(assignment));
  };
  async function switchAndGo(source: LearningPathsContextValue, target: LearningPath, to: string) {
    try {
      await source.setCurrent(target.id);
      navigate(to);
    } catch {
      toast.show({ tone: 'error', message: 'Chưa chuyển được lộ trình. Kiểm tra mạng và thử lại nhé.' });
    }
  }

  return (
    <div className="space-y-6 lg:space-y-8">
      <header className="page-header reveal">
        <div className="min-w-0">
          <h1 ref={headingRef} tabIndex={-1} className="page-title-lg focus:outline-none">
            Lớp học
          </h1>
          <p>Tham gia lớp bằng mã giáo viên gửi để nhận bài được giao. Bạn vẫn học trên lộ trình của mình như bình thường.</p>
        </div>
      </header>

      {!online && (
        <p className="rounded-2xl bg-warn/10 px-4 py-3 text-[15px] ring-1 ring-warn/40 ring-inset">
          Bạn đang ngoại tuyến. Danh sách lớp có thể chưa mới nhất; tham gia hoặc rời lớp cần có mạng. Trang sẽ tự tải lại khi có mạng.
        </p>
      )}

      <div className="reveal-stagger grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-x-8 xl:grid-cols-[minmax(0,1fr)_26rem]">
      <SolidCard className="p-4 sm:p-5 lg:col-start-2 lg:p-6">
        <section aria-labelledby="join-class-title" className="space-y-3">
          <h2 id="join-class-title" className="text-xl font-extrabold tracking-[-0.02em]">
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

      {/* A learner already in a class sees the assignments first on phones; the join form follows. */}
      <div className={cn('min-w-0 lg:col-start-1 lg:row-span-2 lg:row-start-1', api.classes.length > 0 && 'max-lg:order-first')}>
      <ClassList
        api={api}
        timeZone={timeZone}
        currentLanguage={paths.current?.language ?? null}
        pathFor={(language) => pathForLanguage(paths.paths, language)}
        onOpen={openAssignment}
        online={online}
        onLeave={(klass, trigger) => {
          leaveTrigger.current = trigger;
          setLeaving(klass);
        }}
      />

      </div>

      <div className="lg:col-start-2">
        <PrivacyNote />
      </div>
      </div>

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
  pathFor: (language: string) => LearningPath | null;
  onOpen: (klass: LearnerClass, assignment: LearnerAssignment, event: MouseEvent<HTMLAnchorElement>) => void;
  online: boolean;
  onLeave: (klass: LearnerClass, trigger: HTMLButtonElement) => void;
}

function ClassList({ api, timeZone, currentLanguage, pathFor, onOpen, online, onLeave }: ClassListProps) {
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
        description="Khi giáo viên gửi mã lớp hoặc đường dẫn mời, hãy nhập mã vào ô Mã lớp. Bài được giao sẽ hiện ngay tại đây."
      />
    );
  }
  return (
    <div className="space-y-4">
      {api.status === 'error' && (
        <p role="alert" className="rounded-2xl bg-error/10 px-4 py-3 text-[15px] text-error-text ring-1 ring-error/40 ring-inset">
          {api.error}{' '}
          <button type="button" onClick={api.reload} className="min-h-11 font-semibold underline">
            Thử lại
          </button>
        </p>
      )}
      <ul className="reveal-stagger space-y-4 lg:space-y-5">
        {api.classes.map((klass) => (
          <li key={klass.id} className="min-w-0">
            <ClassCard
              klass={klass}
              assignments={api.assignments.filter((a) => a.class_id === klass.id)}
              timeZone={timeZone}
              currentLanguage={currentLanguage}
              classPath={pathFor(klass.language_code)}
              onOpen={(assignment, event) => onOpen(klass, assignment, event)}
              leaveDisabled={!online}
              onLeave={(trigger) => onLeave(klass, trigger)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
