import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { GOAL_LABELS, LANGUAGE_CODES, LANGUAGES, LEVEL_INFO, type LevelCode, type PathStatus } from '@linguo/shared';
import { Button, buttonClasses } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { SolidCard } from '@/components/ui/SolidCard';
import { useToast } from '@/components/ui/Toast';
import { learningPathErrorMessage } from '@/features/learning-paths/error-map';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { setPathStatus, type LearningPath } from '@/features/learning-paths/service';
import { requireSupabase } from '@/lib/supabase';
import { PathPlanEditor } from './PathPlanEditor';

const STATUS_DONE: Partial<Record<PathStatus, string>> = {
  paused: 'Đã tạm dừng lộ trình.',
  active: 'Đã tiếp tục lộ trình.',
  archived: 'Đã lưu trữ lộ trình. Lịch sử học vẫn được giữ.',
};

type FocusTarget = 'edit' | 'toggle' | 'archive' | 'confirm';

function PathItem({ path, onArchived }: { path: LearningPath; onArchived: () => void }) {
  const { upsertPath, reload } = useLearningPaths();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [busy, setBusy] = useState<PathStatus | null>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const archiveRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<FocusTarget | null>(null);
  const from = LEVEL_INFO[path.currentLevel as LevelCode].label;
  const to = LEVEL_INFO[path.targetLevel as LevelCode].label;
  const itemBusy = busy !== null || editorSaving;
  const completed = path.status === 'completed';

  // Focus can only move to a control once it is enabled/mounted, so requests are served after render.
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    const el = { edit: editRef, toggle: toggleRef, archive: archiveRef, confirm: confirmRef }[target].current;
    if (el && !el.disabled) {
      pendingFocus.current = null;
      el.focus();
    }
  });

  function openConfirm() {
    pendingFocus.current = 'confirm';
    setConfirmArchive(true);
  }

  function closeConfirm() {
    pendingFocus.current = 'archive';
    setConfirmArchive(false);
  }

  async function changeStatus(status: PathStatus) {
    setBusy(status);
    try {
      const updated = await setPathStatus(requireSupabase(), path.id, status);
      upsertPath(updated);
      if (status === 'archived') {
        reload();
        onArchived();
      } else {
        pendingFocus.current = 'toggle';
      }
      const done = STATUS_DONE[status];
      if (done) toast.show({ tone: 'success', message: done });
      setConfirmArchive(false);
    } catch (error) {
      toast.show({ tone: 'error', message: learningPathErrorMessage(error) });
      if (status === 'archived') pendingFocus.current = 'archive';
      else pendingFocus.current = 'toggle';
      setConfirmArchive(false);
    } finally {
      setBusy(null);
    }
  }

  function closeEditor() {
    pendingFocus.current = 'edit';
    setEditorSaving(false);
    setEditing(false);
  }

  return (
    <li className="space-y-3 rounded-2xl border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">
            {LANGUAGES[path.language].nameVi} · {GOAL_LABELS[path.goalType]}
          </h3>
          <p className="text-sm text-muted">
            {from} → {to} · khoảng {path.estimate.weeksMin}–{path.estimate.weeksMax} tuần
          </p>
        </div>
        {path.status === 'paused' && <span className="shrink-0 rounded-full bg-warn/15 px-3 py-1 text-xs font-semibold">Tạm dừng</span>}
        {completed && <span className="shrink-0 rounded-full bg-success/15 px-3 py-1 text-xs font-semibold">Đã hoàn thành</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        {!completed && (
          <Button ref={editRef} variant="ghost" aria-expanded={editing} disabled={itemBusy} onClick={() => setEditing((v) => !v)}>
            Sửa kế hoạch
          </Button>
        )}
        {!completed && (
          <Button
            ref={toggleRef}
            variant="ghost"
            loading={busy === 'paused' || busy === 'active'}
            disabled={itemBusy}
            onClick={() => void changeStatus(path.status === 'paused' ? 'active' : 'paused')}
          >
            {path.status === 'paused' ? 'Tiếp tục' : 'Tạm dừng'}
          </Button>
        )}
        <Button ref={archiveRef} variant="danger" aria-expanded={confirmArchive} disabled={itemBusy || confirmArchive} onClick={openConfirm}>
          Lưu trữ
        </Button>
      </div>
      {confirmArchive && (
        <div role="group" aria-label="Xác nhận lưu trữ" className="space-y-3 rounded-2xl bg-error/5 p-3">
          <p className="text-[15px]">
            Lưu trữ lộ trình này? Lịch sử học vẫn được giữ và bạn có thể tạo lộ trình mới cho ngôn ngữ này.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button ref={confirmRef} variant="danger" loading={busy === 'archived'} disabled={itemBusy} onClick={() => void changeStatus('archived')}>
              Xác nhận lưu trữ
            </Button>
            <Button variant="ghost" disabled={itemBusy} onClick={closeConfirm}>
              Huỷ
            </Button>
          </div>
        </div>
      )}
      {editing && !completed && (
        <PathPlanEditor
          path={path}
          onCancel={closeEditor}
          onSavingChange={setEditorSaving}
          onSaved={(updated) => {
            upsertPath(updated);
            closeEditor();
            toast.show({ tone: 'success', message: 'Đã lưu kế hoạch. Ước lượng đã được tính lại.' });
          }}
        />
      )}
    </li>
  );
}

export function LearningPathsSection() {
  const { status, paths, reload } = useLearningPaths();
  const location = useLocation();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const missing = LANGUAGE_CODES.filter((code) => LANGUAGES[code].available && !paths.some((p) => p.language === code));

  // Deep link from Home ("Sửa kế hoạch"): land on the section, not just near it.
  useEffect(() => {
    if (location.hash === '#lo-trinh') headingRef.current?.focus();
  }, [location.hash]);

  return (
    <section id="lo-trinh" aria-labelledby="paths-heading" className="scroll-mt-[calc(4.5rem+env(safe-area-inset-top,0px))]">
      <SolidCard className="space-y-4">
        <h2
          id="paths-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-bold focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/45"
        >
          Lộ trình học
        </h2>
        {status === 'loading' && paths.length === 0 && <Skeleton className="block h-24 w-full rounded-2xl" />}
        {status === 'error' && <ErrorState title="Không tải được lộ trình" headingLevel="h3" onRetry={reload} />}
        {status !== 'error' && paths.length === 0 && status === 'ready' && <p className="text-[15px] text-muted">Bạn chưa có lộ trình nào.</p>}
        {status !== 'error' && paths.length > 0 && (
          <ul className="space-y-3">
            {paths.map((path) => (
              <PathItem key={path.id} path={path} onArchived={() => headingRef.current?.focus()} />
            ))}
          </ul>
        )}
        {status === 'ready' &&
          missing.map((code) => (
            <Link key={code} to={`/app/bat-dau?lang=${code}`} className={buttonClasses('ghost')}>
              + Thêm {LANGUAGES[code].nameVi}
            </Link>
          ))}
      </SolidCard>
    </section>
  );
}
