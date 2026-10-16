import { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { StudySession } from '@linguo/shared';
import { AiExplainSheet } from '@/components/ai';
import { Button } from '@/components/ui/Button';
import { getSessionRecap, type SessionMistake } from '@/features/session/service';
import { getSupabase } from '@/lib/supabase';
import { buildSessionSummaryRequest, sessionSummaryFallback } from './session-summary';

interface Props {
  session: StudySession;
  learner: { language: 'en' | 'ko' | 'ja'; level: string };
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
  const fallback = useMemo(() => sessionSummaryFallback(session), [session]);

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
