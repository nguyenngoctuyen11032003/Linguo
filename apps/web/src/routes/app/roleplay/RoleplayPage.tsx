import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Compass, MessagesSquare } from 'lucide-react';
import { Link } from 'react-router';
import { LANGUAGES, LEVEL_INFO, type LevelCode, type RoleplayScenario } from '@linguo/shared';
import { AiNoticeDialog, AiQuotaChip, AiReportDialog, useQuotaGate } from '@/components/ai';
import { buttonClasses } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/features/auth/AuthProvider';
import { useAiNotice } from '@/features/ai-tutor/useAiNotice';
import { useAiQuota } from '@/features/ai-tutor/useAiQuota';
import { useAiTutor } from '@/features/ai-tutor/useAiTutor';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { buildSummaryRequest } from '@/features/roleplay/session';
import { useRoleplaySession } from '@/features/roleplay/useRoleplaySession';
import { useTts } from '@/features/speaking/useTts';
import { ChatView, ROLEPLAY_AI_NOTE } from './ChatView';
import { RecapView } from './RecapView';
import { ScenarioPicker } from './ScenarioPicker';

function LoadingPage() {
  return (
    <div role="status" className="space-y-3">
      <span className="sr-only">Đang tải lộ trình…</span>
      <Skeleton className="block h-24 w-full rounded-3xl" />
      <Skeleton className="block h-40 w-full rounded-3xl" />
    </div>
  );
}

/** /app/dong-vai: practise a conversation with an AI partner in a fixed scenario (spec 8.2 #6, 6.9). */
export function RoleplayPage() {
  const paths = useLearningPaths();
  const { user } = useAuth();
  const notice = useAiNotice();
  const quota = useAiQuota();
  const gate = useQuotaGate(quota.quota);
  const path = paths.current;
  const language = path && (path.language === 'en' || path.language === 'ko') ? path.language : null;
  const api = useRoleplaySession(user?.id ?? null, language, path?.currentLevel ?? null);
  const summary = useAiTutor();
  const tts = useTts(api.session?.language ?? language ?? 'en');
  const [recap, setRecap] = useState(false);
  const [picked, setPicked] = useState<RoleplayScenario | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const reportTriggerRef = useRef<HTMLElement | null>(null);
  const summaryRequest = useRef<ReturnType<typeof buildSummaryRequest> | null>(null);
  // Back on the picker after leaving a chat or its recap: focus the page title instead of leaving it on <body>.
  const titleRef = useRef<HTMLHeadingElement>(null);
  const focusPicker = useRef(false);

  const pick = (scenario: RoleplayScenario) => {
    if (notice.acknowledged) api.start(scenario);
    else setPicked(scenario);
  };
  const accept = async () => {
    if (!(await notice.ack())) return false;
    const scenario = picked;
    setPicked(null);
    if (scenario) api.start(scenario);
    return true;
  };

  const openReport = (id: string, trigger: HTMLButtonElement) => {
    reportTriggerRef.current = trigger;
    setReport(id);
  };

  const finish = () => {
    if (!api.session) return;
    api.forgetSaved();
    setRecap(true);
    if (!gate.exhausted) {
      summaryRequest.current = buildSummaryRequest(api.session, Date.now());
      void summary.run(summaryRequest.current);
    }
  };
  const retrySummary = () => {
    if (summaryRequest.current) void summary.run(summaryRequest.current);
  };
  const leave = () => {
    api.discard();
    summary.reset();
    summaryRequest.current = null;
    setRecap(false);
    focusPicker.current = true;
  };
  useEffect(() => {
    if (!focusPicker.current || api.session) return;
    focusPicker.current = false;
    titleRef.current?.focus();
  });

  let content: ReactNode;
  if (!path) {
    if (paths.status === 'loading') content = <LoadingPage />;
    else if (paths.status === 'error') content = <ErrorState title="Không tải được lộ trình" onRetry={paths.reload} />;
    else {
      content = (
        <EmptyState
          icon={Compass}
          title="Bạn chưa có lộ trình"
          description="Đóng vai hội thoại theo ngôn ngữ và trình độ trong lộ trình của bạn. Hãy tạo lộ trình trước nhé."
          action={
            <Link to="/app/bat-dau" className={buttonClasses('accent')}>
              Tạo lộ trình
            </Link>
          }
        />
      );
    }
  } else if (api.session && api.scenario) {
    content = recap ? (
      <RecapView session={api.session} scenario={api.scenario} summary={summary} quota={quota.quota} gate={gate} onRetry={retrySummary} onNew={leave} onReport={openReport} />
    ) : (
      <ChatView
        api={api}
        session={api.session}
        scenario={api.scenario}
        quota={quota.quota}
        gate={gate}
        tts={tts}
        onFinish={finish}
        onLeave={leave}
        onReport={openReport}
      />
    );
  } else if (language) {
    content = (
      <ScenarioPicker
        language={language}
        level={path.currentLevel}
        onPick={pick}
        disabled={notice.status === 'loading' || gate.exhausted}
        gateHint={gate.exhausted ? gate.hint : null}
      />
    );
  } else {
    content = (
      <EmptyState
        icon={MessagesSquare}
        title="Chưa có tình huống cho ngôn ngữ này"
        description="Đóng vai hội thoại hiện có cho tiếng Anh, tiếng Hàn và tiếng Nhật."
      />
    );
  }

  const levelLabel = path ? (LEVEL_INFO[path.currentLevel as LevelCode]?.label ?? path.currentLevel) : null;
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 ref={titleRef} tabIndex={-1} className="page-title focus:outline-none">
            Đóng vai với AI
          </h1>
          <AiQuotaChip quota={quota.quota} />
        </div>
        {path && !api.session && (
          <p className="text-[15px] text-muted">
            {LANGUAGES[path.language].nameVi} · trình độ {levelLabel}. Luyện hội thoại ngắn (tối đa 12 lượt) với một đối tác AI, không áp lực. {ROLEPLAY_AI_NOTE}
          </p>
        )}
      </header>
      {content}
      <AiNoticeDialog context="roleplay" open={picked !== null} onAccept={accept} onClose={() => setPicked(null)} />
      <AiReportDialog open={report !== null} onClose={() => setReport(null)} usageId={report} triggerRef={reportTriggerRef} />
    </div>
  );
}
