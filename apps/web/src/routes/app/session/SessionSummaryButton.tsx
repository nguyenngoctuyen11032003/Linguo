import { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { StudySession } from '@linguo/shared';
import { AiExplainSheet } from '@/components/ai';
import { Button } from '@/components/ui/Button';
import { getSessionRecap, type SessionMistake } from '@/features/session/service';
import { getSupabase } from '@/lib/supabase';
import { buildSessionSummaryRequest } from './session-summary';

interface Props {
  session: StudySession;
  learner: { language: 'en' | 'ko' | 'ja'; level: string };
}

/** What the learner still reads when the AI cannot write the recap: the same numbers, no AI. */
function fallbackText(session: StudySession): { title: string; body: string } {
  const { activities } = session.plan;
  const done = activities.filter((a) => a.status === 'done').length;
  const minutes = Math.round(activities.reduce((sum, a) => sum + a.seconds_spent, 0) / 60);
  return { title: 'Phiên học hôm nay', body: `Bạn đã hoàn thành ${done}/${activities.length} hoạt động, khoảng ${minutes} phút.` };
}

/** "Tóm tắt phiên bằng AI" on the completion screen: asks summarize_session with a compact, client-built summary. */
export function SessionSummaryButton({ session, learner }: Props) {
  const [open, setOpen] = useState(false);
  const [mistakes, setMistakes] = useState<readonly SessionMistake[] | null>(null);
  const [loading, setLoading] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // The recap only adds error tags; without it (offline, error) the summary is built from the activities.
  const request = useMemo(() => buildSessionSummaryRequest(session, learner, mistakes ?? []), [session, learner, mistakes]);
  const fallback = useMemo(() => fallbackText(session), [session]);

  async function openSheet() {
    if (loading) return;
    setLoading(true);
    let loaded: readonly SessionMistake[] = [];
    try {
      const client = getSupabase();
      if (client) loaded = await getSessionRecap(client, session.id);
    } catch {
      loaded = [];
    }
    if (!alive.current) return;
    setMistakes(loaded);
    setLoading(false);
    setOpen(true);
  }

  return (
    <>
      <Button ref={trigger} variant="ghost" block loading={loading} onClick={() => void openSheet()}>
        <Sparkles aria-hidden className="size-4" />
        Tóm tắt phiên bằng AI
      </Button>
      {mistakes && <AiExplainSheet open={open} onClose={() => setOpen(false)} request={request} fallback={fallback} triggerRef={trigger} />}
    </>
  );
}
