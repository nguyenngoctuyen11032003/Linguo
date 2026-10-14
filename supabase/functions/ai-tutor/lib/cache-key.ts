import type { AiRequest } from '../../_shared/ai-contract.ts';

/** NFKC, trim, collapse whitespace; English is also lower-cased (Korean has no case). */
export function normalizeText(text: string | undefined | null, language: 'en' | 'ko'): string {
  if (text === undefined || text === null) return '';
  const s = text.normalize('NFKC').trim().replace(/\s+/g, ' ');
  return language === 'en' ? s.toLowerCase() : s;
}

/** Every field that changes the model output, in a fixed order (spec §3 step 6). */
function cacheFields(req: AiRequest): (string | number)[] {
  const n = (t: string | undefined) => normalizeText(t, req.language);
  const lesson = ('lesson_id' in req ? req.lesson_id : undefined) ?? '';
  switch (req.task) {
    case 'review_writing':
      // Never cached (personal essay); listed so the key stays total over every task.
      return [n(req.prompt), n(req.answer), JSON.stringify(req.rubric)];
    case 'analyze_sentence':
      return [n(req.sentence)];
    case 'summarize_session':
      // Never cached (one learner's session); listed so the key stays total over every task.
      return [req.minutes, JSON.stringify(req.activities), JSON.stringify(req.accuracy_by_stage), JSON.stringify(req.error_tags)];
    case 'plan_review':
      // Order-independent: the same gaps in any order give the same plan. Labels are part of the model input.
      return [
        JSON.stringify(
          [...req.gaps]
            .sort((a, b) => (a.kind + a.id < b.kind + b.id ? -1 : a.kind + a.id > b.kind + b.id ? 1 : 0))
            .map((g) => [g.kind, g.id, n(g.label), g.count]),
        ),
      ];
    case 'explain_concept':
      return [req.variant, n(req.concept), n(req.context), lesson];
    case 'generate_practice':
      return [req.skill, req.count, n(req.focus), lesson];
    case 'analyze_error':
      return [n(req.prompt), n(req.expected), n(req.answer), lesson];
  }
}

/** sha256 hex over task | prompt_version | model | language | level | task fields. */
export async function cacheKey(input: { promptVersion: string; model: string; request: AiRequest }): Promise<string> {
  const { request: req } = input;
  const material = JSON.stringify([req.task, input.promptVersion, input.model, req.language, req.level, ...cacheFields(req)]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
