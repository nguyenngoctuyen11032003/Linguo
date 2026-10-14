import { useRef, useState } from 'react';
import { Leaf, PauseCircle, Scissors } from 'lucide-react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { nearestSessionLength, SESSION_LENGTHS, type SessionActivity, type SessionLength, type StudySession } from '@linguo/shared';
import { Button, buttonClasses } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { SolidCard } from '@/components/ui/SolidCard';
import { useToast } from '@/components/ui/Toast';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { sessionErrorMessage } from '@/features/session/error-map';
import { readLengthParam, SHORT_SESSION_MINUTES } from '@/features/session/lengths';
import { finishSession, firstPending, reorderSession, sessionLink, sessionProgress, updateSessionItem } from '@/features/session/service';
import { usePlanner } from '@/features/session/usePlanner';
import { useTodaySession } from '@/features/session/useTodaySession';
import { requireSupabase } from '@/lib/supabase';
import { ActivityList, type MoveDirection } from './ActivityList';
import { CompletionView } from './CompletionView';
import { LengthChips } from './LengthChips';
import { RecapView } from './RecapView';

const TITLE = 'Phiên học hôm nay';

const isOpen = (session: StudySession | null): session is StudySession =>
  !!session && (session.status === 'planned' || session.status === 'in_progress');

const asLength = (minutes: number): SessionLength | null => SESSION_LENGTHS.find((l) => l === minutes) ?? null;

function minutesLabel(seconds: number): string {
  return `${Math.floor(seconds / 60)} phút`;
}

/** /app/phien-hoc: plan, reorder, shorten and run today's study session (spec 6 §4). The server keeps the state. */
export function SessionPage() {
  // Switching path (AppBar language pill) starts afresh: no planner error/paused flag, recap or chosen length
  // carried over from the other path, and no late answer for its session.
  const { currentId } = useLearningPaths();
  return <PathSession key={currentId ?? ''} />;
}

