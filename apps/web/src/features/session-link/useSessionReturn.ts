import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { getSupabase } from '@/lib/supabase';
import { elapsedSeconds, readSessionParams, SESSION_PAGE_PATH, type SessionLink } from './params';
import { reportSessionItem } from './service';

export interface SessionReturn {
  /** The session link from the URL; null means the page is not part of a session. */
  link: SessionLink | null;
  /** 'saved' once update_session_item(done) succeeded. */
  status: 'idle' | 'saving' | 'saved' | 'error';
  /** Report the activity done with the seconds since the page opened. Runs once; later calls reuse it. */
  reportDone: () => Promise<boolean>;
  /** Make sure the activity is reported (retrying a failed report once), then go to the session page. */
  returnToSession: () => Promise<void>;
}

/**
 * Lesson / review side of spec 6 §4: with ?phien=&muc= in the URL, report the activity done (seconds measured from
 * page open) and lead back to /app/phien-hoc. Without the params every call is a no-op.
 */
export function useSessionReturn(): SessionReturn {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const search = searchParams.toString();
  const link = useMemo(() => readSessionParams(new URLSearchParams(search)), [search]);
  const [openedAt] = useState(() => Date.now());
  const [status, setStatus] = useState<SessionReturn['status']>('idle');
  const inFlight = useRef<Promise<boolean> | null>(null);
  const saved = useRef(false);

  const reportDone = useCallback((): Promise<boolean> => {
    if (!link) return Promise.resolve(false);
    if (saved.current) return Promise.resolve(true);
    if (inFlight.current) return inFlight.current;
    const client = getSupabase();
    if (!client) {
      setStatus('error');
      return Promise.resolve(false);
    }
    setStatus('saving');
    const seconds = elapsedSeconds(openedAt, Date.now());
    const request = reportSessionItem(client, { sessionId: link.sessionId, itemId: link.itemId, status: 'done', seconds })
      .then(() => {
        saved.current = true;
        setStatus('saved');
        return true;
      })
      .catch(() => {
        setStatus('error');
        return false;
      })
      .finally(() => {
        inFlight.current = null;
      });
    inFlight.current = request;
    return request;
  }, [link, openedAt]);

  const returnToSession = useCallback(async () => {
    // The session page re-reads its state; a report that still fails leaves the item open there to tick by hand.
    await reportDone();
    navigate(SESSION_PAGE_PATH);
  }, [reportDone, navigate]);

  return { link, status, reportDone, returnToSession };
}
