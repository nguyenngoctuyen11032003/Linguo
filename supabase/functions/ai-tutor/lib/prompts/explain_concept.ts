import { type ExplainConceptOutput, explainConceptOutputSchema } from '../../../_shared/ai-contract.ts';
import { dataField, header, lessonBlock, parseWith, type PromptModule, requireTargetScript, s, systemPrompt, wrongTask } from './shared.ts';

const VARIANT_RULES = {
  default: 'Giải thích rõ ràng, đủ ý cho trình độ đã nêu.',
  simpler: 'Người học chưa hiểu lần trước: giải thích ĐƠN GIẢN HƠN, câu ngắn, ít thuật ngữ, ví dụ thật cơ bản.',
  different:
    'Người học muốn một CÁCH GIẢI THÍCH KHÁC: đổi góc nhìn (so sánh với tiếng Việt, phép ẩn dụ, quy tắc nhớ nhanh) và dùng ví dụ khác.',
} as const;

export const explainConcept: PromptModule = {
  task: 'explain_concept',
  version: 'explain_concept@1',
  temperature: 0.4,
  maxOutputTokens: 1200,
  system: systemPrompt([
    'Giải thích một từ, cấu trúc ngữ pháp hoặc câu mà người học hỏi.',
    '`summary`: một câu tiếng Việt tóm tắt ý chính.',
    '`explanation_md`: giải thích bằng tiếng Việt (Markdown đơn giản), gồm nghĩa, cách dùng, lưu ý quan trọng.',
    '`examples`: 2–4 ví dụ; `target` là câu bằng ngôn ngữ đích (tiếng Hàn phải viết bằng Hangul, tiếng Nhật phải viết bằng chữ Nhật: kana, kanji; tiếng Đức viết đúng chính tả có ä, ö, ü, ß, danh từ viết hoa và nêu rõ du hay Sie nếu cần), `vi` là bản dịch tiếng Việt tự nhiên.',
    '`common_mistakes`: tối đa 3 lỗi người Việt hay mắc, viết bằng tiếng Việt; để mảng rỗng nếu không có.',
    '`confidence`: mức độ chắc chắn của bạn (high/medium/low).',
    '`uncertainty`: nếu confidence không phải high, nêu ngắn điều bạn chưa chắc và khuyên xem lại nội dung bài học đã kiểm duyệt; nếu chắc chắn thì null.',
  ]),
  responseSchema: s.obj({
    summary: s.str(300),
    explanation_md: s.str(2000),
    examples: s.arr(s.obj({ target: s.str(300), vi: s.str(300) }), 0, 5),
    common_mistakes: s.arr(s.str(300), 0, 5),
    confidence: s.enum(['high', 'medium', 'low']),
    uncertainty: s.nullableStr(300),
  }),
  buildUser(req, ctx) {
    if (req.task !== 'explain_concept') return wrongTask('explain_concept', req);
    const lines = [
      'Nhiệm vụ: explain_concept',
      ...header(req),
      `Yêu cầu cách giải thích: ${VARIANT_RULES[req.variant]}`,
      ...lessonBlock(ctx.lessonContext),
      ...dataField('Điều người học muốn được giải thích', req.concept),
    ];
    if (req.context) lines.push(...dataField('Câu hoặc tình huống người học gặp', req.context));
    lines.push('', 'Trả về JSON đúng schema.');
    return lines.join('\n');
  },
  cacheable: () => true,
  validate(data, req) {
    const parsed = parseWith(explainConceptOutputSchema, data);
    if (!parsed.ok) return parsed;
    const out: ExplainConceptOutput = parsed.data;
    if (out.confidence === 'low' && !out.uncertainty?.trim()) return { ok: false, error: 'uncertainty is required when confidence is low' };
    if (!out.summary.trim() || !out.explanation_md.trim()) return { ok: false, error: 'summary and explanation_md must not be empty' };
    if (req) {
      for (const [i, ex] of out.examples.entries()) {
        const err = requireTargetScript(req.language, ex.target, `examples.${i}.target`);
        if (err) return { ok: false, error: err };
      }
    }
    return { ok: true, data: out };
  },
};
