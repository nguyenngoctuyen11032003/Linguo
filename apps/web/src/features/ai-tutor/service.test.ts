import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { AppSupabaseClient } from '@/lib/supabase';
import { aiError, aiSuccess, explainRequest, quota } from './ai-fixtures';
import { AI_TUTOR_TIMEOUT_MS, invokeAiTutor } from './service';

function clientWith(invoke: (...args: unknown[]) => unknown) {
  const fn = vi.fn(invoke);
  return { client: { functions: { invoke: fn } } as unknown as AppSupabaseClient, invoke: fn };
}

function httpError(status: number, body: unknown): FunctionsHttpError {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new FunctionsHttpError(new Response(text, { status, headers: { 'Content-Type': 'application/json' } }));
}

describe('invokeAiTutor', () => {
  it('posts the validated request with defaults and a 50 s timeout', async () => {
    const { client, invoke } = clientWith(() => Promise.resolve({ data: aiSuccess(), error: null }));
    const result = await invokeAiTutor(client, explainRequest);
    expect(result).toEqual({ ok: true, data: aiSuccess() });
    expect(AI_TUTOR_TIMEOUT_MS).toBe(50_000);
    expect(invoke).toHaveBeenCalledWith('ai-tutor', {
      body: { ...explainRequest, variant: 'default' },
      timeout: AI_TUTOR_TIMEOUT_MS,
    });
  });

  it('rejects an invalid request locally', async () => {
    const { client, invoke } = clientWith(() => Promise.resolve({ data: aiSuccess(), error: null }));
    const result = await invokeAiTutor(client, { ...explainRequest, model: 'gemini-pro' } as never);
    expect(result).toEqual({ ok: false, error: { error: 'bad_request', message: '', retry_after_sec: null, quota: null } });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('reports a success body that breaks the contract as invalid_output', async () => {
    const { client } = clientWith(() => Promise.resolve({ data: { ...aiSuccess(), ai_generated: false }, error: null }));
    const result = await invokeAiTutor(client, explainRequest);
    expect(!result.ok && result.error.error).toBe('invalid_output');
  });

  it('parses the error body of an HTTP error', async () => {
    const body = aiError('quota_exceeded', { quota: quota(20, 20) });
    const { client } = clientWith(() => Promise.resolve({ data: null, error: httpError(429, body) }));
    expect(await invokeAiTutor(client, explainRequest)).toEqual({ ok: false, error: body });
  });

  it.each([
    [400, 'bad_request'],
    [401, 'unauthorized'],
    [429, 'quota_exceeded'],
    [500, 'ai_unavailable'],
    [503, 'ai_unavailable'],
  ] as const)('falls back to the HTTP status %i when the body is not an AI error', async (status, code) => {
    const { client } = clientWith(() => Promise.resolve({ data: null, error: httpError(status, '<html>oops</html>') }));
    const result = await invokeAiTutor(client, explainRequest);
    expect(result).toEqual({ ok: false, error: { error: code, message: '', retry_after_sec: null, quota: null } });
  });

  it('treats network, timeout and relay failures as ai_unavailable', async () => {
    const failures = [
      new FunctionsFetchError(new TypeError('Failed to fetch')),
      new FunctionsFetchError(new DOMException('signal timed out', 'AbortError')),
      new FunctionsRelayError(new Response('relay', { status: 502 })),
    ];
    for (const error of failures) {
      const { client } = clientWith(() => Promise.resolve({ data: null, error }));
      const result = await invokeAiTutor(client, explainRequest);
      expect(!result.ok && result.error.error).toBe('ai_unavailable');
    }
  });

  it('never throws when invoke itself throws', async () => {
    const { client } = clientWith(() => Promise.reject(new TypeError('Failed to fetch')));
    const result = await invokeAiTutor(client, explainRequest);
    expect(!result.ok && result.error.error).toBe('ai_unavailable');
  });
});
