import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { getSupabase } from '@/lib/supabase';
import { aiRpcErrorMessage } from './error-map';
import { ackAiNotice, fetchAiNoticeAck } from './notice';

export interface AiNoticeState {
  status: 'loading' | 'ready' | 'error';
  /** True once the user acknowledged the AI privacy notice. */
  acknowledged: boolean;
  ackAt: string | null;
  /** True while `ack()` is saving. */
  saving: boolean;
  /** Vietnamese message of the last load or ack failure. */
  error: string | null;
  /** Resolves true when the acknowledgement was saved. */
  ack: () => Promise<boolean>;
}

interface Loaded {
  userId: string | null;
  status: AiNoticeState['status'];
  ackAt: string | null;
  error: string | null;
}

export function useAiNotice(): AiNoticeState {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const client = getSupabase();
  const [loaded, setLoaded] = useState<Loaded>({ userId, status: 'loading', ackAt: null, error: null });
  const [saving, setSaving] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    if (!client) {
      setLoaded({ userId, status: 'error', ackAt: null, error: aiRpcErrorMessage(new Error('supabase_unavailable')) });
      return;
    }
    let active = true;
    setLoaded({ userId, status: 'loading', ackAt: null, error: null });
    fetchAiNoticeAck(client, userId)
      .then((ackAt) => {
        if (active) setLoaded({ userId, status: 'ready', ackAt, error: null });
      })
      .catch((error: unknown) => {
        if (active) setLoaded({ userId, status: 'error', ackAt: null, error: aiRpcErrorMessage(error) });
      });
    return () => {
      active = false;
    };
  }, [client, userId]);

  const ack = useCallback(async (): Promise<boolean> => {
    if (!userId) return false;
    if (!client) {
      setLoaded((prev) => ({ ...prev, error: aiRpcErrorMessage(new Error('supabase_unavailable')) }));
      return false;
    }
    setSaving(true);
    try {
      const ackAt = await ackAiNotice(client);
      if (mounted.current) setLoaded({ userId, status: 'ready', ackAt, error: null });
      return true;
    } catch (error) {
      if (mounted.current) setLoaded((prev) => ({ ...prev, error: aiRpcErrorMessage(error) }));
      return false;
    } finally {
      if (mounted.current) setSaving(false);
    }
  }, [client, userId]);

  const current = loaded.userId === userId ? loaded : { status: 'loading' as const, ackAt: null, error: null };
  return {
    status: current.status,
    acknowledged: current.ackAt !== null,
    ackAt: current.ackAt,
    saving,
    error: current.error,
    ack,
  };
}
