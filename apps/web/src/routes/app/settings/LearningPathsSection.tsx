import { useState } from 'react';
import { Link } from 'react-router';
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

function PathItem({ path }: { path: LearningPath }) {
  const { upsertPath, reload } = useLearningPaths();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [busy, setBusy] = useState<PathStatus | null>(null);
  const from = LEVEL_INFO[path.currentLevel as LevelCode].label;
  const to = LEVEL_INFO[path.targetLevel as LevelCode].label;

  async function changeStatus(status: PathStatus) {
    setBusy(status);
    try {
      const updated = await setPathStatus(requireSupabase(), path.id, status);
      upsertPath(updated);
      if (status === 'archived') reload();
      const done = STATUS_DONE[status];
      if (done) toast.show({ tone: 'success', message: done });
    } catch (error) {
      toast.show({ tone: 'error', message: learningPathErrorMessage(error) });
    } finally {
      setBusy(null);
      setConfirmArchive(false);
    }
  }

  return (
    <li className="space-y-3 rounded-2xl border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            {LANGUAGES[path.language].nameVi} · {GOAL_LABELS[path.goalType]}
          </p>
          <p className="text-sm text-muted">
            {from} → {to} · khoảng {path.estimate.weeksMin}–{path.estimate.weeksMax} tuần
          </p>
        </div>
        {path.status === 'paused' && <span className="shrink-0 rounded-full bg-warn/15 px-3 py-1 text-xs font-semibold">Tạm dừng</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
          Sửa kế hoạch
        </Button>
        {path.status === 'active' && (
          <Button variant="ghost" loading={busy === 'paused'} onClick={() => void changeStatus('paused')}>
            Tạm dừng
          </Button>
        )}
        {path.status === 'paused' && (
          <Button variant="ghost" loading={busy === 'active'} onClick={() => void changeStatus('active')}>
            Tiếp tục
          </Button>
        )}
        {!confirmArchive && (
          <Button variant="danger" onClick={() => setConfirmArchive(true)}>
            Lưu trữ
          </Button>
        )}
      </div>
      {confirmArchive && (
        <div role="group" aria-label="Xác nhận lưu trữ" className="space-y-3 rounded-2xl bg-error/5 p-3">
          <p className="text-[15px]">
            Lưu trữ lộ trình này? Lịch sử học vẫn được giữ và bạn có thể tạo lộ trình mới cho ngôn ngữ này.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" loading={busy === 'archived'} onClick={() => void changeStatus('archived')}>
              Xác nhận lưu trữ
            </Button>
            <Button variant="ghost" onClick={() => setConfirmArchive(false)}>
              Huỷ
            </Button>
          </div>
        </div>
      )}
      {editing && (
        <PathPlanEditor
          path={path}
          onCancel={() => setEditing(false)}
          onSaved={(updated) => {
            upsertPath(updated);
            setEditing(false);
            toast.show({ tone: 'success', message: 'Đã lưu kế hoạch. Ước lượng đã được tính lại.' });
          }}
        />
      )}
    </li>
  );
}

export function LearningPathsSection() {
  const { status, paths, reload } = useLearningPaths();
  const missing = LANGUAGE_CODES.filter((code) => LANGUAGES[code].available && !paths.some((p) => p.language === code));
  return (
    <section id="lo-trinh" aria-labelledby="paths-heading">
      <SolidCard className="space-y-4">
        <h2 id="paths-heading" className="text-lg font-bold">
          Lộ trình học
        </h2>
        {status === 'loading' && <Skeleton className="block h-24 w-full rounded-2xl" />}
        {status === 'error' && <ErrorState title="Không tải được lộ trình" onRetry={reload} />}
        {status === 'ready' && paths.length === 0 && <p className="text-[15px] text-muted">Bạn chưa có lộ trình nào.</p>}
        {status === 'ready' && paths.length > 0 && (
          <ul className="space-y-3">
            {paths.map((path) => (
              <PathItem key={path.id} path={path} />
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
