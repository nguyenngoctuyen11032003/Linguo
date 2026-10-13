import type { AiError, AiRequestInput, AiSuccess } from '@linguo/shared';

export const USAGE_ID = '50000000-0000-4000-8000-000000000001';
export const RESETS_AT = '2026-10-13T17:00:00.000Z';

export const explainRequest: AiRequestInput = {
  task: 'explain_concept',
  language: 'en',
  level: 'a2',
  concept: 'present perfect',
};

export function quota(used = 3, limit = 20) {
  return { used, limit, resets_at: RESETS_AT };
}

export function aiSuccess(overrides: Partial<AiSuccess> = {}): AiSuccess {
  return {
    task: 'explain_concept',
    prompt_version: 'explain_concept@1',
    data: {
      summary: 'Thì hiện tại hoàn thành',
      explanation_md: 'Dùng **have + V3**.',
      examples: [{ target: 'I have eaten.', vi: 'Tôi đã ăn rồi.' }],
      common_mistakes: [],
      confidence: 'high',
      uncertainty: null,
    },
    cached: false,
    ai_generated: true,
    response_id: USAGE_ID,
    quota: quota(),
    ...overrides,
  };
}

export function aiError(code: AiError['error'], overrides: Partial<AiError> = {}): AiError {
  return { error: code, message: `server says ${code}`, retry_after_sec: null, quota: null, ...overrides };
}