function PathSession() {
  const paths = useLearningPaths();
  const pathId = paths.currentId;
  const today = useTodaySession();
  const planner = usePlanner();
  const toast = useToast();
  const navigate = useNavigate();
  const { session, setSession } = today;

  const [searchParams] = useSearchParams();
  // ?phut=10 from the home card preselects that length (and skips the completion screen of an earlier session).
  const [lengthParam] = useState(() => readLengthParam(searchParams));
  const [chosen, setChosen] = useState<SessionLength | null>(lengthParam);
  const [recapItemId, setRecapItemId] = useState<string | null>(null);
  const [planningAgain, setPlanningAgain] = useState(lengthParam !== null);
  const [saving, setSaving] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  /**
   * Every session change (reorder, skip, recap, finish) goes to the server one after the other, so the answer to
   * the last request already includes all earlier ones. Only that newest answer is put on screen: an older one
   * would undo a change made after it was sent (e.g. bring back an activity skipped during a reorder).
   */
  const requests = useRef<Promise<unknown>>(Promise.resolve());
  const latestRequest = useRef(0);

  if (paths.status === 'ready' && paths.paths.length === 0) return <Navigate to="/app/bat-dau" replace />;

  const learner = paths.current ? { language: paths.current.language, level: paths.current.currentLevel } : null;
  const open = isOpen(session);

  function enqueue(job: () => Promise<StudySession>) {
    const ticket = ++latestRequest.current;
    const run = requests.current.then(job);
    requests.current = run.catch(() => undefined);
    return { run, isLatest: () => latestRequest.current === ticket };
  }

  async function mutate(job: () => Promise<StudySession>, success?: (saved: StudySession) => void) {
    if (saving) return;
    setSaving(true);
    try {
      const request = enqueue(job);
      const saved = await request.run;
      if (request.isLatest()) setSession(saved);
      success?.(saved);
    } catch (error) {
      toast.show({ tone: 'error', message: sessionErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  function move(current: StudySession, index: number, direction: MoveDirection) {
    const activities = [...current.plan.activities];
    const target = direction === 'up' ? index - 1 : index + 1;
    const moved = activities[index];
    const other = activities[target];
    if (!moved || !other) return;
    activities[index] = other;
    activities[target] = moved;
    setSession({ ...current, plan: { ...current.plan, activities } });
    setAnnouncement(`Đã chuyển “${moved.title_vi}” ${direction === 'up' ? 'lên' : 'xuống'} vị trí ${target + 1}/${activities.length}.`);

    const order = activities.map((a) => a.id);
    const request = enqueue(() => reorderSession(requireSupabase(), current.id, order));
    request.run
      .then((saved) => {
        if (request.isLatest()) setSession(saved);
      })
      .catch((error: unknown) => {
        toast.show({ tone: 'error', message: sessionErrorMessage(error) });
        today.reload();
      });
  }

  function skip(current: StudySession, activity: SessionActivity) {
    void mutate(
      () => updateSessionItem(requireSupabase(), current.id, activity.id, 'skipped', 0),
      () => setAnnouncement(`Đã bỏ qua “${activity.title_vi}”.`),
    );
  }

  function start(current: StudySession) {
    const next = firstPending(current);
    if (!next) return;
    if (next.kind === 'recap') {
      setRecapItemId(next.id);
      return;
    }
    const link = sessionLink(current, next);
    if (link) navigate(link);
    else toast.show({ tone: 'error', message: 'Không mở được hoạt động này. Bạn có thể bỏ qua nó.' });
  }

  async function create(minutes: SessionLength, replace: boolean) {
    if (!pathId) return;
    const saved = await planner.create(pathId, minutes, replace);
    if (saved) {
      setSession(saved);
      setChosen(null);
      setPlanningAgain(false);
    }
  }

  async function shorten(current: StudySession) {
    if (!pathId) return;
    const saved = await planner.shorten(pathId, current, SHORT_SESSION_MINUTES);
    if (saved) {
      setSession(saved);
      setChosen(null);
      setAnnouncement(`Đã rút gọn phiên còn ${saved.plan.minutes} phút.`);
    }
  }

  let body;
  if (today.status === 'loading' || (paths.status === 'loading' && !pathId)) {
    body = (
      <div role="status" className="space-y-3">
        <span className="sr-only">Đang tải phiên học…</span>
        <Skeleton className="block h-40 w-full rounded-3xl" />
        <Skeleton className="block h-28 w-full rounded-3xl" />
      </div>
    );
  } else if (today.status === 'error') {
    body = <ErrorState title="Không tải được phiên học" description={today.error ?? undefined} onRetry={today.reload} />;
  } else if (open && recapItemId) {
    const itemId = recapItemId;
    body = (
      <RecapView
        sessionId={session.id}
        learner={learner}
        saving={saving}
        onBack={() => setRecapItemId(null)}
        onDone={(seconds) =>
          void mutate(
            () => updateSessionItem(requireSupabase(), session.id, itemId, 'done', seconds),
            () => setRecapItemId(null),
          )
        }
      />
    );
  } else if (session?.status === 'completed' && !planningAgain) {
    body = (
      <CompletionView
        session={session}
        onPlanAgain={() => {
          setChosen(SHORT_SESSION_MINUTES);
          setPlanningAgain(true);
        }}
      />
    );
  } else if (open) {
    const { finished, total } = sessionProgress(session);
    const pending = session.plan.activities.filter((a) => a.status === 'pending');
    const pendingMinutes = pending.reduce((sum, a) => sum + a.minutes, 0);
    const planned = session.status === 'planned';
    const current = asLength(session.minutes_planned);
    const selected = chosen ?? current ?? nearestSessionLength(session.minutes_planned);
    body = (
      <div className="space-y-5">
        <SolidCard className="space-y-4">
          <section aria-labelledby="session-plan-title" className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm text-muted">Phiên {session.plan.minutes} phút</p>
              <h2 id="session-plan-title" className="text-xl font-bold tracking-[-0.02em] break-words">
                {session.plan.focus_vi}
              </h2>
              {session.plan.backlog_mode && (
                <p className="inline-flex items-start gap-1.5 text-[15px] text-muted">
                  <Leaf aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                  Chế độ nhẹ nhàng: ôn lại phần quan trọng trước, bài mới để sau.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">
                Tiến độ: {finished}/{total} hoạt động
              </p>
              <div
                role="progressbar"
                aria-label="Tiến độ phiên học"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={finished}
                aria-valuetext={`${finished}/${total} hoạt động`}
                className="h-2 overflow-hidden rounded-full bg-text/10"
              >
                <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${total ? (finished / total) * 100 : 0}%` }} />
              </div>
            </div>
            {pending.length > 0 ? (
              <Button variant="accent" size="lg" block onClick={() => start(session)}>
                {planned ? 'Bắt đầu phiên học' : 'Tiếp tục'}
              </Button>
            ) : (
              <Button variant="accent" size="lg" block loading={saving} onClick={() => void mutate(() => finishSession(requireSupabase(), session.id, 'completed'))}>
                Kết thúc phiên
              </Button>
            )}
            {pendingMinutes > SHORT_SESSION_MINUTES && (
              <Button variant="ghost" block loading={planner.busy} onClick={() => void shorten(session)}>
                <Scissors aria-hidden className="size-4" />
                Rút gọn còn {SHORT_SESSION_MINUTES} phút
              </Button>
            )}
            {planner.error && (
              <p role="alert" className="text-[15px] text-error">
                {planner.error}
              </p>
            )}
          </section>
        </SolidCard>

        {planned && (
          <SolidCard className="space-y-3">
            <LengthChips value={selected} onChange={setChosen} disabled={planner.busy} />
            {chosen !== null && chosen !== session.minutes_planned && (
              <Button variant="primary" block loading={planner.busy} onClick={() => void create(chosen, true)}>
                Lập lại kế hoạch {chosen} phút
              </Button>
            )}
          </SolidCard>
        )}

        <section aria-labelledby="session-activities-title" className="space-y-3">
          <h2 id="session-activities-title" className="text-lg font-bold">
            Các hoạt động
          </h2>
          <ActivityList
            activities={session.plan.activities}
            busy={saving}
            onMove={(index, direction) => move(session, index, direction)}
            onSkip={(activity) => skip(session, activity)}
          />
        </section>
      </div>
    );
  } else if (paths.current?.status === 'paused' || planner.paused) {
    body = (
      <EmptyState
        icon={PauseCircle}
        title="Lộ trình đang tạm dừng"
        description="Bật lại lộ trình ở trang chủ để Linguo lập phiên học mới cho bạn."
        action={
          <Link to="/app" className={buttonClasses('accent')}>
            Về trang chủ
          </Link>
        }
      />
    );
  } else {
    const goal = today.dailyGoalMinutes;
    const selected = chosen ?? nearestSessionLength(goal);
    body = (
      <SolidCard className="space-y-4">
        <section aria-labelledby="session-new-title" className="space-y-4">
          <div className="space-y-1">
            <h2 id="session-new-title" className="text-xl font-bold tracking-[-0.02em]">
              {planningAgain ? 'Thêm một phiên nữa?' : 'Lập kế hoạch hôm nay'}
            </h2>
            {goal > 0 ? (
              <p className="text-[15px] text-muted">
                Mục tiêu hôm nay: {goal} phút · Đã học {minutesLabel(today.studiedSecondsToday)}
              </p>
            ) : (
              <p className="text-[15px] text-muted">Chọn thời lượng, Linguo sẽ gợi ý nên học gì trước và vì sao.</p>
            )}
          </div>
          <LengthChips value={selected} onChange={setChosen} disabled={planner.busy} />
          <Button variant="accent" size="lg" block loading={planner.busy} onClick={() => void create(selected, false)}>
            Lập kế hoạch {selected} phút
          </Button>
          {planner.error && (
            <p role="alert" className="text-[15px] text-error">
              {planner.error}
            </p>
          )}
        </section>
      </SolidCard>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">{TITLE}</h1>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {body}
    </div>
  );
}
