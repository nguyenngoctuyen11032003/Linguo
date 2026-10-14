import { PLAN_REVIEW_MAX_STEPS, type PlanReviewOutput, planReviewOutputSchema } from '../../../_shared/ai-contract.ts';
import { dataField, header, parseWith, type PromptModule, s, systemPrompt, wrongTask } from './shared.ts';

// Spec 8.2 #7: a short review plan (≤ 5 steps) from detected gaps. Each step is an action the app can do and
// its target is an id from the request: the model must not invent ids. validate() drops steps whose target is
// not in the input (and repairs the card count); an answer with no valid step left goes to the repair attempt.

/** Which gap kind each step kind may target. */
const STEP_GAP_KIND = { review_cards: 'tag', redo_lesson: 'lesson' } as const;
const DEFAULT_CARDS = 10;

export const planReview: PromptModule = {
  task: 'plan_review',
  version: 'plan_review@1',
  temperature: 0.3,
  maxOutputTokens: 900,
  system: systemPrompt([
    `Lập kế hoạch ôn tập ngắn (tối đa ${PLAN_REVIEW_MAX_STEPS} bước) từ danh sách lỗ hổng kiến thức được cung cấp, xếp bước quan trọng nhất lên trước.`,
    '`summary_vi`: 1–2 câu tiếng Việt nói nên ưu tiên điều gì và vì sao.',
    '`steps`: mỗi bước là một hành động ứng dụng có thể làm: `review_cards` (ôn N thẻ về một lỗ hổng loại tag, `cards` là số thẻ từ 1 đến 30) hoặc `redo_lesson` (học lại một bài, `cards` là null).',
    '`target`: PHẢI chép nguyên văn `id` của một lỗ hổng trong danh sách: `redo_lesson` chỉ với lỗ hổng loại lesson, `review_cards` chỉ với lỗ hổng loại tag. Tuyệt đối không tự tạo id, không dùng id nằm ngoài danh sách, không lặp lại cùng một đích.',
    '`reason_vi`: một câu tiếng Việt ngắn nêu lý do, dựa trên số lần sai được cung cấp (không bịa số liệu).',
    'Giọng nhẹ nhàng, không gây áp lực; không đề xuất hành động nào ngoài hai loại trên.',
  ]),
  responseSchema: s.obj({
    summary_vi: s.str(300),
    steps: s.arr(
      s.obj({
        kind: s.enum(['review_cards', 'redo_lesson']),
        target: s.str(64, 'id chép nguyên văn từ danh sách lỗ hổng'),
        cards: { type: 'INTEGER', nullable: true, description: 'review_cards: 1–30; redo_lesson: null' },
        reason_vi: s.str(200),
      }),
      1,
      PLAN_REVIEW_MAX_STEPS,
    ),
  }),
  buildUser(req) {
    if (req.task !== 'plan_review') return wrongTask('plan_review', req);
    // Labels are lesson titles / tag names from the client: kept inside the data block with the ids.
    const gaps = req.gaps.map((g) => `- [${g.kind}] id=${g.id} | ${g.label} | sai ${g.count} lần`).join('\n');
    return [
      'Nhiệm vụ: plan_review',
      ...header(req),
      ...dataField('Danh sách lỗ hổng (loại, id, nhãn, số lần sai)', gaps),
      '',
      'Trả về JSON đúng schema; mỗi `target` phải là một `id` ở trên, đúng loại.',
    ].join('\n');
  },
  // Same gaps at the same level give the same plan: cacheable by the hash of the input.
  cacheable: () => true,
  validate(data, req) {
    const parsed = parseWith(planReviewOutputSchema, data);
    if (!parsed.ok) return parsed;
    const out: PlanReviewOutput = parsed.data;
    if (!out.summary_vi.trim()) return { ok: false, error: 'summary_vi must not be empty' };
    if (req?.task !== 'plan_review') return { ok: true, data: out };

    const allowed = new Set(req.gaps.map((g) => `${g.kind}:${g.id}`));
    const seen = new Set<string>();
    const steps: PlanReviewOutput['steps'] = [];
    for (const step of out.steps) {
      const key = `${STEP_GAP_KIND[step.kind]}:${step.target}`;
      // Invented, mistyped or wrong-kind targets are dropped; so are repeated ones.
      if (!allowed.has(key) || seen.has(key) || !step.reason_vi.trim()) continue;
      seen.add(key);
      steps.push({
        ...step,
        cards: step.kind === 'review_cards' ? (step.cards ?? DEFAULT_CARDS) : null,
      });
    }
    if (steps.length === 0) return { ok: false, error: 'steps: no step targets an id from the request' };
    return { ok: true, data: { ...out, steps } };
  },
};
